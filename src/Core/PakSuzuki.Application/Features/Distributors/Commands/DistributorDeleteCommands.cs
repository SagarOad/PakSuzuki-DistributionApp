using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Auth.Commands;
using PakSuzuki.Application.Features.Maps.Queries;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Distributors.Commands;

/// <summary>
/// Soft-deleted distributors remain as historical “ghost” records (orders / audit).
/// Live retailers must always point at an approved, active, non-deleted distributor.
/// </summary>
public record SuggestedDistributorDto(
    Guid Id, string DistributorCode, string Name, string BusinessName,
    string RegionName, string BusinessAddress, double Latitude, double Longitude, double DistanceKm);

public record DistributorDeleteRetailerDto(
    Guid Id, string RetailerCode, string Name, string BusinessName,
    string BusinessAddress, double Latitude, double Longitude, bool IsDeleted,
    SuggestedDistributorDto? SuggestedDistributor);

public record DistributorDeletePreviewDto(
    Guid Id, string DistributorCode, string Name, string BusinessName,
    string RegionName, Guid RegionId, double Latitude, double Longitude,
    int RetailerCount, int ActiveRetailerCount,
    bool CanDeleteWithoutReassign,
    bool HasAssignableDistributors,
    string? BlockReason,
    IReadOnlyList<DistributorDeleteRetailerDto> Retailers,
    IReadOnlyList<SuggestedDistributorDto> CandidateDistributors);

public record GetDistributorDeletePreviewQuery(Guid DistributorId) : IRequest<DistributorDeletePreviewDto>;

public class GetDistributorDeletePreviewQueryHandler
    : IRequestHandler<GetDistributorDeletePreviewQuery, DistributorDeletePreviewDto>
{
    private readonly IApplicationDbContext _context;
    public GetDistributorDeletePreviewQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<DistributorDeletePreviewDto> Handle(
        GetDistributorDeletePreviewQuery request, CancellationToken ct)
    {
        var distributor = await _context.Distributors
            .IgnoreQueryFilters()
            .Include(d => d.Region)
            .FirstOrDefaultAsync(d => d.Id == request.DistributorId, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Distributor), request.DistributorId);

        if (distributor.IsDeleted)
            throw new ConflictException("This distributor is already removed.");

        // Include soft-deleted retailers so no FK is left on a ghost distributor.
        var retailers = await _context.Retailers
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(r => r.DistributorId == request.DistributorId)
            .OrderBy(r => r.IsDeleted)
            .ThenBy(r => r.BusinessName)
            .Select(r => new CandidateRetailerRow(
                r.Id, r.RetailerCode, r.Name, r.BusinessName,
                r.BusinessAddress, r.Latitude, r.Longitude, r.IsDeleted))
            .ToListAsync(ct);

        var candidates = await _context.Distributors.AsNoTracking()
            .Where(d => d.Id != request.DistributorId
                && d.ApprovalStatus == ApprovalStatus.Approved
                && d.IsActive)
            .Select(d => new CandidateDistributorRow(
                d.Id, d.DistributorCode, d.Name, d.BusinessName, d.RegionId,
                d.Region.Name, d.BusinessAddress, d.Latitude, d.Longitude))
            .ToListAsync(ct);

        var candidateDtos = candidates
            .Select(d => new SuggestedDistributorDto(
                d.Id, d.DistributorCode, d.Name, d.BusinessName,
                d.RegionName, d.BusinessAddress, d.Latitude, d.Longitude, 0))
            .OrderBy(d => d.BusinessName)
            .ToList();

        var retailerDtos = retailers.Select(r =>
            new DistributorDeleteRetailerDto(
                r.Id, r.RetailerCode, r.Name, r.BusinessName,
                r.BusinessAddress, r.Latitude, r.Longitude, r.IsDeleted,
                DistributorAssignmentRules.SuggestNearest(candidates, distributor.RegionId, r.Latitude, r.Longitude)))
            .ToList();

        var activeCount = retailers.Count(r => !r.IsDeleted);
        string? blockReason = null;
        if (retailers.Count > 0 && candidates.Count == 0)
        {
            blockReason =
                "No other approved active distributor exists. Approve or reactivate another distributor before removing this one — every retailer must keep a live distributor.";
        }

        return new DistributorDeletePreviewDto(
            distributor.Id,
            distributor.DistributorCode,
            distributor.Name,
            distributor.BusinessName,
            distributor.Region.Name,
            distributor.RegionId,
            distributor.Latitude,
            distributor.Longitude,
            retailers.Count,
            activeCount,
            retailers.Count == 0,
            candidates.Count > 0,
            blockReason,
            retailerDtos,
            candidateDtos);
    }

    private sealed record CandidateRetailerRow(
        Guid Id, string RetailerCode, string Name, string BusinessName,
        string BusinessAddress, double Latitude, double Longitude, bool IsDeleted);
}

internal sealed record CandidateDistributorRow(
    Guid Id, string DistributorCode, string Name, string BusinessName, Guid RegionId,
    string RegionName, string BusinessAddress, double Latitude, double Longitude);

internal static class DistributorAssignmentRules
{
    public static bool IsAssignableLive(Domain.Entities.Distributor d, Guid excludeId) =>
        d.Id != excludeId
        && !d.IsDeleted
        && d.IsActive
        && d.ApprovalStatus == ApprovalStatus.Approved;

    public static SuggestedDistributorDto? SuggestNearest(
        IReadOnlyList<CandidateDistributorRow> candidates,
        Guid preferredRegionId,
        double lat,
        double lng)
    {
        if (candidates.Count == 0) return null;

        var hasPin = lat != 0 || lng != 0;
        CandidateDistributorRow pick;
        double distanceKm = 0;

        if (hasPin)
        {
            var ranked = candidates
                .Select(d =>
                {
                    var hasDistPin = d.Latitude != 0 || d.Longitude != 0;
                    var distance = hasDistPin
                        ? GeoDistance.HaversineKm(lat, lng, d.Latitude, d.Longitude)
                        : double.MaxValue;
                    return new { d, distance, sameRegion = d.RegionId == preferredRegionId };
                })
                .OrderBy(x => x.distance)
                .ThenByDescending(x => x.sameRegion)
                .ThenBy(x => x.d.BusinessName)
                .First();
            pick = ranked.d;
            distanceKm = ranked.distance == double.MaxValue ? 0 : ranked.distance;
        }
        else
        {
            pick = candidates.FirstOrDefault(d => d.RegionId == preferredRegionId)
                ?? candidates.OrderBy(d => d.BusinessName).First();
        }

        return new SuggestedDistributorDto(
            pick.Id, pick.DistributorCode, pick.Name, pick.BusinessName,
            pick.RegionName, pick.BusinessAddress, pick.Latitude, pick.Longitude,
            Math.Round(distanceKm, 2));
    }
}

public record RetailerReassignmentDto(Guid RetailerId, Guid NewDistributorId);

public record ReassignRetailersAndDeleteDistributorCommand(
    Guid DistributorId,
    IReadOnlyList<RetailerReassignmentDto> Assignments
) : IRequest;

public class ReassignRetailersAndDeleteDistributorCommandValidator
    : AbstractValidator<ReassignRetailersAndDeleteDistributorCommand>
{
    public ReassignRetailersAndDeleteDistributorCommandValidator()
    {
        RuleFor(x => x.DistributorId).NotEmpty();
        RuleFor(x => x.Assignments).NotNull();
        RuleForEach(x => x.Assignments).ChildRules(a =>
        {
            a.RuleFor(x => x.RetailerId).NotEmpty();
            a.RuleFor(x => x.NewDistributorId).NotEmpty();
        });
        RuleFor(x => x.Assignments)
            .Must(a => a.Select(x => x.RetailerId).Distinct().Count() == a.Count)
            .WithMessage("Each retailer may only appear once in the reassignment list.");
    }
}

public class ReassignRetailersAndDeleteDistributorCommandHandler
    : IRequestHandler<ReassignRetailersAndDeleteDistributorCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly IIdentityService _identity;
    private readonly IDateTimeService _dateTime;

    public ReassignRetailersAndDeleteDistributorCommandHandler(
        IApplicationDbContext context, IIdentityService identity, IDateTimeService dateTime)
    {
        _context = context;
        _identity = identity;
        _dateTime = dateTime;
    }

    public async Task Handle(ReassignRetailersAndDeleteDistributorCommand request, CancellationToken ct)
    {
        var distributor = await _context.Distributors
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(d => d.Id == request.DistributorId, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Distributor), request.DistributorId);

        if (distributor.IsDeleted)
            throw new ConflictException("This distributor is already removed.");

        // All retailer rows (including soft-deleted) must leave this distributor.
        var retailers = await _context.Retailers
            .IgnoreQueryFilters()
            .Where(r => r.DistributorId == request.DistributorId)
            .ToListAsync(ct);

        if (retailers.Count == 0)
        {
            await SoftDeleteCoreAsync(distributor, ct);
            return;
        }

        if (request.Assignments.Count == 0)
            throw new ConflictException(
                $"This distributor still has {retailers.Count} retailer link(s). Reassign every retailer to a live distributor before deleting.");

        var assignmentMap = request.Assignments
            .ToDictionary(a => a.RetailerId, a => a.NewDistributorId);

        // Security: reject assignments for retailers that do not belong here.
        var foreignIds = assignmentMap.Keys.Except(retailers.Select(r => r.Id)).ToList();
        if (foreignIds.Count > 0)
            throw new ForbiddenAccessException(
                "Reassignment list includes retailers that do not belong to this distributor.");

        var missing = retailers.Where(r => !assignmentMap.ContainsKey(r.Id)).Select(r => r.RetailerCode).ToList();
        if (missing.Count > 0)
            throw new ConflictException(
                $"{missing.Count} retailer(s) still need a new distributor ({string.Join(", ", missing.Take(5))}{(missing.Count > 5 ? "…" : "")}).");

        var targetIds = assignmentMap.Values.Distinct().ToList();
        if (targetIds.Contains(request.DistributorId))
            throw new ConflictException("Retailers cannot be reassigned to the distributor being deleted.");

        var targets = await _context.Distributors
            .IgnoreQueryFilters()
            .Where(d => targetIds.Contains(d.Id))
            .ToListAsync(ct);

        foreach (var targetId in targetIds)
        {
            var target = targets.FirstOrDefault(d => d.Id == targetId)
                ?? throw new NotFoundException(nameof(Domain.Entities.Distributor), targetId);

            if (!DistributorAssignmentRules.IsAssignableLive(target, request.DistributorId))
            {
                throw new ConflictException(
                    $"Distributor '{target.BusinessName}' ({target.DistributorCode}) cannot receive retailers. "
                    + "Target must be approved, active, and not removed.");
            }
        }

        foreach (var retailer in retailers)
            retailer.DistributorId = assignmentMap[retailer.Id];

        // Post-condition before soft-delete: every retailer row must have left this distributor.
        if (retailers.Any(r => r.DistributorId == request.DistributorId))
            throw new ConflictException("Reassignment incomplete — a retailer is still linked to this distributor.");

        distributor.IsActive = false;
        distributor.IsDeleted = true;
        distributor.DeletedAtUtc = _dateTime.UtcNow;
        await _identity.SetUserActiveAsync(distributor.ApplicationUserId, false, ct);
        await _context.SaveChangesAsync(ct);
    }

    private async Task SoftDeleteCoreAsync(Domain.Entities.Distributor distributor, CancellationToken ct)
    {
        distributor.IsActive = false;
        distributor.IsDeleted = true;
        distributor.DeletedAtUtc = _dateTime.UtcNow;
        await _identity.SetUserActiveAsync(distributor.ApplicationUserId, false, ct);
        await _context.SaveChangesAsync(ct);
    }
}
