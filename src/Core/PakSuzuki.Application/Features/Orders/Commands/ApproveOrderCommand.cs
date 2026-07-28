using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Orders.Commands;

// 3.3.2 distributor actions on pending retailer orders:
// - ApprovedByDistributor: can fulfill full qty from inventory → process order
// - PartiallyApprovedByDistributor: fulfill partial qty from inventory (AmendedItems required)
// - ForwardedToPakSuzuki: cannot fulfill → order goes to Pak Suzuki (PendingPakSuzukiApproval)
// - SentBackForModification: amend qtys / note and send back to retailer
// - RejectedByDistributor: cancel
public record ApproveOrderItemDto(Guid OrderItemId, decimal ApprovedQuantity);

public record ApproveOrderCommand(
    Guid OrderId, OrderStatus Decision, string? Remarks, List<ApproveOrderItemDto>? AmendedItems
) : IRequest;

public class ApproveOrderCommandValidator : AbstractValidator<ApproveOrderCommand>
{
    private static readonly OrderStatus[] AllowedDecisions =
    {
        OrderStatus.ApprovedByDistributor, OrderStatus.PartiallyApprovedByDistributor,
        OrderStatus.RejectedByDistributor, OrderStatus.SentBackForModification,
        OrderStatus.ForwardedToPakSuzuki
    };

    public ApproveOrderCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty();
        RuleFor(x => x.Decision).Must(d => AllowedDecisions.Contains(d))
            .WithMessage("Decision must be one of: Approve, PartiallyApprove, Reject, SendBack, ForwardToPakSuzuki.");
        RuleFor(x => x.AmendedItems)
            .NotEmpty()
            .When(x => x.Decision == OrderStatus.PartiallyApprovedByDistributor)
            .WithMessage("AmendedItems with approved quantities are required for partial approval.");
    }
}

public class ApproveOrderCommandHandler : IRequestHandler<ApproveOrderCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly IDateTimeService _dateTime;
    private readonly ICurrentUserService _currentUser;

    public ApproveOrderCommandHandler(
        IApplicationDbContext context, IDateTimeService dateTime, ICurrentUserService currentUser)
    {
        _context = context;
        _dateTime = dateTime;
        _currentUser = currentUser;
    }

    public async Task Handle(ApproveOrderCommand request, CancellationToken ct)
    {
        var order = await _context.Orders.Include(o => o.Items).Include(o => o.Retailer)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Order), request.OrderId);

        if (order.Status != OrderStatus.PendingDistributorApproval)
            throw new ConflictException($"Order is in status '{order.Status}' and cannot be actioned again.");

        if (order.Source != OrderSourceType.RetailerOrder)
            throw new ConflictException("Distributor actions apply to retailer orders only.");

        if (_currentUser.DistributorId is null || order.DistributorId != _currentUser.DistributorId)
            throw new ForbiddenAccessException("You can only action orders for your own distributorship.");

        var whtPercent = order.SubTotal > 0 ? order.WhtAmount / order.SubTotal * 100 : 0m;
        var shipToParty = order.Retailer?.IsEligibleForDirectShipToParty == true;

        switch (request.Decision)
        {
            case OrderStatus.ApprovedByDistributor:
                // Full fulfill from distributor inventory — OR Ship-to-Party → Pak Suzuki.
                foreach (var line in order.Items)
                    line.ApprovedQuantity = line.RequestedQuantity;
                order.Status = shipToParty
                    ? OrderStatus.PendingPakSuzukiApproval
                    : OrderStatus.ApprovedByDistributor;
                break;

            case OrderStatus.PartiallyApprovedByDistributor:
                if (shipToParty)
                    throw new ConflictException(
                        "Ship-to-Party (threshold) orders cannot be partially fulfilled from distributor inventory — confirm to send to Pak Suzuki.");
                ApplyPartialApproval(order, request.AmendedItems!);
                RecalculateTotalsFromApproved(order, whtPercent);
                order.Status = OrderStatus.PartiallyApprovedByDistributor;
                break;

            case OrderStatus.SentBackForModification:
                if (request.AmendedItems != null)
                {
                    ApplySendBackAmendments(order, request.AmendedItems);
                    RecalculateTotalsFromRequested(order, whtPercent);
                }
                order.Status = OrderStatus.SentBackForModification;
                break;

            case OrderStatus.ForwardedToPakSuzuki:
                // Cannot fulfill from inventory → place / forward to Pak Suzuki.
                if (shipToParty)
                    throw new ConflictException(
                        "Ship-to-Party orders are confirmed to Pak Suzuki with Confirm Order — not Order to Manufacturer cart.");
                foreach (var line in order.Items)
                    line.ApprovedQuantity = line.RequestedQuantity;
                order.Status = OrderStatus.PendingPakSuzukiApproval;
                break;

            case OrderStatus.RejectedByDistributor:
                order.Status = OrderStatus.RejectedByDistributor;
                break;

            default:
                throw new ConflictException($"Unsupported decision '{request.Decision}'.");
        }

        order.DistributorRemarks = request.Remarks;
        order.DistributorActionedAtUtc = _dateTime.UtcNow;
        await _context.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Partial from inventory: keep requested qty for audit, set approved qty (0..requested),
    /// and refresh line money snapshots from the approved quantity.
    /// </summary>
    private static void ApplyPartialApproval(Domain.Entities.Order order, List<ApproveOrderItemDto> amendedItems)
    {
        var map = amendedItems.ToDictionary(a => a.OrderItemId, a => a.ApprovedQuantity);
        foreach (var line in order.Items)
        {
            if (!map.TryGetValue(line.Id, out var approved))
            {
                // Lines omitted from payload are treated as not fulfilled from inventory.
                approved = 0;
            }

            if (approved < 0)
                throw new ConflictException("Approved quantity cannot be negative.");
            if (approved > line.RequestedQuantity)
                throw new ConflictException(
                    $"Approved quantity ({approved}) cannot exceed requested ({line.RequestedQuantity}) for line {line.Id}.");

            var gstRate = line.LineSubTotal > 0 ? line.LineGst / line.LineSubTotal : 0;
            var fedRate = line.LineSubTotal > 0 ? line.LineFed / line.LineSubTotal : 0;

            line.ApprovedQuantity = approved;
            line.LineSubTotal = Math.Round(line.UnitPrice * approved, 2);
            line.LineGst = Math.Round(line.LineSubTotal * gstRate, 2);
            line.LineFed = Math.Round(line.LineSubTotal * fedRate, 2);
        }

        if (order.Items.All(i => (i.ApprovedQuantity ?? 0) <= 0))
            throw new ConflictException("Partial approval must approve at least one unit from inventory.");

        if (order.Items.All(i => (i.ApprovedQuantity ?? 0) >= i.RequestedQuantity))
            throw new ConflictException("All lines are fully approved — use full Approve instead of Partial.");
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
        order.WhtAmount = Math.Round(order.SubTotal * whtPercent / 100, 2);
        order.GrandTotal = order.SubTotal + order.TotalGst + order.TotalFed + order.WhtAmount;
    }

    private static void RecalculateTotalsFromApproved(Domain.Entities.Order order, decimal whtPercent)
    {
        // Line snapshots were already updated to approved qty in ApplyPartialApproval.
        order.SubTotal = order.Items.Sum(i => i.LineSubTotal);
        order.TotalGst = order.Items.Sum(i => i.LineGst);
        order.TotalFed = order.Items.Sum(i => i.LineFed);
        order.WhtAmount = Math.Round(order.SubTotal * whtPercent / 100, 2);
        order.GrandTotal = order.SubTotal + order.TotalGst + order.TotalFed + order.WhtAmount;
    }
}
