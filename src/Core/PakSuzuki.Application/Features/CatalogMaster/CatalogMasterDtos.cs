using System.Text.Json;

namespace PakSuzuki.Application.Features.CatalogMaster;

public record CatalogTypeDto(Guid Id, string Code, string Name, bool IsReady, string? NotReadyMessage, int SortOrder);

public record CatalogSourceDto(string Code, string Name, bool IsReady = true, string? NotReadyMessage = null);

public record CatalogSupplierDto(string Code, string Name);

public record CatalogGstInvoiceTypeDto(string Code, string Name);

public record CatalogPTypeDto(
    Guid Id, string Code, string DeliveryType, bool SgoFlag, IReadOnlyList<string> SourceScope, Guid? CategoryId);

public record CatalogCategoryDto(
    Guid Id,
    Guid ProductTypeId,
    string Code,
    string Name,
    string OrderUnit,
    bool DefaultFedApplicable,
    string? GstInvoiceTypeCode,
    bool IsReady,
    string? NotReadyMessage,
    JsonElement FormProfile,
    IReadOnlyList<CatalogPTypeDto> PTypes);

public record TaxRuleDto(Guid Id, string Code, decimal Rate, string AppliesTo, bool IsActive);

public record DeliveryThresholdDto(
    Guid Id, Guid CategoryId, string CategoryName, Guid? DistributorId, string Unit,
    decimal QuantityThreshold, IReadOnlyList<string> ApproverRoles, bool IsActive);

public record PriceVisibilityDto(bool CanSeeCost, bool CanSeePurchase, bool CanSeeSale);

public record MasterCatalogLookupsDto(
    IReadOnlyList<CatalogTypeDto> ProductTypes,
    IReadOnlyList<CatalogCategoryDto> Categories,
    IReadOnlyList<CatalogSourceDto> Sources,
    IReadOnlyList<CatalogSupplierDto> Suppliers,
    IReadOnlyList<CatalogGstInvoiceTypeDto> GstInvoiceTypes,
    IReadOnlyList<TaxRuleDto> TaxRules,
    IReadOnlyList<DeliveryThresholdDto> DeliveryThresholds,
    PriceVisibilityDto PriceVisibility);

public record WizardDefaultsDto(
    bool SgoFlag,
    string? SupplierCode,
    bool FedApplicable,
    decimal GstRate,
    decimal FedRate,
    string? GstInvoiceTypeCode);

public record MasterProductListDto(
    Guid Id,
    string PartItemNo,
    string Description,
    string ProductType,
    string Category,
    string? PType,
    string? Source,
    string? Supplier,
    int PackQuantity,
    decimal UnitValue,
    string UnitType,
    string PackLabel,
    decimal? CostPrice,
    decimal? PurchasePrice,
    decimal? SalePrice,
    decimal? SalePriceExclTaxes,
    decimal? PricePerUnit,
    bool Discontinued,
    bool FedApplicable);

public record MasterProductDetailDto(
    Guid Id,
    string PartItemNo,
    string Description,
    Guid ProductTypeId,
    Guid CategoryId,
    Guid PTypeId,
    string ProductType,
    string Category,
    string PType,
    string? Viscosity,
    string? ApiStandard,
    string? ModelCode,
    string SourceCode,
    bool SgoFlag,
    string SupplierCode,
    decimal UnitValue,
    string UnitType,
    int PackQuantity,
    decimal? CostPrice,
    decimal? PurchasePrice,
    decimal? SalePrice,
    decimal? SalePriceExclTaxes,
    decimal? PricePerUnit,
    bool FedApplicable,
    bool Discontinued,
    DateTime? ApplyDate,
    bool RpdcFlag,
    string? Accessory,
    JsonElement? ExtraAttributes,
    bool IsPublished,
    string? PrimaryImageUrl,
    IReadOnlyList<string> SectionImageUrls);

public record UpsertMasterProductRequest(
    string PartItemNo,
    string Description,
    Guid ProductTypeId,
    Guid CategoryId,
    Guid PTypeId,
    string? Viscosity,
    string? ApiStandard,
    string? ModelCode,
    string SourceCode,
    string SupplierCode,
    decimal UnitValue,
    string UnitType,
    int PackQuantity,
    decimal CostPrice,
    decimal PurchasePrice,
    decimal SalePrice,
    decimal SalePriceExclTaxes,
    bool? FedApplicable,
    bool Discontinued,
    DateTime? ApplyDate,
    bool RpdcFlag,
    string? Accessory,
    JsonElement? ExtraAttributes,
    string? PrimaryImageUrl = null,
    List<string>? SectionImageUrls = null);
