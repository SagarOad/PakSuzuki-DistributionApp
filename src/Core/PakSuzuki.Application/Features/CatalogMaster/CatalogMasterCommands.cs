using System.Text.Json;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Orders;
using PakSuzuki.Domain.Entities;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.CatalogMaster;

public record UpsertMasterProductCommand(Guid? Id, UpsertMasterProductRequest Body) : IRequest<Guid>;

public class UpsertMasterProductCommandValidator : AbstractValidator<UpsertMasterProductCommand>
{
    public UpsertMasterProductCommandValidator()
    {
        RuleFor(x => x.Body.PartItemNo).NotEmpty().MaximumLength(50);
        RuleFor(x => x.Body.Description).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Body.ProductTypeId).NotEmpty();
        RuleFor(x => x.Body.CategoryId).NotEmpty();
        RuleFor(x => x.Body.PTypeId).NotEmpty();
        RuleFor(x => x.Body.SourceCode).NotEmpty().MaximumLength(20);
        RuleFor(x => x.Body.SupplierCode).NotEmpty().MaximumLength(20);
        RuleFor(x => x.Body.UnitType).NotEmpty().MaximumLength(20);
        RuleFor(x => x.Body.PackQuantity).GreaterThan(0);
        RuleFor(x => x.Body.UnitValue).GreaterThanOrEqualTo(0);
        RuleFor(x => x.Body.CostPrice).GreaterThanOrEqualTo(0);
        RuleFor(x => x.Body.PurchasePrice).GreaterThanOrEqualTo(0);
        RuleFor(x => x.Body.SalePrice).GreaterThanOrEqualTo(0);
        RuleFor(x => x.Body.SalePriceExclTaxes).GreaterThanOrEqualTo(0);
    }
}

public class UpsertMasterProductCommandHandler : IRequestHandler<UpsertMasterProductCommand, Guid>
{
    private readonly IApplicationDbContext _context;
    public UpsertMasterProductCommandHandler(IApplicationDbContext context) => _context = context;

    public async Task<Guid> Handle(UpsertMasterProductCommand request, CancellationToken ct)
    {
        var body = request.Body;
        var type = await _context.CatalogProductTypes.FirstOrDefaultAsync(t => t.Id == body.ProductTypeId && t.IsActive, ct)
            ?? throw Fail(nameof(body.ProductTypeId), "Unknown product type.");
        if (!type.IsReady)
            throw Fail(nameof(body.ProductTypeId), type.NotReadyMessage ?? "This product type is not ready yet.");

        var category = await _context.CatalogCategories
            .FirstOrDefaultAsync(c => c.Id == body.CategoryId && c.ProductTypeId == type.Id && c.IsActive, ct)
            ?? throw Fail(nameof(body.CategoryId), "Category is not valid for the selected type.");
        if (!category.IsReady)
            throw Fail(nameof(body.CategoryId), category.NotReadyMessage ?? "This category is not ready yet.");

        var pType = await _context.CatalogPTypes
            .FirstOrDefaultAsync(p => p.Id == body.PTypeId && p.IsActive && p.CategoryId == category.Id, ct)
            ?? throw Fail(nameof(body.PTypeId), "PType is not valid for the selected category.");

        var sourceCode = OrderLaneCodes.NormalizeSource(body.SourceCode) ?? body.SourceCode.Trim();
        var sourceRow = await _context.CatalogSources.AsNoTracking()
            .Where(s => s.IsActive)
            .ToListAsync(ct);
        var matchedSource = sourceRow.FirstOrDefault(s => OrderLaneCodes.SameSource(s.Code, sourceCode));
        if (matchedSource is null)
            throw Fail(nameof(body.SourceCode), "Source must be chosen from the lookup list.");
        if (!matchedSource.IsReady)
            throw Fail(nameof(body.SourceCode),
                matchedSource.NotReadyMessage
                ?? "This source is not ready yet. Product data is still awaited.");
        sourceCode = matchedSource.Code;

        var supplierOk = await _context.CatalogSuppliers.AnyAsync(s => s.Code == body.SupplierCode && s.IsActive, ct);
        if (!supplierOk)
            throw Fail(nameof(body.SupplierCode), "Supplier must be chosen from the lookup list.");

        Product product;
        if (request.Id is Guid id)
        {
            product = await _context.Products
                .Include(p => p.CatalogProfile)
                .Include(p => p.PriceHistory)
                .Include(p => p.Variants)
                .Include(p => p.SectionImages)
                .FirstOrDefaultAsync(p => p.Id == id, ct)
                ?? throw new NotFoundException(nameof(Product), id);
        }
        else
        {
            if (await _context.Products.AnyAsync(p => p.Sku == body.PartItemNo.Trim(), ct))
                throw new ConflictException($"A product with part number '{body.PartItemNo}' already exists.");
            product = new Product { Sku = body.PartItemNo.Trim() };
            _context.Products.Add(product);
        }

        if (!string.Equals(product.Sku, body.PartItemNo.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            var clash = await _context.Products.AnyAsync(p => p.Sku == body.PartItemNo.Trim() && p.Id != product.Id, ct);
            if (clash)
                throw new ConflictException($"A product with part number '{body.PartItemNo}' already exists.");
            product.Sku = body.PartItemNo.Trim();
        }

        var taxRules = await _context.TaxRules.Where(t => t.IsActive).ToListAsync(ct);
        var gstPercent = PercentFrom(taxRules.FirstOrDefault(t => t.Code == "GST")?.Rate);
        var fedRule = taxRules.FirstOrDefault(t => t.Code == "FED");
        var fedApplies = body.FedApplicable
            ?? (fedRule is not null && GetWizardDefaultsQueryHandler.TaxAppliesToCategory(fedRule.AppliesTo, category.Name));
        var fedPercent = fedApplies ? PercentFrom(fedRule?.Rate) : 0m;

        product.Name = body.Description.Trim();
        product.Description = body.Description.Trim();
        product.CategoryName = category.Name;
        product.Category = type.Code.Equals("Parts", StringComparison.OrdinalIgnoreCase)
            ? ProductCategory.Parts
            : ProductCategory.Lube;
        product.BaseUnit = category.OrderUnit.Equals("qty", StringComparison.OrdinalIgnoreCase)
            ? UnitOfMeasure.Piece
            : UnitOfMeasure.Carton;
        product.ConversionFactorToBaseUnit = body.PackQuantity;
        product.IsPublished = !body.Discontinued;
        product.InStock = !body.Discontinued;
        product.IsActive = !body.Discontinued;
        if (body.PrimaryImageUrl is not null)
            product.PrimaryImageUrl = string.IsNullOrWhiteSpace(body.PrimaryImageUrl)
                ? null
                : body.PrimaryImageUrl.Trim();
        if (body.SectionImageUrls is not null)
            SyncSectionImages(product, body.SectionImageUrls);

        var profile = product.CatalogProfile ?? new ProductCatalogProfile();
        if (product.CatalogProfile is null)
        {
            product.CatalogProfile = profile;
            _context.ProductCatalogProfiles.Add(profile);
        }

        profile.ProductTypeId = type.Id;
        profile.CategoryId = category.Id;
        profile.PTypeId = pType.Id;
        profile.Viscosity = NormalizeDash(body.Viscosity);
        profile.ApiStandard = NormalizeDash(body.ApiStandard);
        profile.ModelCode = string.IsNullOrWhiteSpace(body.ModelCode) ? null : body.ModelCode.Trim();
        profile.SourceCode = sourceCode;
        profile.SgoFlag = pType.SgoFlag;
        profile.SupplierCode = body.SupplierCode.Trim();
        profile.UnitValue = body.UnitValue;
        profile.UnitType = body.UnitType.Trim();
        profile.PackQuantity = body.PackQuantity;
        profile.SalePriceExclTaxes = body.SalePriceExclTaxes;
        profile.FedApplicable = fedApplies;
        profile.Discontinued = body.Discontinued;
        profile.ApplyDate = body.ApplyDate?.Date;
        profile.RpdcFlag = body.RpdcFlag;
        profile.Accessory = string.IsNullOrWhiteSpace(body.Accessory) ? null : body.Accessory.Trim();
        profile.ExtraAttributesJson = body.ExtraAttributes is { ValueKind: not JsonValueKind.Undefined and not JsonValueKind.Null }
            ? body.ExtraAttributes.Value.GetRawText()
            : profile.ExtraAttributesJson;

        var current = product.PriceHistory.FirstOrDefault(p => p.IsCurrent);
        if (current is null)
        {
            current = new ProductPrice { IsCurrent = true };
            product.PriceHistory.Add(current);
        }

        current.CostPrice = body.CostPrice;
        current.SellingPrice = body.PurchasePrice;
        current.RetailPrice = body.SalePrice;
        current.GstPercent = gstPercent;
        current.FedPercent = fedPercent;
        current.WhtPercent = 0;
        if (body.ApplyDate is DateTime apply)
            current.EffectiveFromUtc = DateTime.SpecifyKind(apply.Date, DateTimeKind.Utc);

        var packLabel = $"{body.PackQuantity} × {GetMasterProductsQueryHandler.FormatUnit(body.UnitValue, body.UnitType)}";
        var variant = product.Variants.OrderBy(v => v.SortOrder).FirstOrDefault();
        if (variant is null)
        {
            variant = new ProductVariant();
            product.Variants.Add(variant);
        }

        variant.TypeName = packLabel;
        variant.UnitQuantity = body.PackQuantity;
        variant.CostPrice = body.CostPrice;
        variant.DistributorPrice = body.PurchasePrice;
        variant.RetailPrice = body.SalePrice;
        variant.GstPercent = gstPercent;
        variant.FedPercent = fedPercent;
        variant.WhtPercent = 0;
        variant.ProfitAmount = body.SalePrice - body.PurchasePrice;
        variant.InStock = !body.Discontinued;
        variant.IsPublished = !body.Discontinued;
        variant.SortOrder = 0;

        await _context.SaveChangesAsync(ct);
        return product.Id;
    }

    private static void SyncSectionImages(Product product, List<string> urls)
    {
        foreach (var existing in product.SectionImages.ToList())
            product.SectionImages.Remove(existing);

        var order = 0;
        foreach (var url in urls.Where(u => !string.IsNullOrWhiteSpace(u)).Distinct())
        {
            product.SectionImages.Add(new ProductSectionImage
            {
                ImageUrl = url.Trim(),
                SortOrder = order++
            });
        }
    }

    private static decimal PercentFrom(decimal? rate) =>
        rate is null ? 0 : Math.Round(rate.Value * 100, 2);

    private static string? NormalizeDash(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static Common.Exceptions.ValidationException Fail(string field, string message) =>
        new([new FluentValidation.Results.ValidationFailure(field, message)]);
}

public record UpdateTaxRuleCommand(Guid Id, decimal Rate, string AppliesTo, bool IsActive) : IRequest;

public class UpdateTaxRuleCommandValidator : AbstractValidator<UpdateTaxRuleCommand>
{
    public UpdateTaxRuleCommandValidator()
    {
        RuleFor(x => x.Rate).GreaterThanOrEqualTo(0).LessThanOrEqualTo(1);
        RuleFor(x => x.AppliesTo).NotEmpty().MaximumLength(200);
    }
}

public class UpdateTaxRuleCommandHandler : IRequestHandler<UpdateTaxRuleCommand>
{
    private readonly IApplicationDbContext _context;
    public UpdateTaxRuleCommandHandler(IApplicationDbContext context) => _context = context;

    public async Task Handle(UpdateTaxRuleCommand request, CancellationToken ct)
    {
        var rule = await _context.TaxRules.FirstOrDefaultAsync(t => t.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(TaxRule), request.Id);
        rule.Rate = request.Rate;
        rule.AppliesTo = request.AppliesTo.Trim();
        rule.IsActive = request.IsActive;
        await _context.SaveChangesAsync(ct);
    }
}

public record UpsertDeliveryThresholdCommand(
    Guid? Id,
    Guid CategoryId,
    Guid? DistributorId,
    string Unit,
    decimal QuantityThreshold,
    IReadOnlyList<string> ApproverRoles,
    bool IsActive) : IRequest<Guid>;

public class UpsertDeliveryThresholdCommandValidator : AbstractValidator<UpsertDeliveryThresholdCommand>
{
    public UpsertDeliveryThresholdCommandValidator()
    {
        RuleFor(x => x.CategoryId).NotEmpty();
        RuleFor(x => x.Unit).NotEmpty().MaximumLength(20);
        RuleFor(x => x.QuantityThreshold).GreaterThan(0);
        RuleFor(x => x.ApproverRoles).NotEmpty();
    }
}

public class UpsertDeliveryThresholdCommandHandler : IRequestHandler<UpsertDeliveryThresholdCommand, Guid>
{
    private readonly IApplicationDbContext _context;
    public UpsertDeliveryThresholdCommandHandler(IApplicationDbContext context) => _context = context;

    public async Task<Guid> Handle(UpsertDeliveryThresholdCommand request, CancellationToken ct)
    {
        var categoryExists = await _context.CatalogCategories.AnyAsync(c => c.Id == request.CategoryId, ct);
        if (!categoryExists)
            throw new NotFoundException(nameof(CatalogCategory), request.CategoryId);

        DeliveryApprovalThreshold row;
        if (request.Id is Guid id)
        {
            row = await _context.DeliveryApprovalThresholds.FirstOrDefaultAsync(t => t.Id == id, ct)
                ?? throw new NotFoundException(nameof(DeliveryApprovalThreshold), id);
        }
        else
        {
            row = new DeliveryApprovalThreshold();
            _context.DeliveryApprovalThresholds.Add(row);
        }

        row.CategoryId = request.CategoryId;
        row.DistributorId = request.DistributorId;
        row.Unit = request.Unit.Trim();
        row.QuantityThreshold = request.QuantityThreshold;
        row.ApproverRoles = string.Join(",", request.ApproverRoles.Where(a => !string.IsNullOrWhiteSpace(a)).Select(a => a.Trim()));
        row.IsActive = request.IsActive;
        await _context.SaveChangesAsync(ct);
        return row.Id;
    }
}

public record DeleteMasterProductCommand(Guid Id) : IRequest;

public class DeleteMasterProductCommandHandler : IRequestHandler<DeleteMasterProductCommand>
{
    private readonly IApplicationDbContext _context;
    public DeleteMasterProductCommandHandler(IApplicationDbContext context) => _context = context;

    public async Task Handle(DeleteMasterProductCommand request, CancellationToken ct)
    {
        var product = await _context.Products
            .Include(p => p.CatalogProfile)
            .FirstOrDefaultAsync(p => p.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Product), request.Id);

        // Soft-delete so historical orders keep their product reference.
        product.IsActive = false;
        product.IsPublished = false;
        if (product.CatalogProfile != null)
            product.CatalogProfile.Discontinued = true;

        await _context.SaveChangesAsync(ct);
    }
}
