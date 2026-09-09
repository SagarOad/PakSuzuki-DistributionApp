using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Orders;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Orders.Commands;

// 3.3.2/3.3.3: Pak Suzuki's own review step for orders forwarded by the distributor
// (or placed directly by the distributor). Approve keeps the order at
// ApprovedByPakSuzuki (ready for SAP submission); Cancelled rejects it outright;
// PendingDistributorApproval sends it back to the distributor for correction;
// PendingPakSuzukiApproval + AmendedItems applies quantity edits while staying in review.
public record PakSuzukiActionCommand(
    Guid OrderId,
    OrderStatus Decision,
    string? Remarks,
    List<ApproveOrderItemDto>? AmendedItems = null) : IRequest;

public class PakSuzukiActionCommandValidator : AbstractValidator<PakSuzukiActionCommand>
{
    private static readonly OrderStatus[] AllowedDecisions =
    {
        OrderStatus.ApprovedByPakSuzuki,
        OrderStatus.Cancelled,
        OrderStatus.PendingDistributorApproval,
        OrderStatus.PendingPakSuzukiApproval
    };

    public PakSuzukiActionCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty();
        RuleFor(x => x.Decision).Must(d => AllowedDecisions.Contains(d))
            .WithMessage("Decision must be one of: Approve, Reject (Cancelled), SendBack (PendingDistributorApproval), or Amend (PendingPakSuzukiApproval).");
        RuleFor(x => x)
            .Must(x => x.Decision != OrderStatus.PendingPakSuzukiApproval || (x.AmendedItems != null && x.AmendedItems.Count > 0))
            .WithMessage("Amend requires at least one amended line item.");
    }
}

public class PakSuzukiActionCommandHandler : IRequestHandler<PakSuzukiActionCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly IDateTimeService _dateTime;
    private readonly ISapIntegrationService _sapIntegration;
    private readonly IAppNotificationService _notifications;

    public PakSuzukiActionCommandHandler(
        IApplicationDbContext context,
        IDateTimeService dateTime,
        ISapIntegrationService sapIntegration,
        IAppNotificationService notifications)
    {
        _context = context;
        _dateTime = dateTime;
        _sapIntegration = sapIntegration;
        _notifications = notifications;
    }

    public async Task Handle(PakSuzukiActionCommand request, CancellationToken ct)
    {
        var order = await _context.Orders
            .Include(o => o.Distributor)
            .Include(o => o.Items).ThenInclude(i => i.Product).ThenInclude(p => p!.CatalogProfile)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Order), request.OrderId);

        if (order.Status != OrderStatus.PendingPakSuzukiApproval)
            throw new ConflictException($"Order is in status '{order.Status}' and cannot be actioned by Pak Suzuki right now.");

        if (request.AmendedItems is { Count: > 0 })
        {
            ApplyAmendments(order, request.AmendedItems);
            var whtPercent = OrderWhtCalculator.PercentFromOrder(order.SubTotal, order.WhtAmount);
            RecalculateTotalsFromRequested(order, whtPercent);

            // Soft-delete leaves removed lines in the collection; Product may be null when
            // the catalog row is soft-deleted (global query filter skips ThenInclude).
            var activeItems = order.Items.Where(i => !i.IsDeleted && i.RequestedQuantity > 0).ToList();
            await EnsureOrderItemProductsAsync(activeItems, ct);
            order.ThresholdMet = await OrderThresholdEvaluator.IsMetAsync(
                _context, order.DistributorId, activeItems, ct);
        }

        if (request.Decision == OrderStatus.PendingPakSuzukiApproval)
        {
            // Super Admin quantity amend always goes to the distributor for approval
            // (same pattern as distributor amend → retailer), never stays in SA queue alone.
            order.Status = OrderStatus.PendingDistributorApproval;
            order.PakSuzukiRemarks = request.Remarks;
            order.PakSuzukiActionedAtUtc = _dateTime.UtcNow;
            // Keep manufacturer path so distributor must approve back to Pak Suzuki
            // (same idea as retailer approving distributor amendments).
            order.FulfillmentChoice = OrderFulfillmentChoice.PassToPakSuzuki;

            await _context.SaveChangesAsync(ct);
            await NotifyPartiesAsync(order, ct);
            return;
        }

        order.Status = request.Decision;
        order.PakSuzukiRemarks = request.Remarks;
        order.PakSuzukiActionedAtUtc = _dateTime.UtcNow;

        if (request.Decision == OrderStatus.PendingDistributorApproval)
        {
            order.FulfillmentChoice = OrderFulfillmentChoice.PassToPakSuzuki;
        }

        await _context.SaveChangesAsync(ct);

        if (request.Decision == OrderStatus.ApprovedByPakSuzuki)
        {
            var result = await _sapIntegration.SubmitOrderAsync(order.Id, ct);
            if (!result.Success)
                throw new ConflictException(result.ErrorMessage ?? "Could not add the order to the SAP queue.");

            order.Status = OrderStatus.SubmittedToSap;
            if (!string.IsNullOrWhiteSpace(result.SapDocumentNumber))
                order.SapDocumentNumber = result.SapDocumentNumber;

            await _context.SaveChangesAsync(ct);
        }

        await NotifyPartiesAsync(order, ct);
    }

    private async Task NotifyPartiesAsync(Domain.Entities.Order order, CancellationToken ct)
    {
        var link = $"/orders/{order.Id}";
        var sentBack = order.Status == OrderStatus.PendingDistributorApproval
            && order.PakSuzukiActionedAtUtc is not null;
        var label = OrderStatusDisplay.Contextual(
            order.Status,
            OrderStatusDisplay.Viewer.Distributor,
            order.ThresholdMet,
            sentBack,
            order.Source);
        var title = sentBack
            ? "New amendment from Pak Suzuki"
            : "Pak Suzuki updated your order";
        await _notifications.NotifyDistributorAsync(
            order.DistributorId,
            title,
            $"Order {order.OrderNumber}: {label}.",
            NotificationCategories.Order,
            link,
            order.Id,
            ct);

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
    }

    private async Task EnsureOrderItemProductsAsync(IReadOnlyCollection<Domain.Entities.OrderItem> items, CancellationToken ct)
    {
        var missingIds = items
            .Where(i => i.Product is null)
            .Select(i => i.ProductId)
            .Distinct()
            .ToList();
        if (missingIds.Count == 0) return;

        // Ignore soft-delete so historical order lines still resolve pack conversion.
        var products = await _context.Products
            .IgnoreQueryFilters()
            .Include(p => p.CatalogProfile)
            .Where(p => missingIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, ct);

        foreach (var item in items)
        {
            if (item.Product is null && products.TryGetValue(item.ProductId, out var product))
                item.Product = product;
        }
    }

    private void ApplyAmendments(Domain.Entities.Order order, List<ApproveOrderItemDto> amendedItems)
    {
        foreach (var amended in amendedItems)
        {
            var line = order.Items.FirstOrDefault(i => i.Id == amended.OrderItemId);
            if (line is null) continue;

            if (amended.ApprovedQuantity <= 0)
            {
                line.RequestedQuantity = 0;
                line.ApprovedQuantity = 0;
                line.LineSubTotal = 0;
                line.LineGst = 0;
                line.LineFed = 0;
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
        var remaining = order.Items.Where(i => !i.IsDeleted && i.RequestedQuantity > 0).ToList();
        order.SubTotal = remaining.Sum(i => i.LineSubTotal);
        order.TotalGst = remaining.Sum(i => i.LineGst);
        order.TotalFed = remaining.Sum(i => i.LineFed);
        order.WhtAmount = OrderWhtCalculator.AmountFromSubTotal(order.SubTotal, whtPercent);
        order.GrandTotal = order.SubTotal + order.TotalGst + order.TotalFed + order.WhtAmount;
    }
}

// 3.3.3: hands the order off to SAP once Pak Suzuki has approved it.
public record SubmitOrderToSapCommand(Guid OrderId) : IRequest;

public class SubmitOrderToSapCommandValidator : AbstractValidator<SubmitOrderToSapCommand>
{
    public SubmitOrderToSapCommandValidator() => RuleFor(x => x.OrderId).NotEmpty();
}

public class SubmitOrderToSapCommandHandler : IRequestHandler<SubmitOrderToSapCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly ISapIntegrationService _sapIntegration;

    public SubmitOrderToSapCommandHandler(IApplicationDbContext context, ISapIntegrationService sapIntegration)
    {
        _context = context;
        _sapIntegration = sapIntegration;
    }

    public async Task Handle(SubmitOrderToSapCommand request, CancellationToken ct)
    {
        var order = await _context.Orders.FirstOrDefaultAsync(o => o.Id == request.OrderId, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Order), request.OrderId);

        if (order.Status != OrderStatus.ApprovedByPakSuzuki)
            throw new ConflictException($"Order is in status '{order.Status}' and must be approved by Pak Suzuki before it can be submitted to SAP.");

        var result = await _sapIntegration.SubmitOrderAsync(order.Id, ct);
        if (!result.Success)
            throw new ConflictException(result.ErrorMessage ?? "SAP queue rejected the order submission.");

        // Document number is filled later by middleware when SAP confirms.
        if (!string.IsNullOrWhiteSpace(result.SapDocumentNumber))
            order.SapDocumentNumber = result.SapDocumentNumber;

        order.Status = OrderStatus.SubmittedToSap;

        await _context.SaveChangesAsync(ct);
    }
}

public record RetrySapOrderCommand(Guid OrderId) : IRequest;

public class RetrySapOrderCommandValidator : AbstractValidator<RetrySapOrderCommand>
{
    public RetrySapOrderCommandValidator() => RuleFor(x => x.OrderId).NotEmpty();
}

public class RetrySapOrderCommandHandler : IRequestHandler<RetrySapOrderCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly ISapIntegrationService _sapIntegration;

    public RetrySapOrderCommandHandler(IApplicationDbContext context, ISapIntegrationService sapIntegration)
    {
        _context = context;
        _sapIntegration = sapIntegration;
    }

    public async Task Handle(RetrySapOrderCommand request, CancellationToken ct)
    {
        var order = await _context.Orders.FirstOrDefaultAsync(o => o.Id == request.OrderId, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Order), request.OrderId);

        if (order.Status is OrderStatus.Cancelled or OrderStatus.RejectedByDistributor)
            throw new ConflictException("Cancelled or rejected orders cannot be sent to SAP.");

        var result = await _sapIntegration.RetryOrderAsync(order.Id, ct);
        if (!result.Success)
            throw new ConflictException(result.ErrorMessage ?? "SAP retry was blocked to avoid a duplicate sales order.");

        if (order.Status is OrderStatus.ApprovedByPakSuzuki)
            order.Status = OrderStatus.SubmittedToSap;

        await _context.SaveChangesAsync(ct);
    }
}

// Polls SAP for delivery/GRN/invoice progress on an already-submitted order (3.3.3).
public record SapStatusDto(string? SapDocumentNumber, string? DeliveryNumber, string? GrnNumber, string? InvoiceNumber, bool IsInvoiced, string OrderStatus);

public record RefreshSapStatusCommand(Guid OrderId) : IRequest<SapStatusDto>;

public class RefreshSapStatusCommandValidator : AbstractValidator<RefreshSapStatusCommand>
{
    public RefreshSapStatusCommandValidator() => RuleFor(x => x.OrderId).NotEmpty();
}

public class RefreshSapStatusCommandHandler : IRequestHandler<RefreshSapStatusCommand, SapStatusDto>
{
    private readonly IApplicationDbContext _context;
    private readonly ISapIntegrationService _sapIntegration;

    public RefreshSapStatusCommandHandler(IApplicationDbContext context, ISapIntegrationService sapIntegration)
    {
        _context = context;
        _sapIntegration = sapIntegration;
    }

    public async Task<SapStatusDto> Handle(RefreshSapStatusCommand request, CancellationToken ct)
    {
        var order = await _context.Orders.FirstOrDefaultAsync(o => o.Id == request.OrderId, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Order), request.OrderId);

        var queued = await _context.PartsOrders.AsNoTracking()
            .AnyAsync(q => q.OrderId == order.Id, ct);
        if (string.IsNullOrEmpty(order.SapDocumentNumber) && !queued)
            throw new ConflictException("This order has not been submitted to SAP yet.");

        await _sapIntegration.ApplyMiddlewareUpdatesToOrderAsync(order.Id, ct);

        order = await _context.Orders.FirstAsync(o => o.Id == request.OrderId, ct);
        var invoiced = !string.IsNullOrEmpty(order.SapInvoiceNumber)
                       || order.Status == OrderStatus.InvoiceConfirmed;

        return new SapStatusDto(
            order.SapDocumentNumber, order.SapDeliveryNumber, order.SapGrnNumber, order.SapInvoiceNumber,
            invoiced, order.Status.ToString());
    }
}

// Internal profitability view (cost vs. selling) - not shown to Retailer/Distributor
// roles; controller should restrict this to SuperAdmin/Admin.
public record OrderProfitLineDto(string ProductName, decimal Quantity, decimal UnitCost, decimal UnitSell, decimal LineProfit);

public record OrderProfitDto(
    Guid OrderId, decimal CostTotal, decimal SellingTotal, decimal ProfitTotal, decimal MarginPercent,
    List<OrderProfitLineDto> Lines);

public record GetOrderProfitQuery(Guid OrderId) : IRequest<OrderProfitDto>;

public class GetOrderProfitQueryHandler : IRequestHandler<GetOrderProfitQuery, OrderProfitDto>
{
    private readonly IApplicationDbContext _context;
    public GetOrderProfitQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<OrderProfitDto> Handle(GetOrderProfitQuery request, CancellationToken ct)
    {
        var order = await _context.Orders
            .Include(o => o.Items).ThenInclude(i => i.Product).ThenInclude(p => p.PriceHistory)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Order), request.OrderId);

        var lines = new List<OrderProfitLineDto>();
        decimal costTotal = 0, sellingTotal = 0;

        foreach (var item in order.Items)
        {
            var quantity = item.ApprovedQuantity ?? item.RequestedQuantity;
            var currentPrice = item.Product.PriceHistory.FirstOrDefault(pp => pp.IsCurrent);
            var unitCost = currentPrice?.CostPrice ?? 0;
            var unitSell = item.UnitPrice;

            var lineCost = unitCost * quantity;
            var lineSell = unitSell * quantity;

            lines.Add(new OrderProfitLineDto(item.Product.Name, quantity, unitCost, unitSell, lineSell - lineCost));

            costTotal += lineCost;
            sellingTotal += lineSell;
        }

        var profitTotal = sellingTotal - costTotal;
        var marginPercent = costTotal == 0 ? 0 : Math.Round(profitTotal / costTotal * 100, 2);

        return new OrderProfitDto(order.Id, costTotal, sellingTotal, profitTotal, marginPercent, lines);
    }
}
