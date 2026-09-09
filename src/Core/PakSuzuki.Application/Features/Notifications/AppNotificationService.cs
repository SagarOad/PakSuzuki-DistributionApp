using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Auth.Commands;
using PakSuzuki.Domain.Entities;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Notifications;

public class AppNotificationService : IAppNotificationService
{
    private readonly IApplicationDbContext _context;
    private readonly IIdentityService _identity;
    private readonly ICurrentUserService _currentUser;

    public AppNotificationService(
        IApplicationDbContext context,
        IIdentityService identity,
        ICurrentUserService currentUser)
    {
        _context = context;
        _identity = identity;
        _currentUser = currentUser;
    }

    public Task NotifyUserAsync(
        Guid userId,
        string title,
        string message,
        string category,
        string? linkUrl = null,
        Guid? relatedEntityId = null,
        CancellationToken ct = default) =>
        NotifyUsersAsync(new[] { userId }, title, message, category, linkUrl, relatedEntityId, ct);

    public async Task NotifyUsersAsync(
        IEnumerable<Guid> userIds,
        string title,
        string message,
        string category,
        string? linkUrl = null,
        Guid? relatedEntityId = null,
        CancellationToken ct = default)
    {
        var actorId = _currentUser.UserId;
        var distinct = userIds
            .Where(id => id != Guid.Empty && (actorId is null || id != actorId.Value))
            .Distinct()
            .ToList();
        if (distinct.Count == 0) return;

        foreach (var userId in distinct)
        {
            _context.AppNotifications.Add(new AppNotification
            {
                UserId = userId,
                Title = title.Trim(),
                Message = message.Trim(),
                Category = string.IsNullOrWhiteSpace(category) ? NotificationCategories.System : category.Trim(),
                LinkUrl = string.IsNullOrWhiteSpace(linkUrl) ? null : linkUrl.Trim(),
                RelatedEntityId = relatedEntityId,
                IsRead = false
            });
        }

        await _context.SaveChangesAsync(ct);
    }

    public async Task NotifyDistributorAsync(
        Guid distributorId,
        string title,
        string message,
        string category,
        string? linkUrl = null,
        Guid? relatedEntityId = null,
        CancellationToken ct = default)
    {
        var userId = await _context.Distributors.AsNoTracking()
            .Where(d => d.Id == distributorId)
            .Select(d => (Guid?)d.ApplicationUserId)
            .FirstOrDefaultAsync(ct);
        if (userId is null) return;
        await NotifyUserAsync(userId.Value, title, message, category, linkUrl, relatedEntityId, ct);
    }

    public async Task NotifyRetailerAsync(
        Guid retailerId,
        string title,
        string message,
        string category,
        string? linkUrl = null,
        Guid? relatedEntityId = null,
        CancellationToken ct = default)
    {
        var userId = await _context.Retailers.AsNoTracking()
            .Where(r => r.Id == retailerId)
            .Select(r => (Guid?)r.ApplicationUserId)
            .FirstOrDefaultAsync(ct);
        if (userId is null) return;
        await NotifyUserAsync(userId.Value, title, message, category, linkUrl, relatedEntityId, ct);
    }

    public async Task NotifyStaffAsync(
        string title,
        string message,
        string category,
        string? linkUrl = null,
        Guid? relatedEntityId = null,
        CancellationToken ct = default)
    {
        var userIds = await _identity.GetUserIdsInRolesAsync(
            new[] { Roles.SuperAdmin, Roles.Admin }, ct);
        await NotifyUsersAsync(userIds, title, message, category, linkUrl, relatedEntityId, ct);
    }
}
