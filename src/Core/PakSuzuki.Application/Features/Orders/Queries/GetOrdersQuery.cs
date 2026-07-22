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
    int PageNumber = 1, int PageSize = 20
) : IRequest<PaginatedList<OrderListDto>>;

public record OrderListDto(
    Guid Id, string OrderNumber, string Source, string? RetailerName, string? RetailerLocation,
    string DistributorName, string Status, decimal GrandTotal, DateTime CreatedAtUtc);

public class GetOrdersQueryHandler : IRequestHandler<GetOrdersQuery, PaginatedList<OrderListDto>>
{
    private readonly IApplicationDbContext _context;
    public GetOrdersQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<PaginatedList<OrderListDto>> Handle(GetOrdersQuery request, CancellationToken ct)
    {
        var query = _context.Orders
            .Where(o => request.DistributorIdScope == null || o.DistributorId == request.DistributorIdScope)
            .Where(o => request.RetailerIdScope == null || o.RetailerId == request.RetailerIdScope)
            .Where(o => request.StatusFilter == null || o.Status.ToString() == request.StatusFilter)
            .Where(o => request.Search == null
                || o.OrderNumber.Contains(request.Search)
                || o.Distributor.Name.Contains(request.Search)
                || (o.Retailer != null && o.Retailer.Name.Contains(request.Search)))
            .OrderByDescending(o => o.CreatedAtUtc)
            .Select(o => new OrderListDto(
                o.Id, o.OrderNumber, o.Source.ToString(),
                o.Retailer != null ? o.Retailer.Name : null,
                o.Retailer != null ? o.Retailer.BusinessAddress : null,
                o.Distributor.Name, o.Status.ToString(), o.GrandTotal, o.CreatedAtUtc));

        return await PaginatedList<OrderListDto>.CreateAsync(query, request.PageNumber, request.PageSize);
    }
}
