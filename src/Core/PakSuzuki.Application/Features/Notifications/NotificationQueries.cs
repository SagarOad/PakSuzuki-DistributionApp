using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Common.Models;

namespace PakSuzuki.Application.Features.Notifications;

public record NotificationDto(
    Guid Id,
    string Title,
    string Message,
    string Category,
    string? LinkUrl,
    Guid? RelatedEntityId,
    bool IsRead,
    DateTime CreatedAtUtc);

public record NotificationUnreadCountDto(int Count);

public record GetMyNotificationsQuery(int PageNumber = 1, int PageSize = 20)
    : IRequest<PaginatedList<NotificationDto>>;

public class GetMyNotificationsQueryHandler : IRequestHandler<GetMyNotificationsQuery, PaginatedList<NotificationDto>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;

    public GetMyNotificationsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    {
        _context = context;
        _currentUser = currentUser;
    }

    public async Task<PaginatedList<NotificationDto>> Handle(GetMyNotificationsQuery request, CancellationToken ct)
    {
        var userId = _currentUser.UserId
            ?? throw new ForbiddenAccessException("Sign in to view notifications.");

        var q = _context.AppNotifications.AsNoTracking()
            .Where(n => n.UserId == userId);

        var total = await q.CountAsync(ct);
        var page = await q
            .OrderByDescending(n => n.CreatedAtUtc)
            .Skip((request.PageNumber - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(n => new NotificationDto(
                n.Id, n.Title, n.Message, n.Category, n.LinkUrl, n.RelatedEntityId, n.IsRead, n.CreatedAtUtc))
            .ToListAsync(ct);

        return new PaginatedList<NotificationDto>(page, total, request.PageNumber, request.PageSize);
    }
}

public record GetUnreadNotificationCountQuery : IRequest<NotificationUnreadCountDto>;

public class GetUnreadNotificationCountQueryHandler
    : IRequestHandler<GetUnreadNotificationCountQuery, NotificationUnreadCountDto>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;

    public GetUnreadNotificationCountQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    {
        _context = context;
        _currentUser = currentUser;
    }

    public async Task<NotificationUnreadCountDto> Handle(GetUnreadNotificationCountQuery request, CancellationToken ct)
    {
        var userId = _currentUser.UserId;
        if (userId is null) return new NotificationUnreadCountDto(0);

        var count = await _context.AppNotifications.AsNoTracking()
            .CountAsync(n => n.UserId == userId && !n.IsRead, ct);
        return new NotificationUnreadCountDto(count);
    }
}

public record MarkNotificationReadCommand(Guid Id) : IRequest;

public class MarkNotificationReadCommandHandler : IRequestHandler<MarkNotificationReadCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    private readonly IDateTimeService _dateTime;

    public MarkNotificationReadCommandHandler(
        IApplicationDbContext context, ICurrentUserService currentUser, IDateTimeService dateTime)
    {
        _context = context;
        _currentUser = currentUser;
        _dateTime = dateTime;
    }

    public async Task Handle(MarkNotificationReadCommand request, CancellationToken ct)
    {
        var userId = _currentUser.UserId
            ?? throw new ForbiddenAccessException("Sign in required.");

        var n = await _context.AppNotifications
            .FirstOrDefaultAsync(x => x.Id == request.Id && x.UserId == userId, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.AppNotification), request.Id);

        if (n.IsRead) return;
        n.IsRead = true;
        n.ReadAtUtc = _dateTime.UtcNow;
        await _context.SaveChangesAsync(ct);
    }
}

public record MarkAllNotificationsReadCommand : IRequest;

public class MarkAllNotificationsReadCommandHandler : IRequestHandler<MarkAllNotificationsReadCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    private readonly IDateTimeService _dateTime;

    public MarkAllNotificationsReadCommandHandler(
        IApplicationDbContext context, ICurrentUserService currentUser, IDateTimeService dateTime)
    {
        _context = context;
        _currentUser = currentUser;
        _dateTime = dateTime;
    }

    public async Task Handle(MarkAllNotificationsReadCommand request, CancellationToken ct)
    {
        var userId = _currentUser.UserId
            ?? throw new ForbiddenAccessException("Sign in required.");

        var unread = await _context.AppNotifications
            .Where(n => n.UserId == userId && !n.IsRead)
            .ToListAsync(ct);
        if (unread.Count == 0) return;

        var now = _dateTime.UtcNow;
        foreach (var n in unread)
        {
            n.IsRead = true;
            n.ReadAtUtc = now;
        }

        await _context.SaveChangesAsync(ct);
    }
}
