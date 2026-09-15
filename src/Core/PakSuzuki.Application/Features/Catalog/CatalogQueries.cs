using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Common.Models;
using PakSuzuki.Application.Features.Orders;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Catalog;

public record CatalogProductCardDto(
    Guid Id, string Sku, string Name, string? Description, string Category, string? CategoryName,
    string? PrimaryImageUrl, decimal DisplayPrice, bool InStock, string? PackLabel,
    int? PackQuantity, decimal? UnitValue, string? UnitType, string? UnitLabel);

public record CatalogVariantDto(
    Guid Id, string TypeName, decimal UnitQuantity, decimal? RetailPrice, decimal? DistributorPrice,
    bool InStock, bool IsPublished,
    decimal? UnitValue, string? UnitType, string? UnitLabel, int? PackQuantity,
    decimal GstPercent, decimal FedPercent);

public record CatalogDistributorDto(
    Guid Id,
    string Name,
    string BusinessName,
    string MobileNumber,
    string? Email,
    string BusinessAddress,
    string? RegionName,
    string? ProfileImageUrl);

public record CatalogProductDetailDto(
    Guid Id, string Sku, string Name, string? Description, string? Bio, string Category, string? CategoryName,
    string? PrimaryImageUrl, bool InStock, List<CatalogVariantDto> Variants, List<string> SectionImageUrls,
    CatalogDistributorDto? Distributor,
    int? PackQuantity, decimal? UnitValue, string? UnitType, string? UnitLabel,
    string? Viscosity, string? ApiStandard, string? ModelCode, string? SourceCode,
    string? SupplierCode, string? DeliveryTypeCode, string? DeliveryTypeName);

public record CatalogBannerDto(
    Guid Id, string Type, string ProductCode, string? BannerName, string CategoryName,
    string ImageUrl, Guid? ProductId, string? ProductName, int SortOrder);

public record GetCatalogProductsQuery(
    string ViewerRole,
    string? Category,
    string? Search,
    int PageNumber = 1,
    int PageSize = 24,
    string? MaterialSourceCode = null,
    string? DeliveryTypeCode = null,
    string? SupplierCode = null
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
        var parsedCategory = isAll ? null : TryParseCategoryEnum(category);

        var query = _context.Products
            .AsNoTracking()
            .Where(p => p.IsActive && p.IsPublished)
            .Where(p => request.Search == null
                || p.Name.Contains(request.Search)
                || p.Sku.Contains(request.Search)
                || (p.CategoryName != null && p.CategoryName.Contains(request.Search)))
            .Where(p => isAll
                || (p.CategoryName != null && p.CategoryName == category)
                || (parsedCategory != null && p.Category == parsedCategory.Value));

        // Distributor manufacturer catalog hides discontinued SKUs.
        // Retailer catalog/API behavior is unchanged for the mobile app.
        if (request.ViewerRole == Roles.Distributor || request.ViewerRole == "LubeDistributor" || request.ViewerRole == "PartsDistributor")
            query = query.Where(p => p.CatalogProfile == null || !p.CatalogProfile.Discontinued);

        if (!string.IsNullOrWhiteSpace(request.MaterialSourceCode))
        {
            var source = OrderLaneCodes.NormalizeSource(request.MaterialSourceCode) ?? request.MaterialSourceCode.Trim();
            // Accept client/master variants (C.K.D / CKD, Inhouse / In house, etc.).
            query = query.Where(p => p.CatalogProfile != null
                && (p.CatalogProfile.SourceCode == source
                    || (source == "C.K.D."
                        && (p.CatalogProfile.SourceCode == "C.K.D"
                            || p.CatalogProfile.SourceCode == "C.K.D."
                            || p.CatalogProfile.SourceCode == "CKD"))
                    || (source == "In house"
                        && (p.CatalogProfile.SourceCode == "In house"
                            || p.CatalogProfile.SourceCode == "Inhouse"
                            || p.CatalogProfile.SourceCode == "IH"))));
        }

        if (!string.IsNullOrWhiteSpace(request.DeliveryTypeCode))
        {
            var delivery = request.DeliveryTypeCode.Trim();
            query = query.Where(p => p.CatalogProfile != null && p.CatalogProfile.PType.Code == delivery);
        }

        if (!string.IsNullOrWhiteSpace(request.SupplierCode))
        {
            var supplier = request.SupplierCode.Trim();
            query = query.Where(p => p.CatalogProfile != null && p.CatalogProfile.SupplierCode == supplier);
        }

        var totalCount = await query.CountAsync(ct);

        var pageRows = await query
            .OrderBy(p => p.Name)
            .Skip((request.PageNumber - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(p => new
            {
                p.Id,
                p.Sku,
                p.Name,
                p.Description,
                p.Category,
                p.CategoryName,
                p.PrimaryImageUrl,
                p.InStock,
                VariantDistributorPrice = p.Variants
                    .Where(v => v.IsPublished)
                    .OrderBy(v => v.SortOrder)
                    .Select(v => (decimal?)v.DistributorPrice)
                    .FirstOrDefault(),
                VariantRetailPrice = p.Variants
                    .Where(v => v.IsPublished)
                    .OrderBy(v => v.SortOrder)
                    .Select(v => (decimal?)v.RetailPrice)
                    .FirstOrDefault(),
                VariantTypeName = p.Variants
                    .Where(v => v.IsPublished)
                    .OrderBy(v => v.SortOrder)
                    .Select(v => v.TypeName)
                    .FirstOrDefault(),
                VariantQty = p.Variants
                    .Where(v => v.IsPublished)
                    .OrderBy(v => v.SortOrder)
                    .Select(v => (int?)v.UnitQuantity)
                    .FirstOrDefault(),
                PackQuantity = p.CatalogProfile != null ? (int?)p.CatalogProfile.PackQuantity : null,
                UnitValue = p.CatalogProfile != null ? (decimal?)p.CatalogProfile.UnitValue : null,
                UnitType = p.CatalogProfile != null ? p.CatalogProfile.UnitType : null,
                SellingPrice = p.PriceHistory
                    .Where(pp => pp.IsCurrent)
                    .Select(pp => (decimal?)pp.SellingPrice)
                    .FirstOrDefault(),
                RetailPrice = p.PriceHistory
                    .Where(pp => pp.IsCurrent)
                    .Select(pp => (decimal?)pp.RetailPrice)
                    .FirstOrDefault()
            })
            .ToListAsync(ct);

        var cards = pageRows.Select(x =>
        {
            var isRetailer = request.ViewerRole == Roles.Retailer
                || request.ViewerRole == "LubeRetailer"
                || request.ViewerRole == "PartsRetailer";
            decimal displayPrice;
            if (isRetailer)
                displayPrice = x.VariantRetailPrice ?? x.RetailPrice ?? 0;
            else if (x.VariantRetailPrice is not null || x.VariantDistributorPrice is not null)
                displayPrice = x.VariantDistributorPrice ?? x.VariantRetailPrice ?? 0;
            else
                displayPrice = x.SellingPrice ?? x.RetailPrice ?? 0;

            var packQty = x.PackQuantity ?? x.VariantQty;
            var unitLabel = FormatUnitLabel(x.UnitValue, x.UnitType);
            var packLabel = !string.IsNullOrWhiteSpace(x.VariantTypeName)
                ? x.VariantTypeName
                : BuildPackLabel(packQty, unitLabel);

            return new CatalogProductCardDto(
                x.Id,
                x.Sku,
                x.Name,
                x.Description,
                x.Category.ToString(),
                x.CategoryName,
                x.PrimaryImageUrl,
                displayPrice,
                x.InStock,
                packLabel,
                packQty,
                x.UnitValue,
                x.UnitType,
                unitLabel);
        }).ToList();

        return new PaginatedList<CatalogProductCardDto>(cards, totalCount, request.PageNumber, request.PageSize);
    }

    private static ProductCategory? TryParseCategoryEnum(string? category)
    {
        if (string.IsNullOrWhiteSpace(category)) return null;
        var compact = category.Replace(" ", "", StringComparison.Ordinal);
        return compact switch
        {
            "MotorCar" => ProductCategory.MotorCar,
            "MotorBike" => ProductCategory.MotorBike,
            "MotorOil" => ProductCategory.MotorOil,
            _ => Enum.TryParse<ProductCategory>(compact, true, out var parsed) ? parsed : null
        };
    }

    internal static string? FormatUnitLabel(decimal? unitValue, string? unitType)
    {
        if (unitValue is null && string.IsNullOrWhiteSpace(unitType)) return null;
        var number = unitValue is null
            ? null
            : unitValue.Value == decimal.Truncate(unitValue.Value)
                ? decimal.Truncate(unitValue.Value).ToString()
                : unitValue.Value.ToString("0.####");
        if (string.IsNullOrWhiteSpace(unitType)) return number;
        return string.IsNullOrWhiteSpace(number) ? unitType : $"{number} {unitType}";
    }

    internal static string? BuildPackLabel(int? packQuantity, string? unitLabel)
    {
        if (packQuantity is null or <= 0 && string.IsNullOrWhiteSpace(unitLabel)) return null;
        if (packQuantity is null or <= 0) return unitLabel;
        if (string.IsNullOrWhiteSpace(unitLabel)) return $"{packQuantity} pcs / pack";
        return $"{packQuantity} × {unitLabel}";
    }
}

public record GetCatalogProductByIdQuery(
    Guid Id,
    string ViewerRole,
    Guid? DistributorId,
    Guid? RetailerId) : IRequest<CatalogProductDetailDto>;

public class GetCatalogProductByIdQueryHandler : IRequestHandler<GetCatalogProductByIdQuery, CatalogProductDetailDto>
{
    private readonly IApplicationDbContext _context;
    private readonly IPriceVisibilityService _visibility;

    public GetCatalogProductByIdQueryHandler(IApplicationDbContext context, IPriceVisibilityService visibility)
    {
        _context = context;
        _visibility = visibility;
    }

    public async Task<CatalogProductDetailDto> Handle(GetCatalogProductByIdQuery request, CancellationToken ct)
    {
        var product = await _context.Products
            .AsNoTracking()
            .Include(p => p.Variants)
            .Include(p => p.PriceHistory)
            .Include(p => p.SectionImages)
            .Include(p => p.CatalogProfile).ThenInclude(c => c!.PType)
            .FirstOrDefaultAsync(p => p.Id == request.Id && p.IsActive && p.IsPublished, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Product), request.Id);

        // Distributor-only discontinue gate. Do not alter retailer catalog detail responses.
        if ((request.ViewerRole == Roles.Distributor || request.ViewerRole == "LubeDistributor" || request.ViewerRole == "PartsDistributor")
            && product.CatalogProfile?.Discontinued == true)
            throw new NotFoundException(nameof(Domain.Entities.Product), request.Id);

        var visibility = await _visibility.GetAsync(request.ViewerRole, ct);
        var profile = product.CatalogProfile;
        var packQty = profile?.PackQuantity;
        var unitValue = profile?.UnitValue;
        var unitType = profile?.UnitType;
        var unitLabel = GetCatalogProductsQueryHandler.FormatUnitLabel(unitValue, unitType);
        var currentPrice = product.PriceHistory.FirstOrDefault(pp => pp.IsCurrent);

        var variants = product.Variants
            .Where(v => v.IsPublished)
            .OrderBy(v => v.SortOrder)
            .ThenBy(v => v.TypeName)
            .Select(v =>
            {
                var pieces = packQty ?? (int)v.UnitQuantity;
                var label = !string.IsNullOrWhiteSpace(v.TypeName)
                    ? v.TypeName
                    : GetCatalogProductsQueryHandler.BuildPackLabel(pieces, unitLabel) ?? "Pack";
                // Same tax resolution as CreateOrder: variant first, then current price row.
                var gstPercent = v.GstPercent > 0 ? v.GstPercent : currentPrice?.GstPercent ?? 0;
                var fedPercent = v.FedPercent > 0 ? v.FedPercent : currentPrice?.FedPercent ?? 0;
                return new CatalogVariantDto(
                    v.Id, label, v.UnitQuantity,
                    visibility.CanSeeSale ? v.RetailPrice : null,
                    visibility.CanSeePurchase ? v.DistributorPrice : null,
                    v.InStock, v.IsPublished,
                    unitValue, unitType, unitLabel, pieces,
                    gstPercent, fedPercent);
            })
            .ToList();

        var distributor = await ResolveDistributorAsync(request.DistributorId, request.RetailerId, ct);

        return new CatalogProductDetailDto(
            product.Id, product.Sku, product.Name, product.Description, product.Bio,
            product.Category.ToString(), product.CategoryName, product.PrimaryImageUrl, product.InStock,
            variants,
            product.SectionImages.OrderBy(i => i.SortOrder).Select(i => i.ImageUrl).ToList(),
            distributor,
            packQty, unitValue, unitType, unitLabel,
            profile?.Viscosity, profile?.ApiStandard, profile?.ModelCode, profile?.SourceCode,
            profile?.SupplierCode, profile?.PType?.Code, profile?.PType?.DeliveryType);
    }

    private async Task<CatalogDistributorDto?> ResolveDistributorAsync(
        Guid? distributorId, Guid? retailerId, CancellationToken ct)
    {
        Guid? resolvedId = distributorId;
        if (resolvedId is null && retailerId is not null)
        {
            resolvedId = await _context.Retailers
                .AsNoTracking()
                .Where(r => r.Id == retailerId)
                .Select(r => (Guid?)r.DistributorId)
                .FirstOrDefaultAsync(ct);
        }

        if (resolvedId is null)
            return null;

        return await _context.Distributors
            .AsNoTracking()
            .Where(d => d.Id == resolvedId)
            .Select(d => new CatalogDistributorDto(
                d.Id,
                d.Name,
                d.BusinessName,
                d.MobileNumber,
                d.Email,
                d.BusinessAddress,
                d.Region != null ? d.Region.Name : null,
                d.ProfileImageUrl))
            .FirstOrDefaultAsync(ct);
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
            .Where(b => b.ImageUrl != null && b.ImageUrl != "")
            .Where(b => request.Type == null || b.Type == request.Type)
            .OrderBy(b => b.SortOrder)
            .Select(b => new CatalogBannerDto(
                b.Id, b.Type.ToString(), b.ProductCode, b.BannerName, b.CategoryName,
                b.ImageUrl, b.ProductId, b.Product != null ? b.Product.Name : null, b.SortOrder))
            .ToListAsync(ct);
    }
}
