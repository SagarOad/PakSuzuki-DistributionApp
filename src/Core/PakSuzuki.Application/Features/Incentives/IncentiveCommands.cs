using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Common.Models;
using PakSuzuki.Domain.Entities;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Incentives;

public record IncentiveSlabDto(decimal MinPercent, decimal MaxPercent, decimal IncentivePercent);

public record IncentiveParticipantInputDto(Guid? DistributorId, Guid? RetailerId, decimal TargetValue);

public record IncentiveListDto(
    Guid Id, string Name, string? Description, string CriteriaType,
    DateTime StartDateUtc, DateTime EndDateUtc, bool IsActive, DateTime CreatedAtUtc);

public record IncentiveParticipantRowDto(
    Guid Id, string Kind, Guid? DistributorId, Guid? RetailerId, string Name, string RegionName,
    decimal TargetValue, decimal AchievedValue, decimal AchievementPercent, decimal Remaining,
    decimal IncentivePercent, decimal IncentiveAmount, string ApprovalStatus);

public record IncentiveDetailDto(
    Guid Id, string Name, string? Description, string CriteriaType,
    decimal TotalTarget, decimal TotalAchieved, decimal AchievementRate,
    int DistributorCount, int RetailerCount,
    DateTime StartDateUtc, DateTime EndDateUtc, bool IsActive,
    List<IncentiveSlabDto> Slabs, List<IncentiveParticipantRowDto> Participants);

public record CreateIncentiveCommand(
    string Name, string? Description, string CriteriaType,
    DateTime StartDateUtc, DateTime EndDateUtc,
    List<IncentiveSlabDto> Slabs, List<IncentiveParticipantInputDto> Participants
) : IRequest<Guid>;

public record UpdateIncentiveCommand(
    Guid Id, string Name, string? Description, string CriteriaType,
    DateTime StartDateUtc, DateTime EndDateUtc, bool IsActive,
    List<IncentiveSlabDto> Slabs, List<IncentiveParticipantInputDto> Participants
) : IRequest;

public record DeleteIncentiveCommand(Guid Id) : IRequest;

public record GetIncentivesQuery(string? Search, int PageNumber = 1, int PageSize = 20)
    : IRequest<PaginatedList<IncentiveListDto>>;

public record GetIncentiveByIdQuery(Guid Id) : IRequest<IncentiveDetailDto>;

public record SendParticipantForApprovalCommand(Guid IncentiveId, Guid ParticipantId) : IRequest;

public class CreateIncentiveCommandValidator : AbstractValidator<CreateIncentiveCommand>
{
    private static readonly string[] Allowed = { "Liters", "Cartons", "Amount" };

    public CreateIncentiveCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.CriteriaType).Must(t => Allowed.Contains(t))
            .WithMessage("CriteriaType must be Liters, Cartons, or Amount.");
        RuleFor(x => x.EndDateUtc).GreaterThan(x => x.StartDateUtc);
        RuleFor(x => x.Slabs).NotEmpty();
        RuleFor(x => x.Participants).NotEmpty()
            .WithMessage("Select at least one distributor or retailer.");
        RuleForEach(x => x.Slabs).ChildRules(s =>
        {
            s.RuleFor(i => i.MinPercent).GreaterThanOrEqualTo(0);
            s.RuleFor(i => i.MaxPercent).GreaterThan(i => i.MinPercent);
            s.RuleFor(i => i.IncentivePercent).GreaterThanOrEqualTo(0);
        });
        RuleForEach(x => x.Participants).ChildRules(p =>
        {
            p.RuleFor(i => i.TargetValue).GreaterThan(0);
            p.RuleFor(i => i).Must(i => i.DistributorId.HasValue ^ i.RetailerId.HasValue)
                .WithMessage("Each participant must be either a distributor or a retailer.");
        });
    }
}

public class GetIncentivesQueryHandler : IRequestHandler<GetIncentivesQuery, PaginatedList<IncentiveListDto>>
{
    private readonly IApplicationDbContext _context;
    public GetIncentivesQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<PaginatedList<IncentiveListDto>> Handle(GetIncentivesQuery request, CancellationToken ct)
    {
        var query = _context.Incentives.AsQueryable();
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.Trim();
            query = query.Where(i => i.Name.Contains(s) || (i.Description != null && i.Description.Contains(s)));
        }

        var projected = query
            .OrderByDescending(i => i.CreatedAtUtc)
            .Select(i => new IncentiveListDto(
                i.Id, i.Name, i.Description, i.CriteriaType,
                i.StartDateUtc, i.EndDateUtc, i.IsActive, i.CreatedAtUtc));

        return await PaginatedList<IncentiveListDto>.CreateAsync(projected, request.PageNumber, request.PageSize);
    }
}

public class GetIncentiveByIdQueryHandler : IRequestHandler<GetIncentiveByIdQuery, IncentiveDetailDto>
{
    private readonly IApplicationDbContext _context;
    public GetIncentiveByIdQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<IncentiveDetailDto> Handle(GetIncentiveByIdQuery request, CancellationToken ct)
    {
        var incentive = await _context.Incentives
            .Include(i => i.Slabs)
            .Include(i => i.Participants)
            .FirstOrDefaultAsync(i => i.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Incentive), request.Id);

        var distributorIds = incentive.Participants.Where(p => p.DistributorId != null).Select(p => p.DistributorId!.Value).ToList();
        var retailerIds = incentive.Participants.Where(p => p.RetailerId != null).Select(p => p.RetailerId!.Value).ToList();

        var distributors = await _context.Distributors
            .Where(d => distributorIds.Contains(d.Id))
            .Select(d => new { d.Id, d.Name, Region = d.Region.Name })
            .ToDictionaryAsync(d => d.Id, ct);

        var retailers = await _context.Retailers
            .Where(r => retailerIds.Contains(r.Id))
            .Select(r => new { r.Id, r.Name, Region = r.Distributor.Region.Name })
            .ToDictionaryAsync(r => r.Id, ct);

        var slabs = incentive.Slabs.OrderBy(s => s.SortOrder).ThenBy(s => s.MinPercent)
            .Select(s => new IncentiveSlabDto(s.MinPercent, s.MaxPercent, s.IncentivePercent))
            .ToList();

        var rows = new List<IncentiveParticipantRowDto>();
        foreach (var p in incentive.Participants)
        {
            string name;
            string region;
            string kind;
            if (p.DistributorId is Guid did && distributors.TryGetValue(did, out var d))
            {
                name = d.Name; region = d.Region; kind = "Distributor";
            }
            else if (p.RetailerId is Guid rid && retailers.TryGetValue(rid, out var r))
            {
                name = r.Name; region = r.Region; kind = "Retailer";
            }
            else
            {
                name = "Unknown"; region = "—"; kind = p.DistributorId != null ? "Distributor" : "Retailer";
            }

            var achievement = p.TargetValue <= 0 ? 0 : Math.Round(p.AchievedValue / p.TargetValue * 100, 1);
            var incentivePct = ResolveSlabPercent(slabs, achievement);
            var incentiveAmt = Math.Round(p.AchievedValue * incentivePct / 100m, 2);
            var remaining = p.TargetValue - p.AchievedValue;

            rows.Add(new IncentiveParticipantRowDto(
                p.Id, kind, p.DistributorId, p.RetailerId, name, region,
                p.TargetValue, p.AchievedValue, achievement, remaining,
                incentivePct, incentiveAmt, p.ApprovalStatus));
        }

        var totalTarget = incentive.Participants.Sum(p => p.TargetValue);
        var totalAchieved = incentive.Participants.Sum(p => p.AchievedValue);
        var rate = totalTarget <= 0 ? 0 : Math.Round(totalAchieved / totalTarget * 100, 1);

        return new IncentiveDetailDto(
            incentive.Id, incentive.Name, incentive.Description, incentive.CriteriaType,
            totalTarget, totalAchieved, rate,
            incentive.Participants.Count(p => p.DistributorId != null),
            incentive.Participants.Count(p => p.RetailerId != null),
            incentive.StartDateUtc, incentive.EndDateUtc, incentive.IsActive,
            slabs, rows.OrderBy(r => r.Kind).ThenBy(r => r.Name).ToList());
    }

    internal static decimal ResolveSlabPercent(IReadOnlyList<IncentiveSlabDto> slabs, decimal achievementPercent)
    {
        var match = slabs.FirstOrDefault(s => achievementPercent >= s.MinPercent && achievementPercent <= s.MaxPercent);
        if (match != null) return match.IncentivePercent;
        // If above highest slab max, use that slab's rate
        var top = slabs.OrderByDescending(s => s.MaxPercent).FirstOrDefault();
        if (top != null && achievementPercent > top.MaxPercent) return top.IncentivePercent;
        return 0;
    }
}

public class CreateIncentiveCommandHandler : IRequestHandler<CreateIncentiveCommand, Guid>
{
    private readonly IApplicationDbContext _context;
    public CreateIncentiveCommandHandler(IApplicationDbContext context) => _context = context;

    public async Task<Guid> Handle(CreateIncentiveCommand request, CancellationToken ct)
    {
        await ValidateParticipantsExistAsync(request.Participants, ct);

        var totalTarget = request.Participants.Sum(p => p.TargetValue);
        var incentive = new Incentive
        {
            Name = request.Name.Trim(),
            Description = request.Description?.Trim(),
            CriteriaType = request.CriteriaType,
            ThresholdValue = totalTarget,
            StartDateUtc = request.StartDateUtc.Date,
            EndDateUtc = request.EndDateUtc.Date,
            IsActive = true
        };

        ApplySlabs(incentive, request.Slabs);
        ApplyParticipants(incentive, request.Participants);

        _context.Incentives.Add(incentive);
        await _context.SaveChangesAsync(ct);
        return incentive.Id;
    }

    private async Task ValidateParticipantsExistAsync(List<IncentiveParticipantInputDto> participants, CancellationToken ct)
    {
        var distIds = participants.Where(p => p.DistributorId != null).Select(p => p.DistributorId!.Value).Distinct().ToList();
        var retIds = participants.Where(p => p.RetailerId != null).Select(p => p.RetailerId!.Value).Distinct().ToList();

        if (distIds.Count > 0)
        {
            var found = await _context.Distributors.CountAsync(d => distIds.Contains(d.Id) && d.ApprovalStatus == ApprovalStatus.Approved, ct);
            if (found != distIds.Count) throw new ConflictException("One or more selected distributors are invalid or not approved.");
        }

        if (retIds.Count > 0)
        {
            var found = await _context.Retailers.CountAsync(r =>
                retIds.Contains(r.Id)
                && r.DistributorApprovalStatus == ApprovalStatus.Approved
                && r.SuperAdminApprovalStatus == ApprovalStatus.Approved, ct);
            if (found != retIds.Count) throw new ConflictException("One or more selected retailers are invalid or not fully approved.");
        }
    }

    internal static void ApplySlabs(Incentive incentive, List<IncentiveSlabDto> slabs)
    {
        incentive.Slabs.Clear();
        var order = 0;
        foreach (var s in slabs.OrderBy(x => x.MinPercent))
        {
            incentive.Slabs.Add(new IncentiveAchievementSlab
            {
                MinPercent = s.MinPercent,
                MaxPercent = s.MaxPercent,
                IncentivePercent = s.IncentivePercent,
                SortOrder = order++
            });
        }
    }

    internal static void ApplyParticipants(Incentive incentive, List<IncentiveParticipantInputDto> participants)
    {
        incentive.Participants.Clear();
        foreach (var p in participants)
        {
            incentive.Participants.Add(new IncentiveParticipant
            {
                DistributorId = p.DistributorId,
                RetailerId = p.RetailerId,
                TargetValue = p.TargetValue,
                AchievedValue = 0,
                ApprovalStatus = "Pending",
                IsEligible = false
            });
        }
    }
}

public class UpdateIncentiveCommandHandler : IRequestHandler<UpdateIncentiveCommand>
{
    private readonly IApplicationDbContext _context;
    public UpdateIncentiveCommandHandler(IApplicationDbContext context) => _context = context;

    public async Task Handle(UpdateIncentiveCommand request, CancellationToken ct)
    {
        var incentive = await _context.Incentives
            .Include(i => i.Slabs)
            .Include(i => i.Participants)
            .FirstOrDefaultAsync(i => i.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Incentive), request.Id);

        if (request.Participants.Count == 0)
            throw new ConflictException("Select at least one distributor or retailer.");

        incentive.Name = request.Name.Trim();
        incentive.Description = request.Description?.Trim();
        incentive.CriteriaType = request.CriteriaType;
        incentive.StartDateUtc = request.StartDateUtc.Date;
        incentive.EndDateUtc = request.EndDateUtc.Date;
        incentive.IsActive = request.IsActive;
        incentive.ThresholdValue = request.Participants.Sum(p => p.TargetValue);

        // Replace slabs
        foreach (var existing in incentive.Slabs.ToList())
            incentive.Slabs.Remove(existing);
        CreateIncentiveCommandHandler.ApplySlabs(incentive, request.Slabs);

        foreach (var existing in incentive.Participants.ToList())
            incentive.Participants.Remove(existing);
        CreateIncentiveCommandHandler.ApplyParticipants(incentive, request.Participants);

        await _context.SaveChangesAsync(ct);
    }
}

public class DeleteIncentiveCommandHandler : IRequestHandler<DeleteIncentiveCommand>
{
    private readonly IApplicationDbContext _context;
    public DeleteIncentiveCommandHandler(IApplicationDbContext context) => _context = context;

    public async Task Handle(DeleteIncentiveCommand request, CancellationToken ct)
    {
        var incentive = await _context.Incentives.FirstOrDefaultAsync(i => i.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Incentive), request.Id);
        _context.Incentives.Remove(incentive);
        await _context.SaveChangesAsync(ct);
    }
}

public class SendParticipantForApprovalCommandHandler : IRequestHandler<SendParticipantForApprovalCommand>
{
    private readonly IApplicationDbContext _context;
    public SendParticipantForApprovalCommandHandler(IApplicationDbContext context) => _context = context;

    public async Task Handle(SendParticipantForApprovalCommand request, CancellationToken ct)
    {
        var participant = await _context.IncentiveParticipants
            .FirstOrDefaultAsync(p => p.Id == request.ParticipantId && p.IncentiveId == request.IncentiveId, ct)
            ?? throw new NotFoundException(nameof(IncentiveParticipant), request.ParticipantId);

        participant.ApprovalStatus = "SentForApproval";
        participant.IsEligible = true;
        await _context.SaveChangesAsync(ct);
    }
}
