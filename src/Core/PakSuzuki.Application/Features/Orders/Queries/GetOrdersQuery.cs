using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Common.Models;

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
    string DistributorName, string Status, decimal GrandTotal, DateTime CreatedAtUtc,
    bool ThresholdReached, string ShippedBy,
    string? ProductSummary, string? CategorySummary, string? PacksSummary, decimal TotalUnits,
    string? DistributorRemarks);

public class GetOrdersQueryHandler : IRequestHandler<GetOrdersQuery, PaginatedList<OrderListDto>>
{
    private readonly IApplicationDbContext _context;
    public GetOrdersQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<PaginatedList<OrderListDto>> Handle(GetOrdersQuery request, CancellationToken ct)
    {
        var query = _context.Orders
            .AsNoTracking()
            .Where(o => request.DistributorIdScope == null || o.DistributorId == request.DistributorIdScope)
            .Where(o => request.RetailerIdScope == null || o.RetailerId == request.RetailerIdScope)
            .Where(o => request.StatusFilter == null || o.Status.ToString() == request.StatusFilter)
            .Where(o => request.SourceFilter == null
                || o.Source.ToString() == request.SourceFilter
                || (request.SourceFilter == "RetailerOrder" && o.Source == Domain.Enums.OrderSourceType.RetailerOrder)
                || (request.SourceFilter == "DistributorDirectOrder" && o.Source == Domain.Enums.OrderSourceType.DistributorDirectOrder))
            .Where(o => !request.PakSuzukiWorkQueueOnly
                || o.Source == Domain.Enums.OrderSourceType.DistributorDirectOrder
                || (o.Source == Domain.Enums.OrderSourceType.RetailerOrder
                    && o.Retailer != null
                    && o.Retailer.IsEligibleForDirectShipToParty))
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
        var items = pageIds
            .Where(id => byId.ContainsKey(id))
            .Select(id =>
            {
                var o = byId[id];
                var productNames = o.Items.Select(i => i.Product.Name).Where(n => !string.IsNullOrWhiteSpace(n)).ToList();
                var categories = o.Items
                    .Select(i => i.Product.CategoryName)
                    .Where(c => !string.IsNullOrWhiteSpace(c))
                    .Distinct()
                    .ToList();
                var packs = o.Items
                    .Select(i => i.VariantTypeName ?? i.RequestedUnit.ToString())
                    .Where(p => !string.IsNullOrWhiteSpace(p))
                    .Distinct()
                    .ToList();

                return new OrderListDto(
                    o.Id, o.OrderNumber, o.Source.ToString(),
                    o.Retailer?.Name,
                    o.Retailer?.BusinessAddress,
                    o.Distributor.Name, o.Status.ToString(), o.GrandTotal, o.CreatedAtUtc,
                    o.Retailer?.IsEligibleForDirectShipToParty ?? false,
                    o.Source == Domain.Enums.OrderSourceType.DistributorDirectOrder
                        ? "Pak Suzuki"
                        : (o.Retailer?.IsEligibleForDirectShipToParty == true ? "Pak Suzuki" : "Distributor"),
                    productNames.Count == 0 ? null : string.Join(", ", productNames),
                    categories.Count == 0 ? null : string.Join(", ", categories!),
                    packs.Count == 0 ? null : string.Join(", ", packs),
                    o.Items.Sum(i => i.ApprovedQuantity ?? i.RequestedQuantity),
                    o.DistributorRemarks
                );
            })
            .ToList();

        return new PaginatedList<OrderListDto>(items, totalCount, request.PageNumber, request.PageSize);
    }
}
