using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Images;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Domain.Entities;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Shop.Products;

public record ProductVariantDto(
    Guid Id, string TypeName, decimal UnitQuantity, decimal? RetailPrice, decimal? DistributorPrice,
    decimal? CostPrice, decimal GstPercent, decimal FedPercent, decimal WhtPercent, decimal? ProfitAmount,
    bool InStock, bool IsPublished, int SortOrder);

public record ShopProductDetailDto(
    Guid Id, string Sku, string Name, string? Description, string? Bio, string Category, string? CategoryName,
    string BaseUnit, string? PrimaryImageUrl, bool IsPublished, bool InStock, bool IsActive,
    decimal SuzukiProfitPercent, decimal DistributorProfitPercent,
    List<ProductVariantDto> Variants, List<string> SectionImageUrls);

public record ProductVariantInput(
    Guid? Id, string TypeName, decimal UnitQuantity, decimal RetailPrice, decimal DistributorPrice,
    decimal CostPrice, decimal GstPercent, decimal FedPercent, decimal WhtPercent, decimal ProfitAmount,
    bool InStock, bool IsPublished, int SortOrder = 0);

public record GetShopProductByIdQuery(Guid Id, string ViewerRole) : IRequest<ShopProductDetailDto>;

public class GetShopProductByIdQueryHandler : IRequestHandler<GetShopProductByIdQuery, ShopProductDetailDto>
{
    private readonly IApplicationDbContext _context;
    private readonly IPriceVisibilityService _visibility;

    public GetShopProductByIdQueryHandler(IApplicationDbContext context, IPriceVisibilityService visibility)
    {
        _context = context;
        _visibility = visibility;
    }

    public async Task<ShopProductDetailDto> Handle(GetShopProductByIdQuery request, CancellationToken ct)
    {
        var product = await _context.Products
            .Include(p => p.Variants)
            .Include(p => p.SectionImages)
            .FirstOrDefaultAsync(p => p.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Product), request.Id);

        var visibility = await _visibility.GetAsync(request.ViewerRole, ct);
        return Map(product, visibility);
    }

    internal static ShopProductDetailDto Map(Product product, PriceVisibility visibility)
    {
        var variants = product.Variants.OrderBy(v => v.SortOrder).ThenBy(v => v.TypeName).ToList();
        var (suzukiPct, distPct) = visibility.CanSeeCost && visibility.CanSeePurchase
            ? ProfitMargins(variants)
            : (0m, 0m);

        return new ShopProductDetailDto(
            product.Id, product.Sku, product.Name, product.Description, product.Bio,
            product.Category.ToString(), product.CategoryName, product.BaseUnit.ToString(),
            product.PrimaryImageUrl, product.IsPublished, product.InStock, product.IsActive,
            suzukiPct, distPct,
            variants.Select(v => new ProductVariantDto(
                v.Id, v.TypeName, v.UnitQuantity,
                visibility.CanSeeSale ? v.RetailPrice : null,
                visibility.CanSeePurchase ? v.DistributorPrice : null,
                visibility.CanSeeCost ? v.CostPrice : null,
                v.GstPercent, v.FedPercent, v.WhtPercent,
                visibility.CanSeePurchase ? v.ProfitAmount : null,
                v.InStock, v.IsPublished, v.SortOrder
            )).ToList(),
            product.SectionImages.OrderBy(i => i.SortOrder).Select(i => i.ImageUrl).ToList());
    }

    private static (decimal Suzuki, decimal Distributor) ProfitMargins(IReadOnlyList<ProductVariant> variants)
    {
        var primary = variants.FirstOrDefault();
        if (primary is null || primary.RetailPrice <= 0)
            return (0, 0);

        var suzuki = Math.Round((primary.RetailPrice - primary.DistributorPrice) / primary.RetailPrice * 100, 1);
        var distributor = Math.Round((primary.DistributorPrice - primary.CostPrice) / primary.RetailPrice * 100, 1);
        return (Math.Max(0, suzuki), Math.Max(0, distributor));
    }
}

public record UpsertShopProductCommand(
    Guid? Id,
    string Sku,
    string Name,
    string? Description,
    string? Bio,
    string CategoryName,
    string? PrimaryImageUrl,
    bool IsPublished,
    bool InStock,
    List<ProductVariantInput> Variants,
    List<string>? SectionImageUrls
) : IRequest<Guid>;

public class UpsertShopProductCommandValidator : AbstractValidator<UpsertShopProductCommand>
{
    public UpsertShopProductCommandValidator()
    {
        RuleFor(x => x.Sku).NotEmpty().MaximumLength(50);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.CategoryName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Bio).MaximumLength(500);
        RuleFor(x => x.Variants).NotEmpty().WithMessage("Add at least one product type.");
        RuleForEach(x => x.Variants).ChildRules(v =>
        {
            v.RuleFor(r => r.TypeName).NotEmpty().MaximumLength(100);
            v.RuleFor(r => r.UnitQuantity).GreaterThanOrEqualTo(0);
            v.RuleFor(r => r.RetailPrice).GreaterThanOrEqualTo(0);
            v.RuleFor(r => r.DistributorPrice).GreaterThanOrEqualTo(0);
            v.RuleFor(r => r.CostPrice).GreaterThanOrEqualTo(0);
        });
    }
}

public class UpsertShopProductCommandHandler : IRequestHandler<UpsertShopProductCommand, Guid>
{
    private readonly IApplicationDbContext _context;
    public UpsertShopProductCommandHandler(IApplicationDbContext context) => _context = context;

    public async Task<Guid> Handle(UpsertShopProductCommand request, CancellationToken ct)
    {
        Product product;
        if (request.Id is Guid id)
        {
            product = await _context.Products
                .Include(p => p.Variants)
                .Include(p => p.SectionImages)
                .Include(p => p.PriceHistory)
                .FirstOrDefaultAsync(p => p.Id == id, ct)
                ?? throw new NotFoundException(nameof(Product), id);
        }
        else
        {
            var skuExists = await _context.Products.AnyAsync(p => p.Sku == request.Sku, ct);
            if (skuExists)
                throw new ConflictException($"A product with SKU '{request.Sku}' already exists.");

            product = new Product { Sku = request.Sku.Trim() };
            _context.Products.Add(product);
        }

        if (!string.Equals(product.Sku, request.Sku.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            var clash = await _context.Products.AnyAsync(p => p.Sku == request.Sku.Trim() && p.Id != product.Id, ct);
            if (clash)
                throw new ConflictException($"A product with SKU '{request.Sku}' already exists.");
            product.Sku = request.Sku.Trim();
        }

        product.Name = request.Name.Trim();
        product.Description = request.Description;
        product.Bio = request.Bio;
        product.CategoryName = request.CategoryName.Trim();
        product.Category = MapCategory(request.CategoryName);
        product.BaseUnit = UnitOfMeasure.Liter;
        if (!string.IsNullOrWhiteSpace(request.PrimaryImageUrl))
            product.PrimaryImageUrl = request.PrimaryImageUrl;
        product.IsPublished = request.IsPublished;
        product.InStock = request.InStock;
        product.IsActive = true;

        SyncVariants(product, request.Variants);
        SyncSectionImages(product, request.SectionImageUrls);
        SyncCurrentPriceFromPrimaryVariant(product);

        await _context.SaveChangesAsync(ct);
        return product.Id;
    }

    private static void SyncVariants(Product product, List<ProductVariantInput> inputs)
    {
        var keepIds = inputs.Where(i => i.Id.HasValue).Select(i => i.Id!.Value).ToHashSet();
        foreach (var orphan in product.Variants.Where(v => !keepIds.Contains(v.Id)).ToList())
            product.Variants.Remove(orphan);

        var order = 0;
        foreach (var input in inputs)
        {
            ProductVariant variant;
            if (input.Id is Guid vid)
            {
                variant = product.Variants.FirstOrDefault(v => v.Id == vid)
                    ?? new ProductVariant { Id = vid };
                if (!product.Variants.Contains(variant))
                    product.Variants.Add(variant);
            }
            else
            {
                variant = new ProductVariant();
                product.Variants.Add(variant);
            }

            variant.TypeName = input.TypeName.Trim();
            variant.UnitQuantity = input.UnitQuantity;
            variant.RetailPrice = input.RetailPrice;
            variant.DistributorPrice = input.DistributorPrice;
            variant.CostPrice = input.CostPrice;
            variant.GstPercent = input.GstPercent;
            variant.FedPercent = input.FedPercent;
            variant.WhtPercent = input.WhtPercent;
            variant.ProfitAmount = input.ProfitAmount;
            variant.InStock = input.InStock;
            variant.IsPublished = input.IsPublished;
            variant.SortOrder = input.SortOrder != 0 ? input.SortOrder : order++;
        }
    }

    private static void SyncSectionImages(Product product, List<string>? urls)
    {
        if (urls is null) return;

        foreach (var existing in product.SectionImages.ToList())
            product.SectionImages.Remove(existing);

        var order = 0;
        foreach (var url in urls.Where(u => !string.IsNullOrWhiteSpace(u)))
        {
            product.SectionImages.Add(new ProductSectionImage
            {
                ImageUrl = url,
                SortOrder = order++
            });
        }
    }

    private static void SyncCurrentPriceFromPrimaryVariant(Product product)
    {
        var primary = product.Variants.OrderBy(v => v.SortOrder).FirstOrDefault();
        if (primary is null) return;

        var current = product.PriceHistory.FirstOrDefault(p => p.IsCurrent);
        if (current is null)
        {
            product.PriceHistory.Add(new ProductPrice
            {
                CostPrice = primary.CostPrice,
                SellingPrice = primary.DistributorPrice,
                RetailPrice = primary.RetailPrice,
                GstPercent = primary.GstPercent,
                FedPercent = primary.FedPercent,
                WhtPercent = primary.WhtPercent,
                IsCurrent = true,
                EffectiveFromUtc = DateTime.UtcNow
            });
        }
        else
        {
            current.CostPrice = primary.CostPrice;
            current.SellingPrice = primary.DistributorPrice;
            current.RetailPrice = primary.RetailPrice;
            current.GstPercent = primary.GstPercent;
            current.FedPercent = primary.FedPercent;
            current.WhtPercent = primary.WhtPercent;
        }
    }

    internal static ProductCategory MapCategory(string categoryName) =>
        categoryName.Trim().ToLowerInvariant() switch
        {
            "motor car" => ProductCategory.MotorCar,
            "motor bike" => ProductCategory.MotorBike,
            "motor oil" => ProductCategory.MotorOil,
            "lube" => ProductCategory.Lube,
            "parts" => ProductCategory.Parts,
            "one s 4w" or "ones4w" => ProductCategory.OneS4W,
            "one s 2w" or "ones2w" => ProductCategory.OneS2W,
            _ => ProductCategory.MotorOil
        };
}

public record DeleteShopProductCommand(Guid Id) : IRequest;

public class DeleteShopProductCommandHandler : IRequestHandler<DeleteShopProductCommand>
{
    private readonly IApplicationDbContext _context;
    public DeleteShopProductCommandHandler(IApplicationDbContext context) => _context = context;

    public async Task Handle(DeleteShopProductCommand request, CancellationToken ct)
    {
        var product = await _context.Products.FirstOrDefaultAsync(p => p.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Product), request.Id);
        product.IsActive = false;
        _context.Products.Remove(product);
        await _context.SaveChangesAsync(ct);
    }
}

public record UploadProductPrimaryImageCommand(Guid Id, string FileName, Stream Content) : IRequest<string>;

public class UploadProductPrimaryImageCommandHandler : IRequestHandler<UploadProductPrimaryImageCommand, string>
{
    private const string Container = "product-images";
    private readonly IApplicationDbContext _context;
    private readonly IFileStorageService _files;

    public UploadProductPrimaryImageCommandHandler(IApplicationDbContext context, IFileStorageService files)
    {
        _context = context;
        _files = files;
    }

    public async Task<string> Handle(UploadProductPrimaryImageCommand request, CancellationToken ct)
    {
        var product = await _context.Products.FirstOrDefaultAsync(p => p.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Product), request.Id);
        var url = await _files.UploadAsync(request.Content, request.FileName, Container, ct);
        product.PrimaryImageUrl = url;
        await _context.SaveChangesAsync(ct);
        return url;
    }
}

public record UploadProductSectionImagesCommand(Guid Id, IReadOnlyList<(string FileName, Stream Content)> Files) : IRequest<List<string>>;

public class UploadProductSectionImagesCommandHandler : IRequestHandler<UploadProductSectionImagesCommand, List<string>>
{
    private const string Container = "product-section-banners";
    private readonly IApplicationDbContext _context;
    private readonly IFileStorageService _files;

    public UploadProductSectionImagesCommandHandler(IApplicationDbContext context, IFileStorageService files)
    {
        _context = context;
        _files = files;
    }

    public async Task<List<string>> Handle(UploadProductSectionImagesCommand request, CancellationToken ct)
    {
        var product = await _context.Products.Include(p => p.SectionImages)
            .FirstOrDefaultAsync(p => p.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Product), request.Id);

        var urls = new List<string>();
        var order = product.SectionImages.Count == 0 ? 0 : product.SectionImages.Max(i => i.SortOrder) + 1;
        foreach (var file in request.Files)
        {
            var url = await _files.UploadAsync(file.Content, file.FileName, Container, ct);
            product.SectionImages.Add(new ProductSectionImage { ImageUrl = url, SortOrder = order++ });
            urls.Add(url);
        }

        await _context.SaveChangesAsync(ct);
        return urls;
    }
}

public record UploadShopMediaCommand(
    string FileName,
    Stream Content,
    string Folder = "shop-media",
    string? AspectKind = null) : IRequest<string>;

public class UploadShopMediaCommandHandler : IRequestHandler<UploadShopMediaCommand, string>
{
    private readonly IFileStorageService _files;
    public UploadShopMediaCommandHandler(IFileStorageService files) => _files = files;

    public async Task<string> Handle(UploadShopMediaCommand request, CancellationToken ct)
    {
        await using var buffer = new MemoryStream();
        await request.Content.CopyToAsync(buffer, ct);
        buffer.Position = 0;

        var kind = request.AspectKind ?? BannerImageAspect.KindFromFolder(request.Folder);
        if (!string.IsNullOrWhiteSpace(kind))
            BannerImageAspect.EnsureValid(buffer, kind);

        buffer.Position = 0;
        return await _files.UploadAsync(buffer, request.FileName, request.Folder, ct);
    }
}

