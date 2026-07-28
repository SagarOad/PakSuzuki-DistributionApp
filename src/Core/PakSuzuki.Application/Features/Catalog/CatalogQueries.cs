using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Common.Models;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Catalog;

public record CatalogProductCardDto(
    Guid Id, string Sku, string Name, string? Description, string Category, string? CategoryName,
    string? PrimaryImageUrl, decimal DisplayPrice, bool InStock, string? PackLabel);

public record CatalogVariantDto(
    Guid Id, string TypeName, decimal UnitQuantity, decimal RetailPrice, decimal DistributorPrice,
    bool InStock, bool IsPublished);

public record CatalogProductDetailDto(
    Guid Id, string Sku, string Name, string? Description, string? Bio, string Category, string? CategoryName,
    string? PrimaryImageUrl, bool InStock, List<CatalogVariantDto> Variants, List<string> SectionImageUrls);

public record CatalogBannerDto(
    Guid Id, string Type, string ProductCode, string? BannerName, string CategoryName,
    string ImageUrl, Guid? ProductId, string? ProductName, int SortOrder);

public record GetCatalogProductsQuery(
    string ViewerRole,
    string? Category,
    string? Search,
    int PageNumber = 1,
    int PageSize = 24
) : IRequest<PaginatedList<CatalogProductCardDto>>;

public class GetCatalogProductsQueryHandler : IRequestHandler<GetCatalogProductsQuery, PaginatedList<CatalogProductCardDto>>
{
    private readonly IApplicationDbContext _context;
    public GetCatalogProductsQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<PaginatedList<CatalogProductCardDto>> Handle(GetCatalogProductsQuery request, CancellationToken ct)
    {
        var category = request.Category?.Trim();
        var isAll = string.IsNullOrWhiteSpace(category)
            || category.Equals("All", StringComparison.OrdinalIgnoreCase)
            || category.Equals("All Lubricant", StringComparison.OrdinalIgnoreCase);

        var query = _context.Products
            .AsNoTracking()
            .Where(p => p.IsActive && p.IsPublished)
            .Where(p => request.Search == null
                || p.Name.Contains(request.Search)
                || p.Sku.Contains(request.Search)
                || (p.CategoryName != null && p.CategoryName.Contains(request.Search)))
            .Where(p => isAll
                || (p.CategoryName != null && p.CategoryName == category)
                || p.Category.ToString() == NormalizeCategoryEnum(category));

        var isDistributor = request.ViewerRole == Roles.Distributor
            || request.ViewerRole == Roles.SuperAdmin
            || request.ViewerRole == Roles.Admin;

        var projected = query
            .OrderBy(p => p.Name)
            .Select(p => new
            {
                p.Id,
                p.Sku,
                p.Name,
                p.Description,
                Category = p.Category.ToString(),
                p.CategoryName,
                p.PrimaryImageUrl,
                p.InStock,
                Variant = p.Variants
                    .Where(v => v.IsPublished)
                    .OrderBy(v => v.SortOrder)
                    .FirstOrDefault(),
                Price = p.PriceHistory.FirstOrDefault(pp => pp.IsCurrent)
            })
            .Select(x => new CatalogProductCardDto(
                x.Id,
                x.Sku,
                x.Name,
                x.Description,
                x.Category,
                x.CategoryName,
                x.PrimaryImageUrl,
                x.Variant != null
                    ? (isDistributor ? x.Variant.DistributorPrice : x.Variant.RetailPrice)
                    : (isDistributor
                        ? (x.Price != null ? x.Price.SellingPrice : 0)
                        : (x.Price != null ? x.Price.RetailPrice : 0)),
                x.InStock,
                x.Variant != null ? x.Variant.TypeName : null
            ));

        return await PaginatedList<CatalogProductCardDto>.CreateAsync(projected, request.PageNumber, request.PageSize);
    }

    private static string NormalizeCategoryEnum(string? category)
    {
        if (string.IsNullOrWhiteSpace(category)) return string.Empty;
        var compact = category.Replace(" ", "", StringComparison.Ordinal);
        return compact switch
        {
            "MotorCar" => nameof(ProductCategory.MotorCar),
            "MotorBike" => nameof(ProductCategory.MotorBike),
            "MotorOil" => nameof(ProductCategory.MotorOil),
            _ => compact
        };
    }
}

public record GetCatalogProductByIdQuery(Guid Id, string ViewerRole) : IRequest<CatalogProductDetailDto>;

public class GetCatalogProductByIdQueryHandler : IRequestHandler<GetCatalogProductByIdQuery, CatalogProductDetailDto>
{
    private readonly IApplicationDbContext _context;
    public GetCatalogProductByIdQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<CatalogProductDetailDto> Handle(GetCatalogProductByIdQuery request, CancellationToken ct)
    {
        var product = await _context.Products
            .AsNoTracking()
            .Include(p => p.Variants)
            .Include(p => p.SectionImages)
            .FirstOrDefaultAsync(p => p.Id == request.Id && p.IsActive && p.IsPublished, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Product), request.Id);

        var variants = product.Variants
            .Where(v => v.IsPublished)
            .OrderBy(v => v.SortOrder)
            .ThenBy(v => v.TypeName)
            .Select(v => new CatalogVariantDto(
                v.Id, v.TypeName, v.UnitQuantity, v.RetailPrice, v.DistributorPrice, v.InStock, v.IsPublished))
            .ToList();

        return new CatalogProductDetailDto(
            product.Id, product.Sku, product.Name, product.Description, product.Bio,
            product.Category.ToString(), product.CategoryName, product.PrimaryImageUrl, product.InStock,
            variants,
            product.SectionImages.OrderBy(i => i.SortOrder).Select(i => i.ImageUrl).ToList());
    }
}

public record GetCatalogBannersQuery(ShopBannerType? Type) : IRequest<List<CatalogBannerDto>>;

public class GetCatalogBannersQueryHandler : IRequestHandler<GetCatalogBannersQuery, List<CatalogBannerDto>>
{
    private readonly IApplicationDbContext _context;
    public GetCatalogBannersQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<List<CatalogBannerDto>> Handle(GetCatalogBannersQuery request, CancellationToken ct)
    {
        return await _context.ShopBanners
            .AsNoTracking()
            .Where(b => b.IsActive)
            .Where(b => request.Type == null || b.Type == request.Type)
            .OrderBy(b => b.SortOrder)
            .Select(b => new CatalogBannerDto(
                b.Id, b.Type.ToString(), b.ProductCode, b.BannerName, b.CategoryName,
                b.ImageUrl, b.ProductId, b.Product != null ? b.Product.Name : null, b.SortOrder))
            .ToListAsync(ct);
    }
}
