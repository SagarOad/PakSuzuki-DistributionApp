using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Images;
using PakSuzuki.Application.Common.Interfaces;

namespace PakSuzuki.Application.Features.Promotions;

public record ActivePromotionItemDto(
    Guid Id,
    string Title,
    string Type,
    string ImageUrl,
    string? RedirectUrl,
    DateTime StartDateUtc,
    DateTime EndDateUtc);

/// <summary>
/// Active promotions for the signed-in role (Distributor / Retailer), within start–end dates.
/// </summary>
public record GetActivePromotionsForMeQuery(string Role) : IRequest<List<ActivePromotionItemDto>>;

public class GetActivePromotionsForMeQueryHandler
    : IRequestHandler<GetActivePromotionsForMeQuery, List<ActivePromotionItemDto>>
{
    private readonly IApplicationDbContext _context;
    private readonly IDateTimeService _dateTime;

    public GetActivePromotionsForMeQueryHandler(IApplicationDbContext context, IDateTimeService dateTime)
    {
        _context = context;
        _dateTime = dateTime;
    }

    public async Task<List<ActivePromotionItemDto>> Handle(
        GetActivePromotionsForMeQuery request, CancellationToken ct)
    {
        var role = request.Role?.Trim() ?? string.Empty;
        if (string.IsNullOrEmpty(role)) return new List<ActivePromotionItemDto>();

        var now = _dateTime.UtcNow;
        // Load date-active rows, then match roles in memory so "Distributor,Retailer"
        // (with optional spaces) always includes every intended popup — not only one.
        var rows = await _context.Promotions.AsNoTracking()
            .Where(p => p.IsActive
                && !string.IsNullOrEmpty(p.ImageUrl)
                && p.StartDateUtc <= now
                && p.EndDateUtc >= now)
            .OrderByDescending(p => p.StartDateUtc)
            .ThenByDescending(p => p.CreatedAtUtc)
            .ToListAsync(ct);

        return rows
            .Where(p => TargetsRole(p.TargetRoles, role))
            .Select(p => new ActivePromotionItemDto(
                p.Id,
                p.Title,
                BannerImageAspect.NormalizePromotionType(p.Type),
                p.ImageUrl,
                p.RedirectUrl,
                p.StartDateUtc,
                p.EndDateUtc))
            .ToList();
    }

    private static bool TargetsRole(string? targetRoles, string role)
    {
        if (string.IsNullOrWhiteSpace(targetRoles)) return false;
        return targetRoles
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Any(r => r.Equals(role, StringComparison.OrdinalIgnoreCase));
    }
}
