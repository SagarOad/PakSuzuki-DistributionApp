using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Domain.Entities;

namespace PakSuzuki.Application.Features.IncentiveSchemes;

public record DistributorSchemeResultDto(
    Guid DistributorId,
    string DistributorName,
    string DistributorCode,
    string? RegionName,
    decimal CurrentLiters,
    decimal? AvgPerClosedMonth,
    int ClosedMonths,
    Guid? QualifyingSlabId,
    decimal? QualifyingTargetLiters,
    decimal? QualifyingIncentivePkr,
    decimal? PercentOfSalesIncentivePkr,
    List<MonthlyLiterRow> MonthlyCurrent,
    List<SchemeSlabDto> Slabs);

public record SchemeEvaluationDto(
    Guid SchemeId,
    string SchemeName,
    string SchemeType,
    string ProductGroupName,
    DateTime CurrentPeriodStartUtc,
    DateTime CurrentPeriodEndUtc,
    DateTime AsOfUtc,
    List<DistributorSchemeResultDto> Distributors);

public record EvaluateIncentiveSchemeQuery(Guid SchemeId, Guid? DistributorId = null, DateTime? AsOfUtc = null)
    : IRequest<SchemeEvaluationDto>;

public class EvaluateIncentiveSchemeQueryHandler : IRequestHandler<EvaluateIncentiveSchemeQuery, SchemeEvaluationDto>
{
    private readonly IApplicationDbContext _context;
    private readonly IIncentivePurchaseService _purchases;
    private readonly IDateTimeService _clock;

    public EvaluateIncentiveSchemeQueryHandler(
        IApplicationDbContext context, IIncentivePurchaseService purchases, IDateTimeService clock)
    {
        _context = context;
        _purchases = purchases;
        _clock = clock;
    }

    public async Task<SchemeEvaluationDto> Handle(EvaluateIncentiveSchemeQuery request, CancellationToken ct)
    {
        var scheme = await _context.IncentiveSchemes.AsNoTracking()
            .Include(s => s.ProductGroup).ThenInclude(g => g.Members).ThenInclude(m => m.Product).ThenInclude(p => p.CatalogProfile)
            .Include(s => s.Slabs)
            .Include(s => s.Participants)
            .FirstOrDefaultAsync(s => s.Id == request.SchemeId && !s.IsDeleted, ct)
            ?? throw new NotFoundException(nameof(IncentiveScheme), request.SchemeId);

        var productIds = scheme.ProductGroup.Members.Where(m => !m.IsDeleted).Select(m => m.ProductId).ToList();
        var litersPerCarton = IncentiveCalc.GroupLitersPerCarton(
            scheme.ProductGroup.Members.Where(m => !m.IsDeleted).Select(m => m.Product.CatalogProfile));

        var slabDtos = scheme.Slabs.Where(s => !s.IsDeleted).OrderBy(s => s.SortOrder).ThenBy(s => s.TargetLiters)
            .Select(s => new SchemeSlabDto(
                s.Id, s.TargetLiters, s.RatePerLiter, s.FixedBonusPkr, s.SortOrder,
                IncentiveCalc.ComputeSlabIncentive(s.TargetLiters, s.RatePerLiter, s.FixedBonusPkr),
                IncentiveCalc.ComputeCartons(s.TargetLiters, litersPerCarton)))
            .ToList();

        var participantIds = scheme.Participants.Where(p => !p.IsDeleted).Select(p => p.DistributorId).ToHashSet();

        var asOf = request.AsOfUtc ?? _clock.UtcNow;
        var distributors = await _context.Distributors.AsNoTracking()
            .Include(d => d.Region)
            .Where(d => d.IsActive && d.ApprovalStatus == Domain.Enums.ApprovalStatus.Approved)
            .Where(d => participantIds.Contains(d.Id))
            .Where(d => request.DistributorId == null || d.Id == request.DistributorId)
            .OrderBy(d => d.Name)
            .ToListAsync(ct);

        var results = new List<DistributorSchemeResultDto>();
        foreach (var d in distributors)
        {
            var current = await _purchases.SumLitersAsync(
                d.Id, productIds, scheme.CurrentPeriodStartUtc, scheme.CurrentPeriodEndUtc, ct);

            var monthly = await _purchases.MonthlyLitersAsync(
                d.Id, productIds, scheme.CurrentPeriodStartUtc, scheme.CurrentPeriodEndUtc, ct);

            var closed = IncentiveCalc.CountClosedMonths(
                scheme.CurrentPeriodStartUtc, scheme.CurrentPeriodEndUtc, asOf);
            var avg = IncentiveCalc.AveragePerClosedMonth(
                current, scheme.CurrentPeriodStartUtc, scheme.CurrentPeriodEndUtc, asOf);

            Guid? qId = null;
            decimal? qTarget = null;
            decimal? qIncentive = null;
            decimal? pctIncentive = null;

            if (scheme.SchemeType == IncentiveSchemeTypes.Slab)
            {
                var q = IncentiveCalc.QualifyingSlab(scheme.Slabs.Where(s => !s.IsDeleted), current);
                if (q != null)
                {
                    qId = q.Id;
                    qTarget = q.TargetLiters;
                    qIncentive = IncentiveCalc.ComputeSlabIncentive(q.TargetLiters, q.RatePerLiter, q.FixedBonusPkr);
                }
            }
            else if (scheme.SchemeType == IncentiveSchemeTypes.PercentOfSales
                     && scheme.PercentOfSalesRate is decimal rate)
            {
                // Admin enters e.g. 12 for “12% of total sales (PKR)” in the period.
                var sales = await _purchases.SumSalesPkrAsync(
                    d.Id, productIds, scheme.CurrentPeriodStartUtc, scheme.CurrentPeriodEndUtc, ct);
                pctIncentive = Math.Round(sales * (rate / 100m), 2, MidpointRounding.AwayFromZero);
            }

            results.Add(new DistributorSchemeResultDto(
                d.Id, d.Name, d.DistributorCode, d.Region?.Name,
                current, avg, closed,
                qId, qTarget, qIncentive, pctIncentive,
                monthly.ToList(), slabDtos));
        }

        return new SchemeEvaluationDto(
            scheme.Id, scheme.Name, scheme.SchemeType, scheme.ProductGroup.Name,
            scheme.CurrentPeriodStartUtc, scheme.CurrentPeriodEndUtc,
            asOf, results);
    }
}

public record IncentiveSignatoriesDto(string? PreparedBy, string? CheckedBy, string? ApprovedBy);

public record GetIncentiveSignatoriesQuery : IRequest<IncentiveSignatoriesDto>;

public class GetIncentiveSignatoriesQueryHandler : IRequestHandler<GetIncentiveSignatoriesQuery, IncentiveSignatoriesDto>
{
    public const string PreparedKey = "Incentive:SignatoryPreparedBy";
    public const string CheckedKey = "Incentive:SignatoryCheckedBy";
    public const string ApprovedKey = "Incentive:SignatoryApprovedBy";

    private readonly IApplicationDbContext _context;
    public GetIncentiveSignatoriesQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<IncentiveSignatoriesDto> Handle(GetIncentiveSignatoriesQuery request, CancellationToken ct)
    {
        var keys = new[] { PreparedKey, CheckedKey, ApprovedKey };
        var rows = await _context.SystemSettings.AsNoTracking()
            .Where(s => keys.Contains(s.Key))
            .ToDictionaryAsync(s => s.Key, s => s.Value, ct);
        return new IncentiveSignatoriesDto(
            rows.GetValueOrDefault(PreparedKey),
            rows.GetValueOrDefault(CheckedKey),
            rows.GetValueOrDefault(ApprovedKey));
    }
}

public record UpdateIncentiveSignatoriesCommand(string? PreparedBy, string? CheckedBy, string? ApprovedBy) : IRequest;

public class UpdateIncentiveSignatoriesCommandHandler : IRequestHandler<UpdateIncentiveSignatoriesCommand>
{
    private readonly IApplicationDbContext _context;
    public UpdateIncentiveSignatoriesCommandHandler(IApplicationDbContext context) => _context = context;

    public async Task Handle(UpdateIncentiveSignatoriesCommand request, CancellationToken ct)
    {
        await Upsert(GetIncentiveSignatoriesQueryHandler.PreparedKey, request.PreparedBy, ct);
        await Upsert(GetIncentiveSignatoriesQueryHandler.CheckedKey, request.CheckedBy, ct);
        await Upsert(GetIncentiveSignatoriesQueryHandler.ApprovedKey, request.ApprovedBy, ct);
        await _context.SaveChangesAsync(ct);
    }

    private async Task Upsert(string key, string? value, CancellationToken ct)
    {
        var row = await _context.SystemSettings.FirstOrDefaultAsync(s => s.Key == key, ct);
        if (row is null)
        {
            row = new SystemSetting { Key = key };
            _context.SystemSettings.Add(row);
        }
        row.Value = value?.Trim() ?? "";
    }
}
