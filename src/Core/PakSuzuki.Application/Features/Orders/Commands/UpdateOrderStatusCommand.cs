using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Domain.Enums;

using PakSuzuki.Application.Features.Orders;

namespace PakSuzuki.Application.Features.Orders.Commands;

// Manual status update with shipper enforcement:
// - Normal retailer order (no Ship-to-Party) → only the assigned Distributor may advance delivery
// - DistributorDirectOrder OR Ship-to-Party retailer → only SuperAdmin/Admin (Pak Suzuki) may advance delivery
public record UpdateOrderStatusCommand(Guid OrderId, OrderStatus Status, string? Remarks) : IRequest;

public class UpdateOrderStatusCommandValidator : AbstractValidator<UpdateOrderStatusCommand>
{
    public UpdateOrderStatusCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty();
        RuleFor(x => x.Status).IsInEnum();
    }
}

public class UpdateOrderStatusCommandHandler : IRequestHandler<UpdateOrderStatusCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    private readonly IAppNotificationService _notifications;

    public UpdateOrderStatusCommandHandler(
        IApplicationDbContext context,
        ICurrentUserService currentUser,
        IAppNotificationService notifications)
    {
        _context = context;
        _currentUser = currentUser;
        _notifications = notifications;
    }

    public async Task Handle(UpdateOrderStatusCommand request, CancellationToken ct)
    {
        var order = await _context.Orders
            .Include(o => o.Retailer)
            .Include(o => o.Items).ThenInclude(i => i.Product)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Order), request.OrderId);

        var role = _currentUser.Role;
        var isDeliveryAdvance = request.Status is OrderStatus.PartiallyDelivered or OrderStatus.Delivered;
        var pakSuzukiDelivers = OrderFulfillmentRules.PakSuzukiDelivers(order);

        // PartiallyDelivered = "In Process" / delivery started for all channels (lubes + parts).
        // AllowsPartialDelivery only gates true partial *quantity* fulfillment (SAP), not this step.

        if (role == Roles.Distributor)
        {
            if (_currentUser.DistributorId is null || order.DistributorId != _currentUser.DistributorId)
                throw new ForbiddenAccessException("You can only update orders for your own distributorship.");

            if (isDeliveryAdvance)
            {
                if (pakSuzukiDelivers)
                    throw new ForbiddenAccessException(
                        "Pak Suzuki delivers this order (manufacturer / Ship-to-Party). You can only view tracking.");

                if (request.Status is not (OrderStatus.PartiallyDelivered or OrderStatus.Delivered))
                    throw new ForbiddenAccessException("Distributors may only mark delivery in process or delivered.");
            }
            else if (request.Status is not OrderStatus.ApprovedByDistributor)
            {
                throw new ForbiddenAccessException("Distributors cannot set this status.");
            }
        }
        else if (role is Roles.SuperAdmin or Roles.Admin)
        {
            if (isDeliveryAdvance && !pakSuzukiDelivers)
                throw new ForbiddenAccessException(
                    "This retailer order is fulfilled by the distributor — only they can update delivery status.");

            // Staff should not workflow-action normal (non Ship-to-Party) retailer pending orders via patch.
            if (order.Source == OrderSourceType.RetailerOrder && !pakSuzukiDelivers
                && request.Status is OrderStatus.ApprovedByPakSuzuki or OrderStatus.PendingPakSuzukiApproval)
                throw new ForbiddenAccessException(
                    "Normal retailer orders are handled by the distributor, not Pak Suzuki.");
        }
        else
        {
            throw new ForbiddenAccessException("You are not allowed to update order status.");
        }

        order.Status = request.Status;
        if (request.Remarks != null)
        {
            if (role == Roles.Distributor)
                order.DistributorRemarks = request.Remarks;
            else if (role is Roles.SuperAdmin or Roles.Admin)
                order.PakSuzukiRemarks = request.Remarks;
        }

        await _context.SaveChangesAsync(ct);

        if (request.Status is OrderStatus.PartiallyDelivered or OrderStatus.Delivered or OrderStatus.InvoiceConfirmed)
        {
            var link = $"/orders/{order.Id}";
            if (order.RetailerId is Guid retailerId)
            {
                await _notifications.NotifyRetailerAsync(
                    retailerId,
                    "Order status updated",
                    $"Order {order.OrderNumber}: {OrderStatusDisplay.CustomerLabel(order.Status)}.",
                    NotificationCategories.Order,
                    link,
                    order.Id,
                    ct);
            }

            if (role is Roles.SuperAdmin or Roles.Admin)
            {
                await _notifications.NotifyDistributorAsync(
                    order.DistributorId,
                    "Order status updated",
                    $"Order {order.OrderNumber}: {OrderStatusDisplay.StaffLabel(order.Status)}.",
                    NotificationCategories.Order,
                    link,
                    order.Id,
                    ct);
            }
        }
    }
}
