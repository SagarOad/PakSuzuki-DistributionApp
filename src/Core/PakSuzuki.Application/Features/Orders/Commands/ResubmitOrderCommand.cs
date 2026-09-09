using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Orders.Commands;

/// <summary>
/// Retailer resubmits the <b>same</b> order after distributor sent it back for modification.
/// Does not create a new order — status returns to PendingDistributorApproval.
/// </summary>
public record ResubmitOrderItemDto(Guid OrderItemId, decimal Quantity);

public record ResubmitOrderCommand(
    Guid OrderId,
    string? Remarks,
    List<ResubmitOrderItemDto>? Items
) : IRequest;

public class ResubmitOrderCommandValidator : AbstractValidator<ResubmitOrderCommand>
{
    public ResubmitOrderCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty();
        RuleForEach(x => x.Items).ChildRules(item =>
        {
            item.RuleFor(i => i.OrderItemId).NotEmpty();
            item.RuleFor(i => i.Quantity).GreaterThan(0);
        }).When(x => x.Items != null);
    }
}

public class ResubmitOrderCommandHandler : IRequestHandler<ResubmitOrderCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    private readonly IAppNotificationService _notifications;

    public ResubmitOrderCommandHandler(
        IApplicationDbContext context,
        ICurrentUserService currentUser,
        IAppNotificationService notifications)
    {
        _context = context;
        _currentUser = currentUser;
        _notifications = notifications;
    }

    public async Task Handle(ResubmitOrderCommand request, CancellationToken ct)
    {
        var retailerId = _currentUser.RetailerId
            ?? throw new ForbiddenAccessException("Only retailers can resubmit orders.");

        var order = await _context.Orders.Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Order), request.OrderId);

        if (order.RetailerId != retailerId)
            throw new ForbiddenAccessException("This order does not belong to your retailer account.");

        if (order.Source != OrderSourceType.RetailerOrder)
            throw new ConflictException("Only retailer orders can be resubmitted.");

        if (order.Status != OrderStatus.SentBackForModification)
            throw new ConflictException(
                $"Order is in status '{order.Status}'. Only orders sent back for modification can be resubmitted.");

        var whtPercent = OrderWhtCalculator.PercentFromOrder(order.SubTotal, order.WhtAmount);

        if (request.Items is { Count: > 0 })
        {
            foreach (var item in request.Items)
            {
                var line = order.Items.FirstOrDefault(i => i.Id == item.OrderItemId)
                    ?? throw new NotFoundException(nameof(Domain.Entities.OrderItem), item.OrderItemId);

                var gstRate = line.LineSubTotal > 0 ? line.LineGst / line.LineSubTotal : 0;
                var fedRate = line.LineSubTotal > 0 ? line.LineFed / line.LineSubTotal : 0;

                line.RequestedQuantity = item.Quantity;
                line.ApprovedQuantity = null;
                line.LineSubTotal = Math.Round(line.UnitPrice * item.Quantity, 2);
                line.LineGst = Math.Round(line.LineSubTotal * gstRate, 2);
                line.LineFed = Math.Round(line.LineSubTotal * fedRate, 2);
            }

            // Drop lines the retailer omitted from the resubmit payload.
            var keepIds = request.Items.Select(i => i.OrderItemId).ToHashSet();
            foreach (var line in order.Items.Where(i => !keepIds.Contains(i.Id)).ToList())
                _context.OrderItems.Remove(line);

            RecalculateTotals(order, whtPercent);
        }
        else
        {
            foreach (var line in order.Items)
                line.ApprovedQuantity = null;
        }

        // Keep distributorRemarks so the retailer (and distributor) still see the amendment note.
        if (!string.IsNullOrWhiteSpace(request.Remarks))
            order.RetailerRemarks = request.Remarks.Trim();

        order.Status = OrderStatus.PendingDistributorApproval;
        await _context.SaveChangesAsync(ct);

        await _notifications.NotifyDistributorAsync(
            order.DistributorId,
            "Order resubmitted",
            $"Order {order.OrderNumber} was updated and needs your review again.",
            NotificationCategories.Order,
            $"/orders/{order.Id}",
            order.Id,
            ct);
    }

    private static void RecalculateTotals(Domain.Entities.Order order, decimal whtPercent)
    {
        var remaining = order.Items.Where(i => i.RequestedQuantity > 0).ToList();
        if (remaining.Count == 0)
            throw new ConflictException("Resubmitted order must keep at least one line item.");

        order.SubTotal = remaining.Sum(i => i.LineSubTotal);
        order.TotalGst = remaining.Sum(i => i.LineGst);
        order.TotalFed = remaining.Sum(i => i.LineFed);
        order.WhtAmount = OrderWhtCalculator.AmountFromSubTotal(order.SubTotal, whtPercent);
        order.GrandTotal = order.SubTotal + order.TotalGst + order.TotalFed + order.WhtAmount;
    }
}
