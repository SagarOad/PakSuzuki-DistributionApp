using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Orders;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Orders.Commands;

// Distributor actions on pending retailer orders:
// - ApprovedByDistributor + DistributorSelf: fulfill full pack qty from inventory
// - ApprovedByDistributor / ForwardedToPakSuzuki + PassToPakSuzuki: only when threshold met;
//   then ship-to distributor or retailer is required
// - SentBackForModification / RejectedByDistributor: send back so the retailer can modify
// Partial approval / partial delivery is not allowed (retailer ↔ distributor).
public record ApproveOrderItemDto(Guid OrderItemId, decimal ApprovedQuantity);

public record ApproveOrderCommand(
    Guid OrderId,
    OrderStatus Decision,
    string? Remarks,
    List<ApproveOrderItemDto>? AmendedItems,
    OrderFulfillmentChoice? FulfillmentChoice = null,
    PakSuzukiShipTo? PakSuzukiShipTo = null
) : IRequest;

public class ApproveOrderCommandValidator : AbstractValidator<ApproveOrderCommand>
{
    private static readonly OrderStatus[] AllowedDecisions =
    {
        OrderStatus.ApprovedByDistributor,
        OrderStatus.RejectedByDistributor,
        OrderStatus.SentBackForModification,
        OrderStatus.ForwardedToPakSuzuki
    };

    public ApproveOrderCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty();
        RuleFor(x => x.Decision).Must(d => AllowedDecisions.Contains(d))
            .WithMessage("Decision must be one of: Approve, Reject, SendBack, ForwardToPakSuzuki.");
    }
}

public class ApproveOrderCommandHandler : IRequestHandler<ApproveOrderCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly IDateTimeService _dateTime;
    private readonly ICurrentUserService _currentUser;
    private readonly IAppNotificationService _notifications;

    public ApproveOrderCommandHandler(
        IApplicationDbContext context,
        IDateTimeService dateTime,
        ICurrentUserService currentUser,
        IAppNotificationService notifications)
    {
        _context = context;
        _dateTime = dateTime;
        _currentUser = currentUser;
        _notifications = notifications;
    }

    public async Task Handle(ApproveOrderCommand request, CancellationToken ct)
    {
        var order = await _context.Orders
            .Include(o => o.Items).ThenInclude(i => i.Product).ThenInclude(p => p!.CatalogProfile)
            .Include(o => o.Retailer)
            .Include(o => o.Distributor)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Order), request.OrderId);

        if (order.Status != OrderStatus.PendingDistributorApproval)
            throw new ConflictException($"Order is in status '{order.Status}' and cannot be actioned again.");

        if (_currentUser.DistributorId is null || order.DistributorId != _currentUser.DistributorId)
            throw new ForbiddenAccessException("You can only action orders for your own distributorship.");

        // Any order Super Admin amended / sent back — distributor approves qty (or changes
        // further) and returns it to Pak Suzuki. Mirrors Dist → Retailer amendment flow.
        var awaitingPakSuzukiAmendment = order.PakSuzukiActionedAtUtc is not null;

        if (awaitingPakSuzukiAmendment)
        {
            if (request.Decision is not (OrderStatus.ForwardedToPakSuzuki or OrderStatus.ApprovedByDistributor))
                throw new ConflictException(
                    "Approve the amended quantities (or change them) and send this order back to Pak Suzuki.");

            var whtPercentAmend = OrderWhtCalculator.PercentFromOrder(order.SubTotal, order.WhtAmount);
            if (request.AmendedItems is { Count: > 0 })
            {
                ApplySendBackAmendments(order, request.AmendedItems);
                RecalculateTotalsFromRequested(order, whtPercentAmend);
            }

            ApplyFullApproval(order);
            order.Status = OrderStatus.PendingPakSuzukiApproval;
            order.FulfillmentChoice = OrderFulfillmentChoice.PassToPakSuzuki;
            if (order.PakSuzukiShipTo is null)
                order.PakSuzukiShipTo = PakSuzukiShipTo.Distributor;
            order.DistributorRemarks = request.Remarks;
            order.DistributorActionedAtUtc = _dateTime.UtcNow;
            await _context.SaveChangesAsync(ct);

            await _notifications.NotifyStaffAsync(
                "Distributor approved Pak Suzuki amendment",
                $"Order {order.OrderNumber} was approved/updated by the distributor and is back for Pak Suzuki review.",
                NotificationCategories.Order,
                $"/orders/{order.Id}",
                order.Id,
                ct);

            if (order.RetailerId is Guid rid)
            {
                await _notifications.NotifyRetailerAsync(
                    rid,
                    "Order status updated",
                    $"Order {order.OrderNumber}: {OrderStatusDisplay.CustomerLabel(order.Status)}.",
                    NotificationCategories.Order,
                    $"/orders/{order.Id}",
                    order.Id,
                    ct);
            }

            return;
        }

        if (order.Source == OrderSourceType.DistributorDirectOrder)
            throw new ConflictException("This manufacturer order is not awaiting your action.");

        if (order.Source != OrderSourceType.RetailerOrder)
            throw new ConflictException("Distributor actions apply to retailer orders only.");

        if (request.Decision == OrderStatus.PartiallyApprovedByDistributor)
            throw new ConflictException("Partial approval is not allowed for retailer orders — approve the full order or send it back.");

        var whtPercent = OrderWhtCalculator.PercentFromOrder(order.SubTotal, order.WhtAmount);
        order.ThresholdMet = await OrderThresholdEvaluator.IsMetAsync(
            _context, order.DistributorId, order.Items.ToList(), ct);
        order.DistributorCode = SapPartnerCodes.Distributor(order.Distributor);

        switch (request.Decision)
        {
            case OrderStatus.ApprovedByDistributor:
                ApplyFullApproval(order);
                if (request.FulfillmentChoice == OrderFulfillmentChoice.PassToPakSuzuki)
                    PassToPakSuzuki(order, request.PakSuzukiShipTo);
                else
                    FulfillSelf(order);
                break;

            case OrderStatus.SentBackForModification:
            case OrderStatus.RejectedByDistributor:
                if (request.AmendedItems != null)
                {
                    ApplySendBackAmendments(order, request.AmendedItems);
                    RecalculateTotalsFromRequested(order, whtPercent);
                    order.ThresholdMet = await OrderThresholdEvaluator.IsMetAsync(
                        _context, order.DistributorId, order.Items.ToList(), ct);
                }
                order.Status = OrderStatus.SentBackForModification;
                order.FulfillmentChoice = null;
                order.PakSuzukiShipTo = null;
                order.RetailerCode = null;
                order.ShipToCode = null;
                order.BillToCode = null;
                break;

            case OrderStatus.ForwardedToPakSuzuki:
                ApplyFullApproval(order);
                PassToPakSuzuki(order, request.PakSuzukiShipTo);
                break;

            default:
                throw new ConflictException($"Unsupported decision '{request.Decision}'.");
        }

        order.DistributorRemarks = request.Remarks;
        order.DistributorActionedAtUtc = _dateTime.UtcNow;
        await _context.SaveChangesAsync(ct);

        if (order.RetailerId is Guid retailerId)
        {
            var link = $"/orders/{order.Id}";
            var statusLabel = OrderStatusDisplay.CustomerLabel(order.Status);
            string title = order.Status switch
            {
                OrderStatus.ApprovedByDistributor => "Order approved",
                OrderStatus.SentBackForModification => "Order needs your update",
                OrderStatus.PendingPakSuzukiApproval => "Order forwarded to manufacturer",
                _ => "Order status updated"
            };
            await _notifications.NotifyRetailerAsync(
                retailerId,
                title,
                $"Order {order.OrderNumber}: {statusLabel}.",
                NotificationCategories.Order,
                link,
                order.Id,
                ct);
        }

        if (order.Status == OrderStatus.PendingPakSuzukiApproval)
        {
            await _notifications.NotifyStaffAsync(
                "Order pending Pak Suzuki approval",
                $"Order {order.OrderNumber} from {order.Distributor.Name} needs review.",
                NotificationCategories.Order,
                $"/orders/{order.Id}",
                order.Id,
                ct);
        }
    }

    private static void ApplyFullApproval(Domain.Entities.Order order)
    {
        foreach (var line in order.Items)
            line.ApprovedQuantity = line.RequestedQuantity;
    }

    private static void FulfillSelf(Domain.Entities.Order order)
    {
        order.FulfillmentChoice = OrderFulfillmentChoice.DistributorSelf;
        order.PakSuzukiShipTo = null;
        order.RetailerCode = null;
        order.ShipToCode = null;
        order.BillToCode = null;
        order.Status = OrderStatus.ApprovedByDistributor;
    }

    private static void PassToPakSuzuki(Domain.Entities.Order order, PakSuzukiShipTo? shipTo)
    {
        if (!order.ThresholdMet)
            throw new ConflictException(
                "Pass to Pak Suzuki is only available when this order meets the set pack threshold.");
        if (shipTo is null)
            throw new ConflictException(
                "Choose ship to distributor or ship to retailer so Pak Suzuki knows where to deliver.");

        order.FulfillmentChoice = OrderFulfillmentChoice.PassToPakSuzuki;
        order.PakSuzukiShipTo = shipTo;
        order.Status = OrderStatus.PendingPakSuzukiApproval;
        SapPartnerCodes.ApplyPassThroughCodes(order, shipTo.Value);
    }

    private void ApplySendBackAmendments(Domain.Entities.Order order, List<ApproveOrderItemDto> amendedItems)
    {
        foreach (var amended in amendedItems)
        {
            var line = order.Items.FirstOrDefault(i => i.Id == amended.OrderItemId);
            if (line is null) continue;

            if (amended.ApprovedQuantity <= 0)
            {
                _context.OrderItems.Remove(line);
                continue;
            }

            var gstRate = line.LineSubTotal > 0 ? line.LineGst / line.LineSubTotal : 0;
            var fedRate = line.LineSubTotal > 0 ? line.LineFed / line.LineSubTotal : 0;

            line.RequestedQuantity = amended.ApprovedQuantity;
            line.ApprovedQuantity = null;
            line.LineSubTotal = Math.Round(line.UnitPrice * amended.ApprovedQuantity, 2);
            line.LineGst = Math.Round(line.LineSubTotal * gstRate, 2);
            line.LineFed = Math.Round(line.LineSubTotal * fedRate, 2);
        }
    }

    private static void RecalculateTotalsFromRequested(Domain.Entities.Order order, decimal whtPercent)
    {
        var remaining = order.Items.Where(i => i.RequestedQuantity > 0).ToList();
        order.SubTotal = remaining.Sum(i => i.LineSubTotal);
        order.TotalGst = remaining.Sum(i => i.LineGst);
        order.TotalFed = remaining.Sum(i => i.LineFed);
        order.WhtAmount = OrderWhtCalculator.AmountFromSubTotal(order.SubTotal, whtPercent);
        order.GrandTotal = order.SubTotal + order.TotalGst + order.TotalFed + order.WhtAmount;
    }
}
