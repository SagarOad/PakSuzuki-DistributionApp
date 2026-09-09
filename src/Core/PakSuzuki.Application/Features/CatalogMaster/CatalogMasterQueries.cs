using System.Text.Json;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Common.Models;
using PakSuzuki.Domain.Entities;

namespace PakSuzuki.Application.Features.CatalogMaster;

public record GetMasterCatalogLookupsQuery(string ViewerRole) : IRequest<MasterCatalogLookupsDto>;

public class GetMasterCatalogLookupsQueryHandler
    : IRequestHandler<GetMasterCatalogLookupsQuery, MasterCatalogLookupsDto>
{
    private readonly IApplicationDbContext _context;
    private readonly IPriceVisibilityService _visibility;

    public GetMasterCatalogLookupsQueryHandler(IApplicationDbContext context, IPriceVisibilityService visibility)
    {
        _context = context;
        _visibility = visibility;
    }

    public async Task<MasterCatalogLookupsDto> Handle(GetMasterCatalogLookupsQuery request, CancellationToken ct)
    {
        var types = await _context.CatalogProductTypes.AsNoTracking()
            .Where(t => t.IsActive)
            .OrderBy(t => t.SortOrder)
            .Select(t => new CatalogTypeDto(t.Id, t.Code, t.Name, t.IsReady, t.NotReadyMessage, t.SortOrder))
            .ToListAsync(ct);

        var categories = await _context.CatalogCategories.AsNoTracking()
            .Include(c => c.PTypes)
            .Where(c => c.IsActive)
            .OrderBy(c => c.SortOrder)
            .ToListAsync(ct);

        var sources = await _context.CatalogSources.AsNoTracking()
            .Where(s => s.IsActive)
            .OrderBy(s => s.SortOrder)
            .Select(s => new CatalogSourceDto(s.Code, s.Name))
            .ToListAsync(ct);

        var suppliers = await _context.CatalogSuppliers.AsNoTracking()
            .Where(s => s.IsActive)
            .OrderBy(s => s.SortOrder)
            .Select(s => new CatalogSupplierDto(s.Code, s.Name))
            .ToListAsync(ct);

        var gstTypes = await _context.CatalogGstInvoiceTypes.AsNoTracking()
            .Where(g => g.IsActive)
            .Select(g => new CatalogGstInvoiceTypeDto(g.Code, g.Name))
            .ToListAsync(ct);

        var taxRules = await _context.TaxRules.AsNoTracking()
            .Where(t => t.IsActive)
            .OrderBy(t => t.Code)
            .Select(t => new TaxRuleDto(t.Id, t.Code, t.Rate, t.AppliesTo, t.IsActive))
            .ToListAsync(ct);

        var thresholdRows = await _context.DeliveryApprovalThresholds.AsNoTracking()
            .Include(t => t.Category)
            .Where(t => t.IsActive)
            .ToListAsync(ct);
        var thresholds = thresholdRows.Select(t => new DeliveryThresholdDto(
            t.Id, t.CategoryId, t.Category.Name, t.DistributorId, t.Unit,
            t.QuantityThreshold,
            t.ApproverRoles.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
            t.IsActive)).ToList();

        var visibility = await _visibility.GetAsync(request.ViewerRole, ct);

        return new MasterCatalogLookupsDto(
            types,
            categories.Select(MapCategory).ToList(),
            sources,
            suppliers,
            gstTypes,
            taxRules,
            thresholds,
            new PriceVisibilityDto(visibility.CanSeeCost, visibility.CanSeePurchase, visibility.CanSeeSale));
    }

    internal static CatalogCategoryDto MapCategory(CatalogCategory category) =>
        new(
            category.Id,
            category.ProductTypeId,
            category.Code,
            category.Name,
            category.OrderUnit,
            category.DefaultFedApplicable,
            category.GstInvoiceTypeCode,
            category.IsReady,
            category.NotReadyMessage,
            ParseProfile(category.FormProfileJson),
            category.PTypes.Where(p => p.IsActive).OrderBy(p => p.SortOrder).Select(MapPType).ToList());

    internal static CatalogPTypeDto MapPType(CatalogPType pType)
    {
        var scope = new List<string>();
        try
        {
            scope = JsonSerializer.Deserialize<List<string>>(pType.SourceScopeJson) ?? [];
        }
        catch (JsonException)
        {
            // keep empty if a row was edited by hand
        }

        return new CatalogPTypeDto(pType.Id, pType.Code, pType.DeliveryType, pType.SgoFlag, scope, pType.CategoryId);
    }

    internal static JsonElement ParseProfile(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return JsonDocument.Parse("{}").RootElement.Clone();
        try
        {
            return JsonDocument.Parse(json).RootElement.Clone();
        }
        catch (JsonException)
        {
            return JsonDocument.Parse("{}").RootElement.Clone();
        }
    }
}

public record GetWizardDefaultsQuery(Guid CategoryId, Guid? PTypeId, string? SourceCode, string? ModelCode)
    : IRequest<WizardDefaultsDto>;

public class GetWizardDefaultsQueryHandler : IRequestHandler<GetWizardDefaultsQuery, WizardDefaultsDto>
{
    private readonly IApplicationDbContext _context;
    public GetWizardDefaultsQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<WizardDefaultsDto> Handle(GetWizardDefaultsQuery request, CancellationToken ct)
    {
        var category = await _context.CatalogCategories.AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == request.CategoryId, ct)
            ?? throw new NotFoundException(nameof(CatalogCategory), request.CategoryId);

        CatalogPType? pType = null;
        if (request.PTypeId is Guid pTypeId)
            pType = await _context.CatalogPTypes.AsNoTracking().FirstOrDefaultAsync(p => p.Id == pTypeId, ct);

        var taxRules = await _context.TaxRules.AsNoTracking().Where(t => t.IsActive).ToListAsync(ct);
        var gstRate = taxRules.FirstOrDefault(t => t.Code == "GST")?.Rate ?? 0m;
        var fedRule = taxRules.FirstOrDefault(t => t.Code == "FED");
        var fedApplies = fedRule is not null && TaxAppliesToCategory(fedRule.AppliesTo, category.Name);
        var fedRate = fedApplies ? fedRule!.Rate : 0m;

        var supplier = await SuggestSupplierAsync(pType?.Code, request.SourceCode, request.ModelCode, ct);

        return new WizardDefaultsDto(
            pType?.SgoFlag ?? false,
            supplier,
            fedApplies || category.DefaultFedApplicable,
            gstRate,
            fedRate,
            category.GstInvoiceTypeCode);
    }

    private async Task<string?> SuggestSupplierAsync(string? pType, string? source, string? model, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(pType))
            return null;

        var rules = await _context.CatalogSupplierRules.AsNoTracking()
            .Where(r => r.IsActive && r.PTypeCode == pType)
            .OrderByDescending(r => r.Priority)
            .ToListAsync(ct);

        return rules
            .Where(r => r.SourceCode is null || r.SourceCode == source)
            .Where(r => r.ModelCode is null || string.Equals(r.ModelCode, model, StringComparison.OrdinalIgnoreCase))
            .Select(r => r.SupplierCode)
            .FirstOrDefault();
    }

    internal static bool TaxAppliesToCategory(string appliesTo, string categoryName)
    {
        if (string.Equals(appliesTo, "all", StringComparison.OrdinalIgnoreCase))
            return true;
        if (string.Equals(appliesTo, "invoiceTotal", StringComparison.OrdinalIgnoreCase))
            return false;

        var tokens = appliesTo.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return tokens.Any(token =>
            token.Equals(categoryName, StringComparison.OrdinalIgnoreCase)
            || (token.Equals("Chemicals", StringComparison.OrdinalIgnoreCase)
                && categoryName.Equals("Chemical", StringComparison.OrdinalIgnoreCase)));
    }
}

public record GetMasterProductsQuery(string ViewerRole, string? Search, Guid? CategoryId, int PageNumber = 1, int PageSize = 50)
    : IRequest<PaginatedList<MasterProductListDto>>;

public class GetMasterProductsQueryHandler : IRequestHandler<GetMasterProductsQuery, PaginatedList<MasterProductListDto>>
{
    private readonly IApplicationDbContext _context;
    private readonly IPriceVisibilityService _visibility;

    public GetMasterProductsQueryHandler(IApplicationDbContext context, IPriceVisibilityService visibility)
    {
        _context = context;
        _visibility = visibility;
    }

    public async Task<PaginatedList<MasterProductListDto>> Handle(GetMasterProductsQuery request, CancellationToken ct)
    {
        var visibility = await _visibility.GetAsync(request.ViewerRole, ct);

        var query = _context.ProductCatalogProfiles.AsNoTracking()
            .Include(p => p.Product)
            .Include(p => p.ProductType)
            .Include(p => p.Category)
            .Include(p => p.PType)
            .Where(p => p.Product.IsActive);

        if (request.CategoryId is Guid categoryId)
            query = query.Where(p => p.CategoryId == categoryId);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.Trim();
            query = query.Where(p =>
                p.Product.Sku.Contains(search)
                || p.Product.Name.Contains(search)
                || p.Category.Name.Contains(search));
        }

        var total = await query.CountAsync(ct);
        var rows = await query
            .OrderBy(p => p.Product.Name)
            .ThenBy(p => p.Product.Sku)
            .Skip((request.PageNumber - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(p => new
            {
                p.ProductId,
                p.Product.Sku,
                p.Product.Name,
                Type = p.ProductType.Name,
                Category = p.Category.Name,
                PType = p.PType.Code,
                p.SourceCode,
                p.PackQuantity,
                p.UnitValue,
                p.UnitType,
                p.SalePriceExclTaxes,
                p.Discontinued,
                p.FedApplicable,
                Cost = p.Product.PriceHistory.Where(pp => pp.IsCurrent).Select(pp => (decimal?)pp.CostPrice).FirstOrDefault(),
                Purchase = p.Product.PriceHistory.Where(pp => pp.IsCurrent).Select(pp => (decimal?)pp.SellingPrice).FirstOrDefault(),
                Sale = p.Product.PriceHistory.Where(pp => pp.IsCurrent).Select(pp => (decimal?)pp.RetailPrice).FirstOrDefault()
            })
            .ToListAsync(ct);

        var items = rows.Select(r =>
        {
            var pack = r.PackQuantity <= 0 ? 1 : r.PackQuantity;
            var sale = visibility.CanSeeSale ? r.Sale : null;
            return new MasterProductListDto(
                r.ProductId,
                r.Sku,
                r.Name,
                r.Type,
                r.Category,
                r.PType,
                r.SourceCode,
                r.PackQuantity,
                r.UnitValue,
                r.UnitType,
                $"{r.PackQuantity} × {FormatUnit(r.UnitValue, r.UnitType)}",
                visibility.CanSeeCost ? r.Cost : null,
                visibility.CanSeePurchase ? r.Purchase : null,
                sale,
                visibility.CanSeeSale ? r.SalePriceExclTaxes : null,
                sale is decimal salePrice ? Math.Round(salePrice / pack, 2) : null,
                r.Discontinued,
                r.FedApplicable);
        }).ToList();

        return new PaginatedList<MasterProductListDto>(items, total, request.PageNumber, request.PageSize);
    }

    internal static string FormatUnit(decimal value, string unitType)
    {
        var number = value == decimal.Truncate(value) ? decimal.Truncate(value).ToString() : value.ToString("0.####");
        return string.IsNullOrWhiteSpace(unitType) ? number : $"{number} {unitType}";
    }
}

public record GetMasterProductByIdQuery(Guid Id, string ViewerRole) : IRequest<MasterProductDetailDto>;

public class GetMasterProductByIdQueryHandler : IRequestHandler<GetMasterProductByIdQuery, MasterProductDetailDto>
{
    private readonly IApplicationDbContext _context;
    private readonly IPriceVisibilityService _visibility;

    public GetMasterProductByIdQueryHandler(IApplicationDbContext context, IPriceVisibilityService visibility)
    {
        _context = context;
        _visibility = visibility;
    }

    public async Task<MasterProductDetailDto> Handle(GetMasterProductByIdQuery request, CancellationToken ct)
    {
        var profile = await _context.ProductCatalogProfiles
            .AsNoTracking()
            .Include(p => p.Product).ThenInclude(p => p.PriceHistory)
            .Include(p => p.Product).ThenInclude(p => p.SectionImages)
            .Include(p => p.ProductType)
            .Include(p => p.Category)
            .Include(p => p.PType)
            .FirstOrDefaultAsync(p => p.ProductId == request.Id, ct)
            ?? throw new NotFoundException(nameof(ProductCatalogProfile), request.Id);

        var visibility = await _visibility.GetAsync(request.ViewerRole, ct);
        var price = profile.Product.PriceHistory.FirstOrDefault(p => p.IsCurrent);
        var pack = profile.PackQuantity <= 0 ? 1 : profile.PackQuantity;
        var sale = visibility.CanSeeSale ? price?.RetailPrice : null;

        JsonElement? extra = null;
        if (!string.IsNullOrWhiteSpace(profile.ExtraAttributesJson))
        {
            try { extra = JsonDocument.Parse(profile.ExtraAttributesJson).RootElement.Clone(); }
            catch (JsonException) { extra = null; }
        }

        return new MasterProductDetailDto(
            profile.ProductId,
            profile.Product.Sku,
            profile.Product.Name,
            profile.ProductTypeId,
            profile.CategoryId,
            profile.PTypeId,
            profile.ProductType.Name,
            profile.Category.Name,
            profile.PType.Code,
            profile.Viscosity,
            profile.ApiStandard,
            profile.ModelCode,
            profile.SourceCode,
            profile.SgoFlag,
            profile.SupplierCode,
            profile.UnitValue,
            profile.UnitType,
            profile.PackQuantity,
            visibility.CanSeeCost ? price?.CostPrice : null,
            visibility.CanSeePurchase ? price?.SellingPrice : null,
            sale,
            visibility.CanSeeSale ? profile.SalePriceExclTaxes : null,
            sale is decimal salePrice ? Math.Round(salePrice / pack, 2) : null,
            profile.FedApplicable,
            profile.Discontinued,
            profile.ApplyDate,
            profile.RpdcFlag,
            profile.Accessory,
            extra,
            profile.Product.IsPublished,
            profile.Product.PrimaryImageUrl,
            profile.Product.SectionImages.OrderBy(i => i.SortOrder).Select(i => i.ImageUrl).ToList());
    }
}
