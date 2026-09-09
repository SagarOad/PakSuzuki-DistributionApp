using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Common.Models;
using PakSuzuki.Domain.Entities;

namespace PakSuzuki.Application.Features.IncentiveSchemes;

public record SchemeSlabDto(
    Guid Id,
    decimal TargetLiters,
    decimal RatePerLiter,
    decimal FixedBonusPkr,
    int SortOrder,
    decimal ComputedIncentivePkr,
    decimal? ComputedCartons);

public record SchemeListDto(
    Guid Id, string Name, string SchemeType, string ProductGroupName,
    DateTime CurrentPeriodStartUtc, DateTime CurrentPeriodEndUtc, bool IsActive, int ParticipantCount);

public record SchemeDistributorDto(Guid DistributorId, string DistributorName, string DistributorCode);

public record SchemeDetailDto(
    Guid Id,
    string Name,
    string? Description,
    Guid ProductGroupId,
    string ProductGroupName,
    string SchemeType,
    DateTime CurrentPeriodStartUtc,
    DateTime CurrentPeriodEndUtc,
    decimal? PercentOfSalesRate,
    bool IsActive,
    decimal GroupLitersPerCarton,
    List<SchemeSlabDto> Slabs,
    List<SchemeDistributorDto> Distributors);

public record SchemeSlabInput(decimal TargetLiters, decimal RatePerLiter, decimal FixedBonusPkr, int SortOrder);

public record GetIncentiveSchemesQuery(string? Search, int PageNumber = 1, int PageSize = 50)
    : IRequest<PaginatedList<SchemeListDto>>;

public class GetIncentiveSchemesQueryHandler : IRequestHandler<GetIncentiveSchemesQuery, PaginatedList<SchemeListDto>>
{
    private readonly IApplicationDbContext _context;
    public GetIncentiveSchemesQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<PaginatedList<SchemeListDto>> Handle(GetIncentiveSchemesQuery request, CancellationToken ct)
    {
        var q = _context.IncentiveSchemes.AsNoTracking()
            .Include(s => s.ProductGroup)
            .Where(s => !s.IsDeleted);
        if (!string.IsNullOrWhiteSpace(request.Search))
            q = q.Where(s => s.Name.Contains(request.Search) || s.ProductGroup.Name.Contains(request.Search));

        var total = await q.CountAsync(ct);
        var page = await q.OrderByDescending(s => s.CurrentPeriodStartUtc)
            .Skip((request.PageNumber - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(s => new SchemeListDto(
                s.Id, s.Name, s.SchemeType, s.ProductGroup.Name,
                s.CurrentPeriodStartUtc, s.CurrentPeriodEndUtc, s.IsActive,
                s.Participants.Count(p => !p.IsDeleted)))
            .ToListAsync(ct);
        return new PaginatedList<SchemeListDto>(page, total, request.PageNumber, request.PageSize);
    }
}

public record GetIncentiveSchemeByIdQuery(Guid Id) : IRequest<SchemeDetailDto>;

public class GetIncentiveSchemeByIdQueryHandler : IRequestHandler<GetIncentiveSchemeByIdQuery, SchemeDetailDto>
{
    private readonly IApplicationDbContext _context;
    public GetIncentiveSchemeByIdQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<SchemeDetailDto> Handle(GetIncentiveSchemeByIdQuery request, CancellationToken ct)
    {
        var s = await _context.IncentiveSchemes.AsNoTracking()
            .Include(x => x.ProductGroup).ThenInclude(g => g.Members).ThenInclude(m => m.Product).ThenInclude(p => p.CatalogProfile)
            .Include(x => x.Slabs)
            .Include(x => x.Participants).ThenInclude(p => p.Distributor)
            .FirstOrDefaultAsync(x => x.Id == request.Id && !x.IsDeleted, ct)
            ?? throw new NotFoundException(nameof(IncentiveScheme), request.Id);

        var litersPerCarton = IncentiveCalc.GroupLitersPerCarton(
            s.ProductGroup.Members.Where(m => !m.IsDeleted).Select(m => m.Product.CatalogProfile));

        var slabs = s.Slabs.Where(x => !x.IsDeleted).OrderBy(x => x.SortOrder).ThenBy(x => x.TargetLiters)
            .Select(x => new SchemeSlabDto(
                x.Id, x.TargetLiters, x.RatePerLiter, x.FixedBonusPkr, x.SortOrder,
                IncentiveCalc.ComputeSlabIncentive(x.TargetLiters, x.RatePerLiter, x.FixedBonusPkr),
                IncentiveCalc.ComputeCartons(x.TargetLiters, litersPerCarton)))
            .ToList();

        var distributors = s.Participants.Where(p => !p.IsDeleted)
            .OrderBy(p => p.Distributor.Name)
            .Select(p => new SchemeDistributorDto(p.DistributorId, p.Distributor.Name, p.Distributor.DistributorCode))
            .ToList();

        return new SchemeDetailDto(
            s.Id, s.Name, s.Description, s.ProductGroupId, s.ProductGroup.Name, s.SchemeType,
            s.CurrentPeriodStartUtc, s.CurrentPeriodEndUtc,
            s.PercentOfSalesRate, s.IsActive, litersPerCarton, slabs, distributors);
    }
}

public record UpsertIncentiveSchemeCommand(
    Guid? Id,
    string Name,
    string? Description,
    Guid ProductGroupId,
    string SchemeType,
    DateTime CurrentPeriodStartUtc,
    DateTime CurrentPeriodEndUtc,
    decimal? PercentOfSalesRate,
    bool IsActive,
    List<Guid> DistributorIds,
    List<SchemeSlabInput>? Slabs) : IRequest<Guid>;

public class UpsertIncentiveSchemeCommandValidator : AbstractValidator<UpsertIncentiveSchemeCommand>
{
    public UpsertIncentiveSchemeCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.ProductGroupId).NotEmpty();
        RuleFor(x => x.SchemeType).Must(t => IncentiveSchemeTypes.All.Contains(t))
            .WithMessage("Scheme type must be Slab, PercentOfSales, or TrackingOnly.");
        RuleFor(x => x.CurrentPeriodEndUtc).GreaterThan(x => x.CurrentPeriodStartUtc);
        RuleFor(x => x.DistributorIds).NotEmpty().WithMessage("Select at least one distributor.");
        RuleFor(x => x.PercentOfSalesRate).GreaterThanOrEqualTo(0).When(x => x.PercentOfSalesRate != null);
        RuleForEach(x => x.Slabs).ChildRules(s =>
        {
            s.RuleFor(i => i.TargetLiters).GreaterThan(0);
            s.RuleFor(i => i.RatePerLiter).GreaterThanOrEqualTo(0);
            s.RuleFor(i => i.FixedBonusPkr).GreaterThanOrEqualTo(0);
        }).When(x => x.Slabs != null);
    }
}

public class UpsertIncentiveSchemeCommandHandler : IRequestHandler<UpsertIncentiveSchemeCommand, Guid>
{
    private readonly IApplicationDbContext _context;
    private readonly IAppNotificationService _notifications;

    public UpsertIncentiveSchemeCommandHandler(
        IApplicationDbContext context, IAppNotificationService notifications)
    {
        _context = context;
        _notifications = notifications;
    }

    public async Task<Guid> Handle(UpsertIncentiveSchemeCommand request, CancellationToken ct)
    {
        _ = await _context.ProductGroups.FirstOrDefaultAsync(g => g.Id == request.ProductGroupId && !g.IsDeleted, ct)
            ?? throw new NotFoundException(nameof(ProductGroup), request.ProductGroupId);

        if (request.SchemeType == IncentiveSchemeTypes.Slab
            && (request.Slabs is null || request.Slabs.Count == 0))
            throw new ConflictException("Slab schemes require at least one slab.");

        var distributorIds = request.DistributorIds.Distinct().ToList();
        var validCount = await _context.Distributors.CountAsync(
            d => distributorIds.Contains(d.Id) && d.IsActive && d.ApprovalStatus == Domain.Enums.ApprovalStatus.Approved, ct);
        if (validCount != distributorIds.Count)
            throw new ConflictException("One or more selected distributors are invalid or not approved.");

        IncentiveScheme scheme;
        HashSet<Guid> previousParticipantIds = new();
        if (request.Id is Guid id)
        {
            scheme = await _context.IncentiveSchemes
                .Include(s => s.Slabs)
                .Include(s => s.Participants)
                .FirstOrDefaultAsync(s => s.Id == id && !s.IsDeleted, ct)
                ?? throw new NotFoundException(nameof(IncentiveScheme), id);
            previousParticipantIds = scheme.Participants
                .Where(p => !p.IsDeleted)
                .Select(p => p.DistributorId)
                .ToHashSet();
        }
        else
        {
            scheme = new IncentiveScheme();
            _context.IncentiveSchemes.Add(scheme);
        }

        scheme.Name = request.Name.Trim();
        scheme.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        scheme.ProductGroupId = request.ProductGroupId;
        scheme.SchemeType = request.SchemeType;
        scheme.CurrentPeriodStartUtc = DateTime.SpecifyKind(request.CurrentPeriodStartUtc.Date, DateTimeKind.Utc);
        scheme.CurrentPeriodEndUtc = DateTime.SpecifyKind(request.CurrentPeriodEndUtc.Date.AddDays(1).AddTicks(-1), DateTimeKind.Utc);
        scheme.PercentOfSalesRate = request.SchemeType == IncentiveSchemeTypes.PercentOfSales
            ? request.PercentOfSalesRate
            : null;
        scheme.IsActive = request.IsActive;

        foreach (var old in scheme.Slabs.ToList())
            _context.IncentiveSchemeSlabs.Remove(old);

        if (request.SchemeType == IncentiveSchemeTypes.Slab && request.Slabs is { Count: > 0 })
        {
            var order = 0;
            foreach (var row in request.Slabs.OrderBy(s => s.SortOrder).ThenBy(s => s.TargetLiters))
            {
                scheme.Slabs.Add(new IncentiveSchemeSlab
                {
                    TargetLiters = row.TargetLiters,
                    RatePerLiter = row.RatePerLiter,
                    FixedBonusPkr = row.FixedBonusPkr,
                    SortOrder = order++
                });
            }
        }

        foreach (var old in scheme.Participants.ToList())
            _context.IncentiveSchemeDistributors.Remove(old);

        foreach (var distributorId in distributorIds)
        {
            scheme.Participants.Add(new IncentiveSchemeDistributor
            {
                DistributorId = distributorId
            });
        }

        await _context.SaveChangesAsync(ct);

        var newlyAssigned = distributorIds.Where(id => !previousParticipantIds.Contains(id)).ToList();
        var link = $"/incentives";
        foreach (var distributorId in newlyAssigned)
        {
            await _notifications.NotifyDistributorAsync(
                distributorId,
                "Incentive scheme assigned",
                $"You have been added to incentive scheme \"{scheme.Name}\".",
                NotificationCategories.Incentive,
                link,
                scheme.Id,
                ct);
        }

        return scheme.Id;
    }
}

public record DeleteIncentiveSchemeCommand(Guid Id) : IRequest;

public class DeleteIncentiveSchemeCommandHandler : IRequestHandler<DeleteIncentiveSchemeCommand>
{
    private readonly IApplicationDbContext _context;
    public DeleteIncentiveSchemeCommandHandler(IApplicationDbContext context) => _context = context;

    public async Task Handle(DeleteIncentiveSchemeCommand request, CancellationToken ct)
    {
        var s = await _context.IncentiveSchemes.FirstOrDefaultAsync(x => x.Id == request.Id && !x.IsDeleted, ct)
            ?? throw new NotFoundException(nameof(IncentiveScheme), request.Id);
        s.IsDeleted = true;
        s.DeletedAtUtc = DateTime.UtcNow;
        await _context.SaveChangesAsync(ct);
    }
}

public record PreviewSlabIncentiveQuery(
    decimal TargetLiters, decimal RatePerLiter, decimal FixedBonusPkr, Guid? ProductGroupId)
    : IRequest<SchemeSlabDto>;

public class PreviewSlabIncentiveQueryHandler : IRequestHandler<PreviewSlabIncentiveQuery, SchemeSlabDto>
{
    private readonly IApplicationDbContext _context;
    public PreviewSlabIncentiveQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<SchemeSlabDto> Handle(PreviewSlabIncentiveQuery request, CancellationToken ct)
    {
        decimal litersPerCarton = 0;
        if (request.ProductGroupId is Guid gid)
        {
            var members = await _context.ProductGroupMembers.AsNoTracking()
                .Include(m => m.Product).ThenInclude(p => p.CatalogProfile)
                .Where(m => m.ProductGroupId == gid && !m.IsDeleted)
                .ToListAsync(ct);
            litersPerCarton = IncentiveCalc.GroupLitersPerCarton(members.Select(m => m.Product.CatalogProfile));
        }

        return new SchemeSlabDto(
            Guid.Empty,
            request.TargetLiters,
            request.RatePerLiter,
            request.FixedBonusPkr,
            0,
            IncentiveCalc.ComputeSlabIncentive(request.TargetLiters, request.RatePerLiter, request.FixedBonusPkr),
            IncentiveCalc.ComputeCartons(request.TargetLiters, litersPerCarton));
    }
}

public record DistributorPeriodStatDto(
    Guid DistributorId,
    string DistributorName,
    string DistributorCode,
    decimal CurrentLiters,
    decimal? AvgPerClosedMonth,
    decimal? AvgCartonsPerClosedMonth,
    decimal? ProjectedPeriodLiters,
    decimal? ProjectedPeriodCartons);

public record PeriodPurchaseStatsDto(
    Guid ProductGroupId,
    string ProductGroupName,
    DateTime PeriodStartUtc,
    DateTime PeriodEndUtc,
    DateTime AsOfUtc,
    int ClosedMonths,
    int PeriodMonthSpan,
    decimal GroupLitersPerCarton,
    decimal NetworkCurrentLiters,
    decimal? NetworkAvgPerClosedMonth,
    decimal? NetworkProjectedPeriodLiters,
    decimal? NetworkProjectedPeriodCartons,
    List<DistributorPeriodStatDto> Distributors);

/// <summary>
/// Live purchase stats for a product group + period — used while designing slab targets.
/// Avg/month uses only closed months so far (e.g. 2 of 6).
/// </summary>
public record PreviewPeriodPurchaseStatsQuery(
    Guid ProductGroupId,
    DateTime PeriodStartUtc,
    DateTime PeriodEndUtc,
    DateTime? AsOfUtc = null) : IRequest<PeriodPurchaseStatsDto>;

public class PreviewPeriodPurchaseStatsQueryHandler
    : IRequestHandler<PreviewPeriodPurchaseStatsQuery, PeriodPurchaseStatsDto>
{
    private readonly IApplicationDbContext _context;
    private readonly IIncentivePurchaseService _purchases;
    private readonly IDateTimeService _clock;

    public PreviewPeriodPurchaseStatsQueryHandler(
        IApplicationDbContext context, IIncentivePurchaseService purchases, IDateTimeService clock)
    {
        _context = context;
        _purchases = purchases;
        _clock = clock;
    }

    public async Task<PeriodPurchaseStatsDto> Handle(PreviewPeriodPurchaseStatsQuery request, CancellationToken ct)
    {
        var group = await _context.ProductGroups.AsNoTracking()
            .Include(g => g.Members).ThenInclude(m => m.Product).ThenInclude(p => p.CatalogProfile)
            .FirstOrDefaultAsync(g => g.Id == request.ProductGroupId && !g.IsDeleted, ct)
            ?? throw new NotFoundException(nameof(ProductGroup), request.ProductGroupId);

        var productIds = group.Members.Where(m => !m.IsDeleted).Select(m => m.ProductId).ToList();
        var litersPerCarton = IncentiveCalc.GroupLitersPerCarton(
            group.Members.Where(m => !m.IsDeleted).Select(m => m.Product.CatalogProfile));

        var start = DateTime.SpecifyKind(request.PeriodStartUtc.Date, DateTimeKind.Utc);
        var end = DateTime.SpecifyKind(request.PeriodEndUtc.Date.AddDays(1).AddTicks(-1), DateTimeKind.Utc);
        var asOf = request.AsOfUtc ?? _clock.UtcNow;

        var closed = IncentiveCalc.CountClosedMonths(start, end, asOf);
        var periodSpan = ((end.Year - start.Year) * 12) + end.Month - start.Month + 1;
        if (periodSpan < 1) periodSpan = 1;

        var distributors = await _context.Distributors.AsNoTracking()
            .Where(d => d.IsActive && d.ApprovalStatus == Domain.Enums.ApprovalStatus.Approved)
            .OrderBy(d => d.Name)
            .ToListAsync(ct);

        var rows = new List<DistributorPeriodStatDto>();
        decimal networkLiters = 0;

        foreach (var d in distributors)
        {
            var liters = await _purchases.SumLitersAsync(d.Id, productIds, start, end, ct);
            networkLiters += liters;
            var avg = IncentiveCalc.AveragePerClosedMonth(liters, start, end, asOf);
            var avgCartons = avg is decimal a && litersPerCarton > 0
                ? IncentiveCalc.ComputeCartons(a, litersPerCarton)
                : null;
            var projected = avg is decimal av ? Math.Round(av * periodSpan, 4, MidpointRounding.AwayFromZero) : (decimal?)null;
            var projectedCartons = projected is decimal pl && litersPerCarton > 0
                ? IncentiveCalc.ComputeCartons(pl, litersPerCarton)
                : null;

            rows.Add(new DistributorPeriodStatDto(
                d.Id, d.Name, d.DistributorCode, liters, avg, avgCartons, projected, projectedCartons));
        }

        var networkAvg = IncentiveCalc.AveragePerClosedMonth(networkLiters, start, end, asOf);
        var networkProjected = networkAvg is decimal na
            ? Math.Round(na * periodSpan, 4, MidpointRounding.AwayFromZero)
            : (decimal?)null;
        var networkProjectedCartons = networkProjected is decimal np && litersPerCarton > 0
            ? IncentiveCalc.ComputeCartons(np, litersPerCarton)
            : null;

        return new PeriodPurchaseStatsDto(
            group.Id, group.Name, start, end, asOf, closed, periodSpan, litersPerCarton,
            Math.Round(networkLiters, 4, MidpointRounding.AwayFromZero),
            networkAvg, networkProjected, networkProjectedCartons,
            rows);
    }
}
