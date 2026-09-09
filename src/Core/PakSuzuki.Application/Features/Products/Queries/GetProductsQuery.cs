using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Common.Models;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Products.Queries;

// Role-based price visibility per 3.2:
//   SuperAdmin -> full pricing (cost + selling + retail + margin)
//   Distributor -> selling + retail + margin
//   Retailer -> retail price only
// The "ViewerRole" is set by the controller from the authenticated user's claims.
public record GetProductsQuery(string ViewerRole, int PageNumber = 1, int PageSize = 20, string? Search = null)
    : IRequest<PaginatedList<ProductListDto>>;

public record ProductListDto(
    Guid Id, string Sku, string Name, string Category, string? CategoryName, string BaseUnit,
    decimal? Units, decimal? CostPrice, decimal? SellingPrice, decimal RetailPrice,
    decimal? MarginFixed, decimal? MarginPercent, bool IsPublished, string? PrimaryImageUrl);

public class GetProductsQueryHandler : IRequestHandler<GetProductsQuery, PaginatedList<ProductListDto>>
{
    private readonly IApplicationDbContext _context;
    private readonly IPriceVisibilityService _visibility;

    public GetProductsQueryHandler(IApplicationDbContext context, IPriceVisibilityService visibility)
    {
        _context = context;
        _visibility = visibility;
    }

    public async Task<PaginatedList<ProductListDto>> Handle(GetProductsQuery request, CancellationToken ct)
    {
        // Keep the SQL projection to mapped columns only.
        // Do NOT use enum.ToString() or ignored MarginFixed/MarginPercent inside IQueryable —
        // those fail EF translation and return HTTP 500 in production.
        var query = _context.Products
            .AsNoTracking()
            .Where(p => p.IsActive);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.Trim();
            query = query.Where(p =>
                p.Name.Contains(search)
                || p.Sku.Contains(search)
                || (p.CategoryName != null && p.CategoryName.Contains(search)));
        }

        var totalCount = await query.CountAsync(ct);

        List<ProductListRow> rows;
        try
        {
            rows = await query
                .OrderBy(p => p.Name)
                .Skip((request.PageNumber - 1) * request.PageSize)
                .Take(request.PageSize)
                .Select(p => new ProductListRow(
                    p.Id,
                    p.Sku,
                    p.Name,
                    p.Category,
                    p.CategoryName,
                    p.BaseUnit,
                    p.IsPublished,
                    p.PrimaryImageUrl,
                    p.PriceHistory.Where(pp => pp.IsCurrent).Select(pp => (decimal?)pp.CostPrice).FirstOrDefault(),
                    p.PriceHistory.Where(pp => pp.IsCurrent).Select(pp => (decimal?)pp.SellingPrice).FirstOrDefault(),
                    p.PriceHistory.Where(pp => pp.IsCurrent).Select(pp => (decimal?)pp.RetailPrice).FirstOrDefault(),
                    p.Variants.Sum(v => (decimal?)v.UnitQuantity) ?? 0m))
                .ToListAsync(ct);
        }
        catch (Exception)
        {
            // Older production DBs may miss ProductVariants / shop columns briefly.
            // Fall back to price-only list so /api/products does not hard-500.
            rows = await query
                .OrderBy(p => p.Name)
                .Skip((request.PageNumber - 1) * request.PageSize)
                .Take(request.PageSize)
                .Select(p => new ProductListRow(
                    p.Id,
                    p.Sku,
                    p.Name,
                    p.Category,
                    null,
                    p.BaseUnit,
                    false,
                    null,
                    p.PriceHistory.Where(pp => pp.IsCurrent).Select(pp => (decimal?)pp.CostPrice).FirstOrDefault(),
                    p.PriceHistory.Where(pp => pp.IsCurrent).Select(pp => (decimal?)pp.SellingPrice).FirstOrDefault(),
                    p.PriceHistory.Where(pp => pp.IsCurrent).Select(pp => (decimal?)pp.RetailPrice).FirstOrDefault(),
                    0m))
                .ToListAsync(ct);
        }

        var visibility = await _visibility.GetAsync(request.ViewerRole, ct);

        var items = rows.Select(x =>
        {
            decimal? marginFixed = null;
            decimal? marginPercent = null;
            if (visibility.CanSeePurchase && visibility.CanSeeCost && x.SellingPrice is decimal selling && x.CostPrice is decimal cost)
            {
                marginFixed = selling - cost;
                marginPercent = cost == 0 ? 0 : Math.Round((selling - cost) / cost * 100, 2);
            }

            return new ProductListDto(
                x.Id,
                x.Sku,
                x.Name,
                x.Category.ToString(),
                x.CategoryName,
                x.BaseUnit.ToString(),
                x.Units,
                visibility.CanSeeCost ? x.CostPrice : null,
                visibility.CanSeePurchase ? x.SellingPrice : null,
                visibility.CanSeeSale ? x.RetailPrice ?? 0 : 0,
                marginFixed,
                marginPercent,
                x.IsPublished,
                x.PrimaryImageUrl);
        }).ToList();

        return new PaginatedList<ProductListDto>(items, totalCount, request.PageNumber, request.PageSize);
    }

    private sealed record ProductListRow(
        Guid Id,
        string Sku,
        string Name,
        ProductCategory Category,
        string? CategoryName,
        UnitOfMeasure BaseUnit,
        bool IsPublished,
        string? PrimaryImageUrl,
        decimal? CostPrice,
        decimal? SellingPrice,
        decimal? RetailPrice,
        decimal Units);
}
