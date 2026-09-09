using MediatR;
using Microsoft.EntityFrameworkCore;
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
        return await _context.Promotions.AsNoTracking()
            .Where(p => p.IsActive
                && p.StartDateUtc <= now
                && p.EndDateUtc >= now
                && p.TargetRoles.Contains(role))
            .OrderByDescending(p => p.Type == "NewsletterPopUp")
            .ThenByDescending(p => p.StartDateUtc)
            .Select(p => new ActivePromotionItemDto(
                p.Id, p.Title, p.Type, p.ImageUrl, p.RedirectUrl, p.StartDateUtc, p.EndDateUtc))
            .ToListAsync(ct);
    }
}
