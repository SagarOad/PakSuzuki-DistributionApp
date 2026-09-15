using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Domain.Entities;
using PakSuzuki.Domain.Enums;
using PakSuzuki.Infrastructure.Persistence;

namespace PakSuzuki.WebApi.Persistence;

public static class CatalogMasterSeeder
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true
    };

    public static async Task SeedAsync(ApplicationDbContext context, IHostEnvironment env, ILogger logger)
    {
        var path = ResolveSeedPath(env);
        if (path is null)
        {
            logger.LogWarning("product-seed-data.json not found. Catalog lookups will not be seeded.");
            return;
        }

        SeedFile seed;
        try
        {
            await using var stream = File.OpenRead(path);
            seed = await JsonSerializer.DeserializeAsync<SeedFile>(stream, JsonOpts)
                   ?? throw new InvalidOperationException("Seed file deserialized to null.");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to read catalog seed file at {Path}", path);
            throw;
        }

        await SeedLookupsAsync(context, seed.Lookups);
        await SeedProductsAsync(context, seed);
        logger.LogInformation("Catalog master seed applied from {Path}", path);
    }

    private static string? ResolveSeedPath(IHostEnvironment env)
    {
        var candidates = new[]
        {
            Path.Combine(env.ContentRootPath, "SeedData", "product-seed-data.json"),
            Path.Combine(AppContext.BaseDirectory, "SeedData", "product-seed-data.json")
        };
        return candidates.FirstOrDefault(File.Exists);
    }

    private static async Task SeedLookupsAsync(ApplicationDbContext context, SeedLookups lookups)
    {
        var lubeType = await UpsertTypeAsync(context, "Lubricants", "Lubricants", true, null, 0);
        var partsType = await UpsertTypeAsync(context, "Parts", "Parts", false,
            "Parts master fields are pending. Add a Parts category profile once the client shares that data.", 1);

        var sources = lookups.Sources.Count > 0 ? lookups.Sources : ["Local", "C.K.D.", "In house"];
        // Always ensure In house exists even if an older seed file omitted it.
        if (!sources.Any(s => s.Equals("In house", StringComparison.OrdinalIgnoreCase)))
            sources = [.. sources, "In house"];
        var sourceOrder = 0;
        foreach (var source in sources)
        {
            var isInHouse = source.Equals("In house", StringComparison.OrdinalIgnoreCase);
            await UpsertSourceAsync(
                context,
                source,
                source,
                sourceOrder++,
                ready: !isInHouse,
                notReadyMessage: isInHouse
                    ? "In house catalog data is still awaited from the client (same as Parts). Ordering and product entry unlock once that list is shared."
                    : null);
        }
        var supplierOrder = 0;
        foreach (var supplier in lookups.SupplierCodes)
            await UpsertSupplierAsync(context, supplier.Code, supplier.Name, supplierOrder++);

        foreach (var gst in lookups.GstInvoiceTypes)
            await UpsertGstAsync(context, gst.Code, gst.Name);

        var engineOil = await UpsertCategoryAsync(context, lubeType, "EngineOil", "Engine Oil", 0,
            FormProfiles.EngineOil, "carton", defaultFed: true, gst: "GST2", ready: true, null);
        var gearOil = await UpsertCategoryAsync(context, lubeType, "GearOil", "Gear Oil", 1,
            FormProfiles.GearOil, "carton", defaultFed: false, gst: "GST2", ready: true, null);
        var chemical = await UpsertCategoryAsync(context, lubeType, "Chemical", "Chemical", 2,
            FormProfiles.Chemical, "carton", defaultFed: false, gst: "GST2", ready: true, null);
        var partsCat = await UpsertCategoryAsync(context, partsType, "Parts", "Parts", 0,
            FormProfiles.PartsPending, "qty", defaultFed: false, gst: "GST1", ready: false,
            "Parts wizard fields will be loaded from Parts master data. Do not invent fields.");

        var categoriesByName = new Dictionary<string, CatalogCategory>(StringComparer.OrdinalIgnoreCase)
        {
            ["Engine Oil"] = engineOil,
            ["Gear Oil"] = gearOil,
            ["Chemical"] = chemical,
            ["Chemicals"] = chemical,
            ["Parts"] = partsCat
        };

        var pOrder = 0;
        foreach (var row in lookups.PTypeMap)
        {
            categoriesByName.TryGetValue(row.UiCategory, out var cat);
            await UpsertPTypeAsync(context, row, cat?.Id, pOrder++);
        }

        await SeedSupplierRulesAsync(context);
        await SeedTaxRulesAsync(context, lookups.TaxRules);
        await SeedPriceVisibilityAsync(context, lookups.PriceVisibilityByRole);
        await SeedThresholdsAsync(context, lookups.DeliveryApprovalThresholds, categoriesByName);
        await context.SaveChangesAsync();
    }

    private static async Task SeedProductsAsync(ApplicationDbContext context, SeedFile seed)
    {
        var types = await context.CatalogProductTypes.ToDictionaryAsync(t => t.Code, StringComparer.OrdinalIgnoreCase);
        var categories = await context.CatalogCategories.ToDictionaryAsync(c => c.Name, StringComparer.OrdinalIgnoreCase);
        var pTypes = await context.CatalogPTypes.ToDictionaryAsync(p => p.Code, StringComparer.OrdinalIgnoreCase);
        var gstRate = (await context.TaxRules.FirstOrDefaultAsync(t => t.Code == "GST" && t.IsActive))?.Rate ?? 0.18m;
        var fedRate = (await context.TaxRules.FirstOrDefaultAsync(t => t.Code == "FED" && t.IsActive))?.Rate ?? 0.05m;

        foreach (var row in seed.Products)
        {
            if (!types.TryGetValue(row.Type, out var type)
                || !categories.TryGetValue(row.Category, out var category)
                || !pTypes.TryGetValue(row.PType, out var pType))
                continue;

            var sku = row.PartItemNo.Trim();
            var product = await context.Products
                .Include(p => p.CatalogProfile)
                .Include(p => p.PriceHistory)
                .Include(p => p.Variants)
                .FirstOrDefaultAsync(p => p.Sku == sku);

            if (product is null)
            {
                product = new Product { Sku = sku };
                context.Products.Add(product);
            }

            product.Name = row.Description.Trim();
            product.Description = row.Description.Trim();
            product.CategoryName = category.Name;
            product.Category = type.Code.Equals("Parts", StringComparison.OrdinalIgnoreCase)
                ? ProductCategory.Parts
                : ProductCategory.Lube;
            product.BaseUnit = category.OrderUnit.Equals("qty", StringComparison.OrdinalIgnoreCase)
                ? UnitOfMeasure.Piece
                : UnitOfMeasure.Carton;
            product.ConversionFactorToBaseUnit = row.Packaging.PackQuantity <= 0 ? 1 : row.Packaging.PackQuantity;
            product.IsPublished = true;
            product.InStock = !row.Discontinued;
            product.IsActive = !row.Discontinued;

            var applyDate = DateTime.TryParse(row.ApplyDate, out var parsed) ? parsed.Date : (DateTime?)null;
            var profile = product.CatalogProfile ?? new ProductCatalogProfile();
            if (product.CatalogProfile is null)
            {
                product.CatalogProfile = profile;
                context.ProductCatalogProfiles.Add(profile);
            }

            profile.ProductTypeId = type.Id;
            profile.CategoryId = category.Id;
            profile.PTypeId = pType.Id;
            profile.Viscosity = BlankToNull(ReadFlexible(row.Viscosity));
            profile.ApiStandard = BlankToNull(ReadFlexible(row.ApiStandard));
            profile.ModelCode = BlankToNull(row.ModelCode);
            profile.SourceCode = row.Source;
            profile.SgoFlag = row.SgoFlag;
            profile.SupplierCode = row.SupplierCode;
            profile.UnitValue = row.Packaging.UnitValue;
            profile.UnitType = string.IsNullOrWhiteSpace(row.Packaging.UnitType) ? "L" : row.Packaging.UnitType;
            profile.PackQuantity = row.Packaging.PackQuantity <= 0 ? 1 : row.Packaging.PackQuantity;
            profile.SalePriceExclTaxes = row.Pricing.SalePriceExclTaxes;
            profile.FedApplicable = row.FedApplicable;
            profile.Discontinued = row.Discontinued;
            profile.ApplyDate = applyDate;
            profile.RpdcFlag = row.RpdcFlag;
            profile.Accessory = row.Accessory;

            var gstPercent = Math.Round(gstRate * 100, 2);
            var fedPercent = profile.FedApplicable ? Math.Round(fedRate * 100, 2) : 0m;
            SyncPrice(product, row.Pricing.CostPrice, row.Pricing.PurchasePrice, row.Pricing.SalePrice,
                gstPercent, fedPercent, applyDate);
            SyncPackVariant(product, profile, row.Pricing.CostPrice, row.Pricing.PurchasePrice, row.Pricing.SalePrice,
                gstPercent, fedPercent);
        }

        await context.SaveChangesAsync();
    }

    private static void SyncPrice(Product product, decimal cost, decimal purchase, decimal sale,
        decimal gstPercent, decimal fedPercent, DateTime? applyDate)
    {
        var current = product.PriceHistory.FirstOrDefault(p => p.IsCurrent);
        if (current is null)
        {
            current = new ProductPrice { IsCurrent = true };
            product.PriceHistory.Add(current);
        }

        current.CostPrice = cost;
        current.SellingPrice = purchase;
        current.RetailPrice = sale;
        current.GstPercent = gstPercent;
        current.FedPercent = fedPercent;
        current.WhtPercent = 0;
        if (applyDate is DateTime d)
            current.EffectiveFromUtc = DateTime.SpecifyKind(d, DateTimeKind.Utc);
    }

    private static void SyncPackVariant(Product product, ProductCatalogProfile profile,
        decimal cost, decimal purchase, decimal sale, decimal gstPercent, decimal fedPercent)
    {
        var packLabel = $"{profile.PackQuantity} × {FormatUnit(profile.UnitValue, profile.UnitType)}";
        var variant = product.Variants.OrderBy(v => v.SortOrder).FirstOrDefault();
        if (variant is null)
        {
            variant = new ProductVariant();
            product.Variants.Add(variant);
        }

        variant.TypeName = packLabel;
        variant.UnitQuantity = profile.PackQuantity;
        variant.CostPrice = cost;
        variant.DistributorPrice = purchase;
        variant.RetailPrice = sale;
        variant.GstPercent = gstPercent;
        variant.FedPercent = fedPercent;
        variant.WhtPercent = 0;
        variant.ProfitAmount = sale - purchase;
        variant.InStock = !profile.Discontinued;
        variant.IsPublished = !profile.Discontinued;
        variant.SortOrder = 0;
    }

    private static string FormatUnit(decimal value, string unitType)
    {
        var number = value == decimal.Truncate(value) ? decimal.Truncate(value).ToString() : value.ToString("0.####");
        return string.IsNullOrWhiteSpace(unitType) ? number : $"{number} {unitType}";
    }

    private static string? ReadFlexible(JsonElement value) =>
        value.ValueKind switch
        {
            JsonValueKind.Number => value.GetRawText(),
            JsonValueKind.String => value.GetString(),
            JsonValueKind.True => "Y",
            JsonValueKind.False => "N",
            _ => null
        };

    private static string? BlankToNull(string? value) =>
        string.IsNullOrWhiteSpace(value) ? value : value.Trim();

    private static async Task<CatalogProductType> UpsertTypeAsync(
        ApplicationDbContext context, string code, string name, bool ready, string? message, int order)
    {
        var row = await context.CatalogProductTypes.FirstOrDefaultAsync(t => t.Code == code);
        if (row is null)
        {
            row = new CatalogProductType { Code = code };
            context.CatalogProductTypes.Add(row);
        }

        row.Name = name;
        row.IsReady = ready;
        row.NotReadyMessage = message;
        row.SortOrder = order;
        row.IsActive = true;
        return row;
    }

    private static async Task<CatalogCategory> UpsertCategoryAsync(
        ApplicationDbContext context, CatalogProductType type, string code, string name, int order,
        string formProfile, string orderUnit, bool defaultFed, string gst, bool ready, string? message)
    {
        await context.SaveChangesAsync();
        var row = await context.CatalogCategories.FirstOrDefaultAsync(c => c.ProductTypeId == type.Id && c.Code == code);
        if (row is null)
        {
            row = new CatalogCategory { ProductTypeId = type.Id, Code = code };
            context.CatalogCategories.Add(row);
        }

        row.Name = name;
        row.FormProfileJson = formProfile;
        row.OrderUnit = orderUnit;
        row.DefaultFedApplicable = defaultFed;
        row.GstInvoiceTypeCode = gst;
        row.SortOrder = order;
        row.IsReady = ready;
        row.NotReadyMessage = message;
        row.IsActive = true;
        return row;
    }

    private static async Task UpsertPTypeAsync(ApplicationDbContext context, SeedPTypeMap row, Guid? categoryId, int order)
    {
        var existing = await context.CatalogPTypes.FirstOrDefaultAsync(p => p.Code == row.PType);
        if (existing is null)
        {
            existing = new CatalogPType { Code = row.PType };
            context.CatalogPTypes.Add(existing);
        }

        // Ensure In house is allowed on every PType delivery lane.
        var scopes = row.SourceScope
            .Concat(["In house"])
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        existing.DeliveryType = row.DeliveryType;
        existing.SgoFlag = row.SgoFlag;
        existing.SourceScopeJson = JsonSerializer.Serialize(scopes);
        existing.CategoryId = categoryId;
        existing.SortOrder = order;
        existing.IsActive = true;
    }

    private static async Task UpsertSourceAsync(
        ApplicationDbContext context,
        string code,
        string name,
        int order,
        bool ready = true,
        string? notReadyMessage = null)
    {
        var row = await context.CatalogSources.FirstOrDefaultAsync(s => s.Code == code);
        if (row is null)
        {
            row = new CatalogSource { Code = code };
            context.CatalogSources.Add(row);
        }

        row.Name = name;
        row.SortOrder = order;
        row.IsReady = ready;
        row.NotReadyMessage = ready ? null : notReadyMessage;
        row.IsActive = true;
    }

    private static async Task UpsertSupplierAsync(ApplicationDbContext context, string code, string name, int order)
    {
        var row = await context.CatalogSuppliers.FirstOrDefaultAsync(s => s.Code == code);
        if (row is null)
        {
            row = new CatalogSupplier { Code = code };
            context.CatalogSuppliers.Add(row);
        }

        row.Name = name;
        row.SortOrder = order;
        row.IsActive = true;
    }

    private static async Task UpsertGstAsync(ApplicationDbContext context, string code, string name)
    {
        var row = await context.CatalogGstInvoiceTypes.FirstOrDefaultAsync(s => s.Code == code);
        if (row is null)
        {
            row = new CatalogGstInvoiceType { Code = code };
            context.CatalogGstInvoiceTypes.Add(row);
        }

        row.Name = name;
        row.IsActive = true;
    }

    private static async Task SeedSupplierRulesAsync(ApplicationDbContext context)
    {
        var rules = new (string? Source, string PType, string? Model, string Supplier, int Priority)[]
        {
            ("Local", "E", "MOTORCYCLE", "PSMC", 30),
            ("Local", "E", null, "ILP", 10),
            ("C.K.D.", "E", null, "PSMC", 10),
            (null, "G", null, "PSMC", 10),
            (null, "D", null, "PSMC", 10),
            (null, "C", null, "PSMC", 10),
            (null, "N", null, "PSMC", 10),
            (null, "F", null, "PSMC", 10),
            (null, "P", null, "PSMC", 10),
            (null, "K", null, "PSMC", 10),
            (null, "B", null, "PSMC", 10)
        };

        foreach (var (source, pType, model, supplier, priority) in rules)
        {
            var exists = await context.CatalogSupplierRules.AnyAsync(r =>
                r.PTypeCode == pType && r.SourceCode == source && r.ModelCode == model && r.SupplierCode == supplier);
            if (exists) continue;

            context.CatalogSupplierRules.Add(new CatalogSupplierRule
            {
                SourceCode = source,
                PTypeCode = pType,
                ModelCode = model,
                SupplierCode = supplier,
                Priority = priority,
                IsActive = true
            });
        }
    }

    private static async Task SeedTaxRulesAsync(ApplicationDbContext context, List<SeedTaxRule> rows)
    {
        foreach (var row in rows)
        {
            var appliesTo = row.AppliesTo.ValueKind switch
            {
                JsonValueKind.Array => string.Join(",", row.AppliesTo.EnumerateArray().Select(x => x.GetString()).Where(x => !string.IsNullOrWhiteSpace(x))),
                JsonValueKind.String => row.AppliesTo.GetString() ?? "all",
                _ => "all"
            };

            var existing = await context.TaxRules.FirstOrDefaultAsync(t => t.Code == row.Code);
            if (existing is null)
            {
                existing = new TaxRule { Code = row.Code };
                context.TaxRules.Add(existing);
            }

            existing.Rate = row.Rate;
            existing.AppliesTo = appliesTo;
            existing.IsActive = true;
        }
    }

    private static async Task SeedPriceVisibilityAsync(ApplicationDbContext context, List<SeedPriceVisibility> rows)
    {
        var mapped = new List<(string Role, bool Cost, bool Purchase, bool Sale)>();
        foreach (var row in rows)
        {
            mapped.Add((row.Role, row.Cost, row.Purchase, row.Sale));
            if (row.Role.Equals("PSMC", StringComparison.OrdinalIgnoreCase))
            {
                mapped.Add((Roles.SuperAdmin, row.Cost, row.Purchase, row.Sale));
                mapped.Add((Roles.Admin, row.Cost, row.Purchase, row.Sale));
                mapped.Add((Roles.RegionalHead, row.Cost, row.Purchase, row.Sale));
            }
            else if (row.Role.Equals("LubeDistributor", StringComparison.OrdinalIgnoreCase)
                     || row.Role.Equals("PartsDistributor", StringComparison.OrdinalIgnoreCase))
            {
                mapped.Add((Roles.Distributor, row.Cost, row.Purchase, row.Sale));
            }
        }

        foreach (var (role, cost, purchase, sale) in mapped.DistinctBy(x => x.Role))
        {
            var existing = await context.PriceVisibilityRules.FirstOrDefaultAsync(r => r.Role == role);
            if (existing is null)
            {
                existing = new PriceVisibilityRule { Role = role };
                context.PriceVisibilityRules.Add(existing);
            }

            existing.CanSeeCost = cost;
            existing.CanSeePurchase = purchase;
            existing.CanSeeSale = sale;
            existing.IsActive = true;
        }
    }

    private static async Task SeedThresholdsAsync(
        ApplicationDbContext context,
        List<SeedThreshold> rows,
        IReadOnlyDictionary<string, CatalogCategory> categories)
    {
        await context.SaveChangesAsync();
        foreach (var row in rows)
        {
            if (!categories.TryGetValue(row.Category, out var category))
                continue;

            var existing = await context.DeliveryApprovalThresholds
                .FirstOrDefaultAsync(t => t.CategoryId == category.Id && t.DistributorId == null);
            if (existing is null)
            {
                existing = new DeliveryApprovalThreshold { CategoryId = category.Id };
                context.DeliveryApprovalThresholds.Add(existing);
            }

            existing.Unit = row.Unit;
            existing.QuantityThreshold = row.Threshold;
            existing.ApproverRoles = string.Join(",", row.Approvers);
            existing.IsActive = true;
        }
    }

    private sealed class SeedFile
    {
        public SeedLookups Lookups { get; set; } = new();
        public List<SeedProduct> Products { get; set; } = [];
    }

    private sealed class SeedLookups
    {
        public List<string> ProductTypes { get; set; } = [];
        public List<string> LubricantCategories { get; set; } = [];
        public List<string> Sources { get; set; } = [];
        public List<SeedPTypeMap> PTypeMap { get; set; } = [];
        public List<SeedNamedCode> SupplierCodes { get; set; } = [];
        public List<SeedNamedCode> GstInvoiceTypes { get; set; } = [];
        public List<SeedPriceVisibility> PriceVisibilityByRole { get; set; } = [];
        public List<SeedThreshold> DeliveryApprovalThresholds { get; set; } = [];
        public List<SeedTaxRule> TaxRules { get; set; } = [];
    }

    private sealed class SeedPTypeMap
    {
        public string PType { get; set; } = "";
        public string DeliveryType { get; set; } = "";
        public bool SgoFlag { get; set; }
        public List<string> SourceScope { get; set; } = [];
        public string UiCategory { get; set; } = "";
    }

    private sealed class SeedNamedCode
    {
        public string Code { get; set; } = "";
        public string Name { get; set; } = "";
    }

    private sealed class SeedPriceVisibility
    {
        public string Role { get; set; } = "";
        public bool Cost { get; set; }
        public bool Purchase { get; set; }
        public bool Sale { get; set; } = true;
    }

    private sealed class SeedThreshold
    {
        public string Category { get; set; } = "";
        public string Unit { get; set; } = "carton";
        public decimal Threshold { get; set; }
        public List<string> Approvers { get; set; } = [];
    }

    private sealed class SeedTaxRule
    {
        public string Code { get; set; } = "";
        public decimal Rate { get; set; }
        public JsonElement AppliesTo { get; set; }
    }

    private sealed class SeedProduct
    {
        public string PartItemNo { get; set; } = "";
        public string Description { get; set; } = "";
        public string Type { get; set; } = "";
        public string Category { get; set; } = "";
        public JsonElement Viscosity { get; set; }
        public JsonElement ApiStandard { get; set; }
        public string? ModelCode { get; set; }
        public string Source { get; set; } = "";
        public string PType { get; set; } = "";
        public bool SgoFlag { get; set; }
        public string SupplierCode { get; set; } = "";
        public SeedPackaging Packaging { get; set; } = new();
        public SeedPricing Pricing { get; set; } = new();
        public bool FedApplicable { get; set; }
        public bool Discontinued { get; set; }
        public string? ApplyDate { get; set; }
        public bool RpdcFlag { get; set; }
        public string? Accessory { get; set; }
    }

    private sealed class SeedPackaging
    {
        public decimal UnitValue { get; set; }
        public string UnitType { get; set; } = "L";
        public int PackQuantity { get; set; } = 1;
    }

    private sealed class SeedPricing
    {
        public decimal CostPrice { get; set; }
        public decimal PurchasePrice { get; set; }
        public decimal SalePrice { get; set; }
        public decimal SalePriceExclTaxes { get; set; }
    }

    private static class FormProfiles
    {
        public const string EngineOil = """
            {"kind":"EngineOil","ready":true,"showViscosity":true,"showApiStandard":true,"showModelCode":true,"viscosityRequired":true,"apiStandardRequired":true,"unitTypes":["L"],"unitValueNumeric":true,"packQuantityNumeric":true,"orderUnit":"carton","flags":{"lubeFlag":true,"gearOilFlag":false,"chemicalsFlag":false},"fedFollowsTaxRules":true}
            """;

        public const string GearOil = """
            {"kind":"GearOil","ready":true,"showViscosity":true,"showApiStandard":true,"showModelCode":true,"viscosityRequired":false,"apiStandardRequired":false,"unitTypes":["L"],"unitValueNumeric":true,"packQuantityNumeric":true,"orderUnit":"carton","flags":{"lubeFlag":false,"gearOilFlag":true,"chemicalsFlag":false},"fedFollowsTaxRules":true}
            """;

        public const string Chemical = """
            {"kind":"Chemical","ready":true,"showViscosity":false,"showApiStandard":false,"showModelCode":true,"viscosityRequired":false,"apiStandardRequired":false,"unitTypes":["L","ml","gm","unit"],"unitValueNumeric":true,"packQuantityNumeric":true,"orderUnit":"carton","flags":{"lubeFlag":false,"gearOilFlag":false,"chemicalsFlag":true},"fedFollowsTaxRules":true}
            """;

        public const string PartsPending = """
            {"kind":"Parts","ready":false,"showViscosity":false,"showApiStandard":false,"showModelCode":false,"unitTypes":["piece"],"orderUnit":"qty","placeholderMessage":"Parts master fields are pending client data. The wizard will unlock this branch once that catalog is seeded."}
            """;
    }
}
