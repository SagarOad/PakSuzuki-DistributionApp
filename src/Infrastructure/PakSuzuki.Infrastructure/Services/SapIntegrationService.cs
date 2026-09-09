using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Orders;
using PakSuzuki.Domain.Entities;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Infrastructure.Services;

/// <summary>
/// Does not call SAP. After Pak Suzuki approval, writes the client parts_order queue row.
/// Middleware reads that table (and the two PO stored procedures), talks to SAP, and writes
/// SAP numbers / delivery / invoice / errors back into the app database.
/// </summary>
public class SapIntegrationService : ISapIntegrationService
{
    private readonly IApplicationDbContext _context;
    private readonly IDateTimeService _dateTime;
    private readonly ICurrentUserService _currentUser;

    public SapIntegrationService(
        IApplicationDbContext context, IDateTimeService dateTime, ICurrentUserService currentUser)
    {
        _context = context;
        _dateTime = dateTime;
        _currentUser = currentUser;
    }

    public async Task<SapOrderSubmissionResult> SubmitOrderAsync(Guid orderId, CancellationToken ct = default)
    {
        var order = await LoadOrderAsync(orderId, ct);
        if (order is null)
            return new SapOrderSubmissionResult(false, null, "Order not found.");

        var existing = await _context.PartsOrders.FirstOrDefaultAsync(q => q.OrderId == orderId, ct);
        if (existing is not null)
        {
            if (existing.SapTransferStatus == SapTransferFlags.SuccessfullyTransferred
                && !string.IsNullOrWhiteSpace(existing.SapSalesOrderNumber))
            {
                return new SapOrderSubmissionResult(true, existing.SapSalesOrderNumber, null);
            }

            if (existing.TransferFlag == SapTransferFlags.ReadyToTransfer)
                return new SapOrderSubmissionResult(true, existing.SapSalesOrderNumber, null);

            return await RetryExistingAsync(existing, ct);
        }

        var row = BuildQueueRow(order);
        _context.PartsOrders.Add(row);
        foreach (var line in BuildQueueLines(order, row))
            _context.PartsOrderLines.Add(line);
        await _context.SaveChangesAsync(ct);
        return new SapOrderSubmissionResult(true, null, null);
    }

    public async Task<SapOrderSubmissionResult> RetryOrderAsync(Guid orderId, CancellationToken ct = default)
    {
        var existing = await _context.PartsOrders.FirstOrDefaultAsync(q => q.OrderId == orderId, ct);
        if (existing is null)
            return await SubmitOrderAsync(orderId, ct);

        if (existing.SapTransferStatus == SapTransferFlags.SuccessfullyTransferred
            && !string.IsNullOrWhiteSpace(existing.SapSalesOrderNumber)
            && existing.QueueType != SapQueueTypes.Amendment)
        {
            return new SapOrderSubmissionResult(
                false,
                existing.SapSalesOrderNumber,
                "SAP already created a sales order for this PO. Correct the order and send an amendment instead of a new order.");
        }

        return await RetryExistingAsync(existing, ct);
    }

    public async Task<SapOrderStatusResult> GetOrderStatusAsync(string sapDocumentNumber, CancellationToken ct = default)
    {
        var queue = await _context.PartsOrders
            .AsNoTracking()
            .FirstOrDefaultAsync(
                q => q.SapSalesOrderNumber == sapDocumentNumber || q.PoRef == sapDocumentNumber,
                ct);

        if (queue is null)
            return new SapOrderStatusResult(null, null, null, false);

        var headers = await _context.PartsDeliveryHeaders
            .AsNoTracking()
            .Where(h => h.PoRef == queue.PoRef)
            .OrderByDescending(h => h.SapDeliveryDate)
            .ThenByDescending(h => h.Id)
            .ToListAsync(ct);

        var latest = headers.FirstOrDefault();
        var invoice = headers.FirstOrDefault(h => !string.IsNullOrWhiteSpace(h.InvoiceNumber));

        return new SapOrderStatusResult(
            latest?.SapDeliveryNumber,
            latest?.SapHuNumber,
            invoice?.InvoiceNumber ?? latest?.InvoiceNumber,
            invoice != null);
    }

    public async Task ApplyMiddlewareUpdatesToOrderAsync(Guid orderId, CancellationToken ct = default)
    {
        var order = await _context.Orders
            .Include(o => o.Items).ThenInclude(i => i.Product)
            .FirstOrDefaultAsync(o => o.Id == orderId, ct);
        if (order is null) return;

        var queue = await _context.PartsOrders.FirstOrDefaultAsync(q => q.OrderId == orderId, ct);
        if (queue is null) return;

        if (!string.IsNullOrWhiteSpace(queue.SapSalesOrderNumber))
            order.SapDocumentNumber = queue.SapSalesOrderNumber;

        if (queue.SapTransferStatus == SapTransferFlags.Error)
            return;

        var headers = await _context.PartsDeliveryHeaders
            .Where(h => h.PoRef == queue.PoRef)
            .OrderBy(h => h.SapDeliveryDate)
            .ThenBy(h => h.Id)
            .ToListAsync(ct);

        if (headers.Count == 0)
        {
            if (queue.SapTransferStatus == SapTransferFlags.SuccessfullyTransferred
                && order.Status == OrderStatus.SubmittedToSap)
            {
                queue.MiddlewareStatus = SapMiddlewareStatuses.SapOrderCreated;
            }

            await _context.SaveChangesAsync(ct);
            return;
        }

        var last = headers[^1];
        order.SapDeliveryNumber = last.SapDeliveryNumber ?? order.SapDeliveryNumber;
        order.SapGrnNumber = last.SapHuNumber ?? order.SapGrnNumber;

        var invoiced = headers.LastOrDefault(h => !string.IsNullOrWhiteSpace(h.InvoiceNumber));
        if (invoiced != null)
        {
            order.SapInvoiceNumber = invoiced.InvoiceNumber;
            order.InvoiceConfirmedAtUtc ??= invoiced.InvoiceDate?.ToUniversalTime() ?? _dateTime.UtcNow;
            order.Status = OrderStatus.InvoiceConfirmed;
            queue.MiddlewareStatus = SapMiddlewareStatuses.Completed;
            queue.TransferFlag = SapTransferFlags.SuccessfullyTransferred;
            queue.SapTransferStatus = SapTransferFlags.SuccessfullyTransferred;
        }
        else
        {
            var details = await _context.PartsDeliveryDetails
                .Where(d => d.PoRef == queue.PoRef)
                .ToListAsync(ct);

            var isPartial = OrderFulfillmentRules.AllowsPartialDelivery(order)
                && IsPartialDelivery(order, details);
            order.IsPartialDelivery = isPartial;
            order.Status = isPartial ? OrderStatus.PartiallyDelivered : OrderStatus.Delivered;
            queue.MiddlewareStatus = SapMiddlewareStatuses.InvoicePending;
        }

        queue.ModifiedAtUtc = _dateTime.UtcNow;
        await _context.SaveChangesAsync(ct);
    }

    private async Task<SapOrderSubmissionResult> RetryExistingAsync(PartsOrder existing, CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(existing.SapSalesOrderNumber)
            && existing.SapTransferStatus == SapTransferFlags.SuccessfullyTransferred)
        {
            existing.QueueType = SapQueueTypes.Amendment;
        }

        existing.TransferFlag = SapTransferFlags.ReadyToTransfer;
        existing.SapTransferStatus = SapTransferFlags.ReadyToTransfer;
        existing.SapMessage = null;
        existing.RetryCount += 1;
        existing.LastRetryAtUtc = _dateTime.UtcNow;
        existing.ModifiedAtUtc = _dateTime.UtcNow;
        existing.MiddlewareStatus = existing.QueueType == SapQueueTypes.Amendment
            ? SapMiddlewareStatuses.AmendmentPending
            : SapMiddlewareStatuses.PendingMiddlewarePickup;

        await _context.SaveChangesAsync(ct);
        return new SapOrderSubmissionResult(true, existing.SapSalesOrderNumber, null);
    }

    private PartsOrder BuildQueueRow(Order order)
    {
        var passThrough = order.FulfillmentChoice == OrderFulfillmentChoice.PassToPakSuzuki && order.ThresholdMet;
        if (order.Source == OrderSourceType.DistributorDirectOrder)
            SapPartnerCodes.ApplyDistributorDirectCodes(order);
        else if (passThrough && order.PakSuzukiShipTo is PakSuzukiShipTo shipTo)
            SapPartnerCodes.ApplyPassThroughCodes(order, shipTo);
        else
            SapPartnerCodes.ApplyDistributorDirectCodes(order);

        var dealerCode = order.DistributorCode ?? SapPartnerCodes.Distributor(order.Distributor);
        var sapDealer = order.Distributor.SapDealerCode ?? dealerCode;
        var refType = passThrough ? "PO4WR" : "PO4WD";
        var approver = _currentUser.UserId?.ToString();

        return new PartsOrder
        {
            OrderId = order.Id,
            TransferFlag = SapTransferFlags.ReadyToTransfer,
            SapTransferStatus = SapTransferFlags.ReadyToTransfer,
            DealerCode = dealerCode,
            SapDealerCode = sapDealer,
            PoRef = ToSapPoRef(order.OrderNumber),
            RefType = refType,
            DistributorCode = order.DistributorCode ?? dealerCode,
            RetailerCode = passThrough ? order.RetailerCode : null,
            ShipToCode = order.ShipToCode,
            BillToCode = order.BillToCode ?? sapDealer,
            QueueType = SapQueueTypes.Order,
            MiddlewareStatus = SapMiddlewareStatuses.PendingMiddlewarePickup,
            SapStatus = "Pending SAP",
            ApprovedBy = approver,
            ApprovedAtUtc = _dateTime.UtcNow,
            ApprovalDetails = passThrough
                ? $"Pak Suzuki approved. Ship to {order.PakSuzukiShipTo}. Threshold met. Retailer code included."
                : "Pak Suzuki approved. Distributor manufacturer order.",
            CreatedAtUtc = _dateTime.UtcNow
        };
    }

    private static IEnumerable<PartsOrderLine> BuildQueueLines(Order order, PartsOrder header)
    {
        foreach (var item in order.Items)
        {
            yield return new PartsOrderLine
            {
                PartsOrder = header,
                OrderItemId = item.Id,
                MaterialCode = item.Product?.Sku ?? "SAMPLE-MAT",
                ApprovedQuantity = item.ApprovedQuantity ?? item.RequestedQuantity,
                Uom = item.RequestedUnit.ToString()
            };
        }
    }

    internal static string ToSapPoRef(string orderNumber) =>
        orderNumber.Replace('/', '-').Replace(' ', '-');

    private async Task<Order?> LoadOrderAsync(Guid orderId, CancellationToken ct) =>
        await _context.Orders
            .Include(o => o.Distributor)
            .Include(o => o.Retailer)
            .Include(o => o.Items).ThenInclude(i => i.Product)
            .FirstOrDefaultAsync(o => o.Id == orderId, ct);

    private static bool IsPartialDelivery(Order order, List<PartsDeliveryDetail> details)
    {
        if (details.Count == 0) return order.IsPartialDelivery;

        var deliveredBySku = details
            .GroupBy(d => d.SapMaterial, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.Sum(x => x.SapDeliveredQuantity), StringComparer.OrdinalIgnoreCase);

        foreach (var line in order.Items)
        {
            var ordered = line.ApprovedQuantity ?? line.RequestedQuantity;
            var sku = line.Product?.Sku;
            if (string.IsNullOrWhiteSpace(sku)) continue;
            deliveredBySku.TryGetValue(sku, out var delivered);
            if (delivered + 0.0001m < ordered)
                return true;
        }

        return false;
    }
}
