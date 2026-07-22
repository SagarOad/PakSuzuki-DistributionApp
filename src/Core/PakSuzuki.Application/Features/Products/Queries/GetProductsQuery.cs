using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Common.Models;

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
    public GetProductsQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<PaginatedList<ProductListDto>> Handle(GetProductsQuery request, CancellationToken ct)
    {
        var query = _context.Products
            .Where(p => p.IsActive)
            .Where(p => request.Search == null || p.Name.Contains(request.Search) || p.Sku.Contains(request.Search)
                || (p.CategoryName != null && p.CategoryName.Contains(request.Search)))
            .Select(p => new
            {
                p.Id, p.Sku, p.Name, p.Category, p.CategoryName, p.BaseUnit, p.IsPublished, p.PrimaryImageUrl,
                Price = p.PriceHistory.FirstOrDefault(pp => pp.IsCurrent),
                Units = p.Variants.Sum(v => v.UnitQuantity)
            });

        var isSuperAdmin = request.ViewerRole == Domain.Enums.Roles.SuperAdmin;
        var canSeeDistributorPricing = isSuperAdmin || request.ViewerRole == Domain.Enums.Roles.Distributor;

        var projected = query.Select(x => new ProductListDto(
            x.Id, x.Sku, x.Name, x.Category.ToString(), x.CategoryName, x.BaseUnit.ToString(),
            x.Units,
            isSuperAdmin && x.Price != null ? x.Price.CostPrice : null,
            canSeeDistributorPricing && x.Price != null ? x.Price.SellingPrice : null,
            x.Price != null ? x.Price.RetailPrice : 0,
            canSeeDistributorPricing && x.Price != null ? x.Price.MarginFixed : null,
            canSeeDistributorPricing && x.Price != null ? x.Price.MarginPercent : null,
            x.IsPublished,
            x.PrimaryImageUrl
        ));

        return await PaginatedList<ProductListDto>.CreateAsync(projected, request.PageNumber, request.PageSize);
    }
}
