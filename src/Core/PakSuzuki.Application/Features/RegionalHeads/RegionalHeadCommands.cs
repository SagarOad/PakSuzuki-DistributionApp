using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Auth.Commands;
using PakSuzuki.Domain.Entities;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.RegionalHeads;

public record RegionalHeadRegionDto(Guid Id, string Name, string Code);

public record RegionalHeadDto(
    Guid UserId,
    string Email,
    string UserName,
    bool IsActive,
    IReadOnlyList<RegionalHeadRegionDto> Regions);

public record GetRegionalHeadsQuery : IRequest<IReadOnlyList<RegionalHeadDto>>;

public class GetRegionalHeadsQueryHandler : IRequestHandler<GetRegionalHeadsQuery, IReadOnlyList<RegionalHeadDto>>
{
    private readonly IApplicationDbContext _context;
    private readonly IIdentityService _identity;

    public GetRegionalHeadsQueryHandler(IApplicationDbContext context, IIdentityService identity)
    {
        _context = context;
        _identity = identity;
    }

    public async Task<IReadOnlyList<RegionalHeadDto>> Handle(GetRegionalHeadsQuery request, CancellationToken ct)
    {
        var users = await _identity.ListUsersInRoleAsync(Roles.RegionalHead, ct);
        if (users.Count == 0) return [];

        var userIds = users.Select(u => u.Id).ToList();
        var assignments = await _context.RegionalHeadAssignments
            .AsNoTracking()
            .Include(a => a.Region)
            .Where(a => userIds.Contains(a.ApplicationUserId))
            .ToListAsync(ct);

        var byUser = assignments
            .GroupBy(a => a.ApplicationUserId)
            .ToDictionary(
                g => g.Key,
                g => (IReadOnlyList<RegionalHeadRegionDto>)g
                    .OrderBy(a => a.Region.Name)
                    .Select(a => new RegionalHeadRegionDto(a.Region.Id, a.Region.Name, a.Region.Code))
                    .ToList());

        return users
            .Select(u => new RegionalHeadDto(
                u.Id,
                u.Email,
                u.UserName,
                u.IsActive,
                byUser.GetValueOrDefault(u.Id) ?? Array.Empty<RegionalHeadRegionDto>()))
            .ToList();
    }
}

public record CreateRegionalHeadCommand(
    string Email,
    string Password,
    IReadOnlyList<Guid> RegionIds,
    string? DisplayName = null) : IRequest<RegionalHeadDto>;

public class CreateRegionalHeadCommandValidator : AbstractValidator<CreateRegionalHeadCommand>
{
    public CreateRegionalHeadCommandValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.Password).NotEmpty().MinimumLength(6);
        RuleFor(x => x.RegionIds).NotEmpty().WithMessage("Select at least one region.");
    }
}

public class CreateRegionalHeadCommandHandler : IRequestHandler<CreateRegionalHeadCommand, RegionalHeadDto>
{
    private readonly IApplicationDbContext _context;
    private readonly IIdentityService _identity;

    public CreateRegionalHeadCommandHandler(IApplicationDbContext context, IIdentityService identity)
    {
        _context = context;
        _identity = identity;
    }

    public async Task<RegionalHeadDto> Handle(CreateRegionalHeadCommand request, CancellationToken ct)
    {
        var email = request.Email.Trim();
        var regionIds = request.RegionIds.Distinct().ToList();
        await EnsureRegionsExistAsync(regionIds, ct);

        var userName = string.IsNullOrWhiteSpace(request.DisplayName)
            ? email
            : request.DisplayName.Trim();

        var userId = await _identity.CreateUserAsync(userName, email, request.Password, Roles.RegionalHead, ct);

        foreach (var regionId in regionIds)
        {
            _context.RegionalHeadAssignments.Add(new RegionalHeadAssignment
            {
                ApplicationUserId = userId,
                RegionId = regionId
            });
        }

        await _context.SaveChangesAsync(ct);
        return await LoadOneAsync(userId, ct);
    }

    private async Task EnsureRegionsExistAsync(IReadOnlyList<Guid> regionIds, CancellationToken ct)
    {
        var found = await _context.Regions.AsNoTracking()
            .Where(r => regionIds.Contains(r.Id))
            .Select(r => r.Id)
            .ToListAsync(ct);
        var missing = regionIds.Except(found).ToList();
        if (missing.Count > 0)
            throw new ConflictException("One or more selected regions were not found.");
    }

    private async Task<RegionalHeadDto> LoadOneAsync(Guid userId, CancellationToken ct)
    {
        var profile = await _identity.GetProfileAsync(userId, ct);
        var regions = await _context.RegionalHeadAssignments.AsNoTracking()
            .Include(a => a.Region)
            .Where(a => a.ApplicationUserId == userId)
            .OrderBy(a => a.Region.Name)
            .Select(a => new RegionalHeadRegionDto(a.Region.Id, a.Region.Name, a.Region.Code))
            .ToListAsync(ct);

        var summary = (await _identity.ListUsersInRoleAsync(Roles.RegionalHead, ct))
            .FirstOrDefault(u => u.Id == userId);

        return new RegionalHeadDto(
            userId,
            profile.Email,
            profile.UserName,
            summary?.IsActive ?? true,
            regions);
    }
}

public record UpdateRegionalHeadCommand(
    Guid UserId,
    IReadOnlyList<Guid> RegionIds,
    bool? IsActive = null,
    string? NewPassword = null) : IRequest<RegionalHeadDto>;

public class UpdateRegionalHeadCommandValidator : AbstractValidator<UpdateRegionalHeadCommand>
{
    public UpdateRegionalHeadCommandValidator()
    {
        RuleFor(x => x.UserId).NotEmpty();
        RuleFor(x => x.RegionIds).NotEmpty().WithMessage("Select at least one region.");
        RuleFor(x => x.NewPassword!).MinimumLength(6).When(x => !string.IsNullOrWhiteSpace(x.NewPassword));
    }
}

public class UpdateRegionalHeadCommandHandler : IRequestHandler<UpdateRegionalHeadCommand, RegionalHeadDto>
{
    private readonly IApplicationDbContext _context;
    private readonly IIdentityService _identity;

    public UpdateRegionalHeadCommandHandler(IApplicationDbContext context, IIdentityService identity)
    {
        _context = context;
        _identity = identity;
    }

    public async Task<RegionalHeadDto> Handle(UpdateRegionalHeadCommand request, CancellationToken ct)
    {
        var profile = await _identity.GetProfileAsync(request.UserId, ct);
        if (!string.Equals(profile.Role, Roles.RegionalHead, StringComparison.OrdinalIgnoreCase))
            throw new ConflictException("User is not a Regional Head.");

        var regionIds = request.RegionIds.Distinct().ToList();
        var found = await _context.Regions.AsNoTracking()
            .Where(r => regionIds.Contains(r.Id))
            .Select(r => r.Id)
            .ToListAsync(ct);
        if (found.Count != regionIds.Count)
            throw new ConflictException("One or more selected regions were not found.");

        var existing = await _context.RegionalHeadAssignments
            .IgnoreQueryFilters()
            .Where(a => a.ApplicationUserId == request.UserId)
            .ToListAsync(ct);

        foreach (var row in existing)
        {
            if (regionIds.Contains(row.RegionId))
            {
                row.IsDeleted = false;
                row.DeletedAtUtc = null;
                row.DeletedBy = null;
            }
            else if (!row.IsDeleted)
            {
                _context.RegionalHeadAssignments.Remove(row);
            }
        }

        foreach (var regionId in regionIds)
        {
            if (existing.Any(a => a.RegionId == regionId)) continue;
            _context.RegionalHeadAssignments.Add(new RegionalHeadAssignment
            {
                ApplicationUserId = request.UserId,
                RegionId = regionId
            });
        }

        await _context.SaveChangesAsync(ct);

        if (request.IsActive is bool active)
            await _identity.SetUserActiveAsync(request.UserId, active, ct);

        if (!string.IsNullOrWhiteSpace(request.NewPassword))
        {
            await _identity.UpdateProfileAsync(
                request.UserId,
                profile.UserName,
                profile.Email,
                profile.PhoneNumber,
                request.NewPassword,
                ct);
        }

        var summary = (await _identity.ListUsersInRoleAsync(Roles.RegionalHead, ct))
            .FirstOrDefault(u => u.Id == request.UserId);
        var regions = await _context.RegionalHeadAssignments.AsNoTracking()
            .Include(a => a.Region)
            .Where(a => a.ApplicationUserId == request.UserId)
            .OrderBy(a => a.Region.Name)
            .Select(a => new RegionalHeadRegionDto(a.Region.Id, a.Region.Name, a.Region.Code))
            .ToListAsync(ct);

        return new RegionalHeadDto(
            request.UserId,
            profile.Email,
            profile.UserName,
            summary?.IsActive ?? true,
            regions);
    }
}
