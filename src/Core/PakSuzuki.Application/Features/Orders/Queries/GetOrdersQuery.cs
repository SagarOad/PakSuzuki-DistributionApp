using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Common.Models;
using PakSuzuki.Application.Features.Orders;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Orders.Queries;

// Scoping (retailer sees only their own orders, distributor sees only their own +
// their retailers', SuperAdmin sees all) is enforced by passing caller identity in;
// controller populates these from ICurrentUserService, never trusts client-supplied filters for scope.
public record GetOrdersQuery(
    Guid? DistributorIdScope, Guid? RetailerIdScope, string? StatusFilter, string? Search,
    string? SourceFilter = null,
    /// <summary>
    /// When true (Super Admin / Admin work queue): only DistributorDirectOrder + Ship-to-Party
    /// (threshold-eligible retailer) orders — not normal distributor-fulfilled retailer orders.
    /// </summary>
    bool PakSuzukiWorkQueueOnly = false,
    int PageNumber = 1, int PageSize = 20
) : IRequest<PaginatedList<OrderListDto>>;

public record OrderListDto(
    Guid Id, string OrderNumber, string Source, string? RetailerName, string? RetailerLocation,
    string DistributorName, string Status, string StatusLabel, string? StatusCode, decimal GrandTotal, DateTime CreatedAtUtc,
    bool ThresholdReached, string ShippedBy,
    string? ProductSummary, string? CategorySummary, string? PacksSummary, decimal TotalUnits,
    string? DistributorRemarks, string? RetailerRemarks, string? PakSuzukiRemarks,
    string StatusColor, string? SapInvoiceNumber, string? MiddlewareStatus, string? SapMessage);

public class GetOrdersQueryHandler : IRequestHandler<GetOrdersQuery, PaginatedList<OrderListDto>>
{
    private readonly IApplicationDbContext _context;
    public GetOrdersQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<PaginatedList<OrderListDto>> Handle(GetOrdersQuery request, CancellationToken ct)
    {
        // Parse filters in memory — never use enum.ToString() inside IQueryable (EF cannot translate).
        var hasSourceRaw = !string.IsNullOrWhiteSpace(request.SourceFilter);
        var hasStatusRaw = !string.IsNullOrWhiteSpace(request.StatusFilter);
        var sourceFilter = TryParseSource(request.SourceFilter);
        var statusFilter = TryParseStatus(request.StatusFilter);

        // Invalid filter values → empty page (do not silently drop the filter).
        if ((hasSourceRaw && sourceFilter is null) || (hasStatusRaw && statusFilter is null))
            return new PaginatedList<OrderListDto>([], 0, request.PageNumber, request.PageSize);

        var query = _context.Orders
            .AsNoTracking()
            .Where(o => request.DistributorIdScope == null || o.DistributorId == request.DistributorIdScope)
            .Where(o => request.RetailerIdScope == null || o.RetailerId == request.RetailerIdScope);

        if (statusFilter is not null)
            query = query.Where(o => o.Status == statusFilter.Value);

        if (sourceFilter is not null)
            query = query.Where(o => o.Source == sourceFilter.Value);

        query = query
            .Where(o => !request.PakSuzukiWorkQueueOnly
                || o.Source == OrderSourceType.DistributorDirectOrder
                || o.FulfillmentChoice == OrderFulfillmentChoice.PassToPakSuzuki)
            .Where(o => request.Search == null
                || o.OrderNumber.Contains(request.Search)
                || o.Distributor.Name.Contains(request.Search)
                || (o.Retailer != null && o.Retailer.Name.Contains(request.Search)))
            .OrderByDescending(o => o.CreatedAtUtc);

        var totalCount = await query.CountAsync(ct);
        var pageIds = await query
            .Skip((request.PageNumber - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(o => o.Id)
            .ToListAsync(ct);

        var orders = await _context.Orders
            .AsNoTracking()
            .Include(o => o.Retailer)
            .Include(o => o.Distributor)
            .Include(o => o.Items).ThenInclude(i => i.Product)
            .Where(o => pageIds.Contains(o.Id))
            .ToListAsync(ct);

        var byId = orders.ToDictionary(o => o.Id);
        var sapByOrder = await _context.PartsOrders.AsNoTracking()
            .Where(q => pageIds.Contains(q.OrderId))
            .ToDictionaryAsync(q => q.OrderId, ct);

        var retailerViewer = request.RetailerIdScope is not null;
        var viewer = OrderStatusDisplay.ResolveViewer(request.RetailerIdScope, request.DistributorIdScope);

        var items = pageIds
            .Where(id => byId.ContainsKey(id))
            .Select(id =>
            {
                var o = byId[id];
                sapByOrder.TryGetValue(o.Id, out var sap);
                var invoice = o.SapInvoiceNumber;
                var productNames = o.Items
                    .Select(i => i.Product?.Name)
                    .Where(n => !string.IsNullOrWhiteSpace(n))
                    .Cast<string>()
                    .ToList();
                var categories = o.Items
                    .Select(i => i.Product?.CategoryName)
                    .Where(c => !string.IsNullOrWhiteSpace(c))
                    .Distinct()
                    .Cast<string>()
                    .ToList();
                var packs = o.Items
                    .Select(i => i.VariantTypeName ?? i.RequestedUnit.ToString())
                    .Where(p => !string.IsNullOrWhiteSpace(p))
                    .Distinct()
                    .ToList();

                var statusCode = o.Status.ToString();
                var sentBackByPakSuzuki = o.Status == OrderStatus.PendingDistributorApproval
                    && o.PakSuzukiActionedAtUtc is not null;
                var statusLabel = OrderStatusDisplay.Contextual(
                    o.Status, viewer, o.ThresholdMet, sentBackByPakSuzuki, o.Source);
                // Retailers get a friendly status in `status` so mobile UIs never show SAP wording.
                var status = retailerViewer ? statusLabel : statusCode;

                return new OrderListDto(
                    o.Id, o.OrderNumber, o.Source.ToString(),
                    o.Retailer?.Name,
                    o.Retailer?.BusinessAddress,
                    o.Distributor?.Name ?? "Unknown", status, statusLabel, statusCode, o.GrandTotal, o.CreatedAtUtc,
                    o.ThresholdMet,
                    o.Source == OrderSourceType.DistributorDirectOrder
                        || o.FulfillmentChoice == OrderFulfillmentChoice.PassToPakSuzuki
                        ? "Pak Suzuki"
                        : "Distributor",
                    productNames.Count == 0 ? null : string.Join(", ", productNames),
                    categories.Count == 0 ? null : string.Join(", ", categories!),
                    packs.Count == 0 ? null : string.Join(", ", packs),
                    o.Items.Sum(i => i.ApprovedQuantity ?? i.RequestedQuantity),
                    o.DistributorRemarks,
                    o.RetailerRemarks,
                    o.PakSuzukiRemarks,
                    SapOrderDisplay.StatusColor(o.Status, invoice, o.SapDeliveryNumber, sap?.SapMessage, sap?.SapTransferStatus),
                    retailerViewer ? null : invoice,
                    retailerViewer ? null : sap?.MiddlewareStatus,
                    retailerViewer ? null : sap?.SapMessage
                );
            })
            .ToList();

        return new PaginatedList<OrderListDto>(items, totalCount, request.PageNumber, request.PageSize);
    }

    private static OrderSourceType? TryParseSource(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        if (raw is "0" or "RetailerOrder") return OrderSourceType.RetailerOrder;
        if (raw is "1" or "DistributorDirectOrder") return OrderSourceType.DistributorDirectOrder;
        return Enum.TryParse<OrderSourceType>(raw, ignoreCase: true, out var parsed) ? parsed : null;
    }

    private static OrderStatus? TryParseStatus(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        return Enum.TryParse<OrderStatus>(raw, ignoreCase: true, out var parsed) ? parsed : null;
    }
}
