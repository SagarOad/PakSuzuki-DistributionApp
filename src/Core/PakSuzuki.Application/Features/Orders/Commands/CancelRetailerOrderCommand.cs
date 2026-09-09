using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Orders.Commands;

/// <summary>
/// Retailer cancels their own order while it is still pending distributor action
/// (PendingDistributorApproval or SentBackForModification).
/// </summary>
public record CancelRetailerOrderCommand(Guid OrderId, string? Remarks = null) : IRequest;

public class CancelRetailerOrderCommandValidator : AbstractValidator<CancelRetailerOrderCommand>
{
    public CancelRetailerOrderCommandValidator() => RuleFor(x => x.OrderId).NotEmpty();
}

public class CancelRetailerOrderCommandHandler : IRequestHandler<CancelRetailerOrderCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    private readonly IDateTimeService _dateTime;
    private readonly IAppNotificationService _notifications;

    public CancelRetailerOrderCommandHandler(
        IApplicationDbContext context,
        ICurrentUserService currentUser,
        IDateTimeService dateTime,
        IAppNotificationService notifications)
    {
        _context = context;
        _currentUser = currentUser;
        _dateTime = dateTime;
        _notifications = notifications;
    }

    public async Task Handle(CancelRetailerOrderCommand request, CancellationToken ct)
    {
        var retailerId = _currentUser.RetailerId
            ?? throw new ForbiddenAccessException("Only retailers can cancel their orders.");

        var order = await _context.Orders.FirstOrDefaultAsync(o => o.Id == request.OrderId, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Order), request.OrderId);

        if (order.RetailerId != retailerId)
            throw new ForbiddenAccessException("This order does not belong to your retailer account.");

        if (order.Source != OrderSourceType.RetailerOrder)
            throw new ConflictException("Only retailer orders can be cancelled by the retailer.");

        if (order.Status is not (OrderStatus.PendingDistributorApproval or OrderStatus.SentBackForModification))
            throw new ConflictException(
                $"Order is in status '{order.Status}' and can no longer be cancelled by the retailer.");

        order.Status = OrderStatus.Cancelled;
        if (!string.IsNullOrWhiteSpace(request.Remarks))
            order.DistributorRemarks = request.Remarks;
        order.DistributorActionedAtUtc = _dateTime.UtcNow;
        await _context.SaveChangesAsync(ct);

        await _notifications.NotifyDistributorAsync(
            order.DistributorId,
            "Order cancelled",
            $"Retailer cancelled order {order.OrderNumber}.",
            NotificationCategories.Order,
            $"/orders/{order.Id}",
            order.Id,
            ct);
    }
}
