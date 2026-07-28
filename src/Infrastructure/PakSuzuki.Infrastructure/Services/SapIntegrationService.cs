using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Domain.Entities;

namespace PakSuzuki.Infrastructure.Services;

/// <summary>
/// Does not call SAP yet. Enqueues work for middleware; schema of PayloadJson/ExtJson
/// will be finalized when SAP contracts arrive.
/// </summary>
public class SapIntegrationService : ISapIntegrationService
{
    private readonly IApplicationDbContext _context;
    private readonly IDateTimeService _dateTime;

    public SapIntegrationService(IApplicationDbContext context, IDateTimeService dateTime)
    {
        _context = context;
        _dateTime = dateTime;
    }

    public async Task<SapOrderSubmissionResult> SubmitOrderAsync(Guid orderId, CancellationToken ct = default)
    {
        var order = await _context.Orders
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.Id == orderId, ct);

        if (order is null)
            return new SapOrderSubmissionResult(false, null, "Order not found.");

        var alreadyQueued = await _context.SapOutboundQueues.AnyAsync(
            q => q.OrderId == orderId
                 && q.QueueType == "OrderSubmission"
                 && (q.Status == "Pending" || q.Status == "Processing"),
            ct);

        if (!alreadyQueued)
        {
            // Placeholder payload — middleware will define the real contract.
            var payload = new
            {
                orderId = order.Id,
                orderNumber = order.OrderNumber,
                source = order.Source.ToString(),
                distributorId = order.DistributorId,
                retailerId = order.RetailerId,
                grandTotal = order.GrandTotal,
                items = order.Items.Select(i => new
                {
                    i.ProductId,
                    i.ProductVariantId,
                    i.VariantTypeName,
                    quantity = i.ApprovedQuantity ?? i.RequestedQuantity,
                    i.UnitPrice
                })
            };

            _context.SapOutboundQueues.Add(new SapOutboundQueue
            {
                OrderId = order.Id,
                QueueType = "OrderSubmission",
                Status = "Pending",
                CorrelationKey = order.OrderNumber,
                PayloadJson = JsonSerializer.Serialize(payload),
                ExtJson = null,
                NextAttemptAtUtc = _dateTime.UtcNow,
                AttemptCount = 0
            });

            await _context.SaveChangesAsync(ct);
        }

        // Document number stays null until middleware/SAP confirms.
        return new SapOrderSubmissionResult(true, null, null);
    }

    public Task<SapOrderStatusResult> GetOrderStatusAsync(string sapDocumentNumber, CancellationToken ct = default)
    {
        // Middleware will populate SAP fields on the order; until then return empty.
        return Task.FromResult(new SapOrderStatusResult(null, null, null, false));
    }
}
