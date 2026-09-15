using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Orders;
using PakSuzuki.Domain.Entities;

namespace PakSuzuki.Application.Features.CatalogMaster;

public record BulkLubricantProductRowResult(
    int ExcelRowNumber,
    string? PartItemNo,
    string Status,
    string? Message,
    Guid? ProductId);

public record BulkLubricantProductImportResult(
    int TotalRows,
    int Created,
    int Updated,
    int Failed,
    IReadOnlyList<BulkLubricantProductRowResult> Rows);

public record BulkImportLubricantProductsCommand(Stream FileStream)
    : IRequest<BulkLubricantProductImportResult>;

public class BulkImportLubricantProductsCommandHandler
    : IRequestHandler<BulkImportLubricantProductsCommand, BulkLubricantProductImportResult>
{
    private readonly IApplicationDbContext _context;
    private readonly ILubricantProductBulkExcelService _excel;
    private readonly ISender _sender;

    public BulkImportLubricantProductsCommandHandler(
        IApplicationDbContext context,
        ILubricantProductBulkExcelService excel,
        ISender sender)
    {
        _context = context;
        _excel = excel;
        _sender = sender;
    }

    public async Task<BulkLubricantProductImportResult> Handle(
        BulkImportLubricantProductsCommand request, CancellationToken ct)
    {
        var parsed = _excel.Parse(request.FileStream);

        var productType = await _context.CatalogProductTypes.AsNoTracking()
            .FirstOrDefaultAsync(t => t.IsActive && t.Code == "Lubricants", ct)
            ?? throw new ConflictException("Lubricants product type is missing from master data.");

        if (!productType.IsReady)
            throw new ConflictException(productType.NotReadyMessage ?? "Lubricants type is not ready yet.");

        var categories = await _context.CatalogCategories.AsNoTracking()
            .Where(c => c.IsActive && c.ProductTypeId == productType.Id)
            .ToListAsync(ct);

        var pTypes = await _context.CatalogPTypes.AsNoTracking()
            .Where(p => p.IsActive)
            .ToListAsync(ct);

        var suppliers = await _context.CatalogSuppliers.AsNoTracking()
            .Where(s => s.IsActive)
            .ToListAsync(ct);

        var existingSkus = await _context.Products.AsNoTracking()
            .Select(p => new { p.Id, p.Sku })
            .ToListAsync(ct);
        var skuToId = existingSkus
            .GroupBy(x => x.Sku.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First().Id, StringComparer.OrdinalIgnoreCase);

        var seenInFile = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var results = new List<BulkLubricantProductRowResult>();
        var created = 0;
        var updated = 0;
        var failed = 0;

        foreach (var row in parsed)
        {
            try
            {
                var requestBody = MapRow(row, productType, categories, pTypes, suppliers);
                var partKey = requestBody.PartItemNo.Trim();

                if (!seenInFile.Add(partKey))
                    throw new ConflictException($"Duplicate PartItemNo '{partKey}' in this file.");

                Guid? existingId = skuToId.TryGetValue(partKey, out var id) ? id : null;
                var productId = await _sender.Send(new UpsertMasterProductCommand(existingId, requestBody), ct);

                var status = existingId is null ? "Created" : "Updated";
                if (existingId is null)
                {
                    created++;
                    skuToId[partKey] = productId;
                }
                else
                {
                    updated++;
                }

                results.Add(new BulkLubricantProductRowResult(
                    row.ExcelRowNumber, partKey, status, null, productId));
            }
            catch (Exception ex)
            {
                failed++;
                results.Add(new BulkLubricantProductRowResult(
                    row.ExcelRowNumber,
                    row.PartItemNo?.Trim(),
                    "Failed",
                    FriendlyError(ex),
                    null));
            }
        }

        return new BulkLubricantProductImportResult(
            parsed.Count, created, updated, failed, results);
    }

    private static UpsertMasterProductRequest MapRow(
        LubricantBulkExcelRow row,
        CatalogProductType productType,
        List<CatalogCategory> categories,
        List<CatalogPType> pTypes,
        List<CatalogSupplier> suppliers)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(row.PartItemNo))
            errors.Add("PartItemNo is required.");
        if (string.IsNullOrWhiteSpace(row.MobileAppDescription))
            errors.Add("Mobile App Description is required.");
        if (string.IsNullOrWhiteSpace(row.PType))
            errors.Add("PType is required.");
        if (string.IsNullOrWhiteSpace(row.Source))
            errors.Add("Source is required.");
        if (string.IsNullOrWhiteSpace(row.SupplierCode))
            errors.Add("SupplierCode is required.");
        if (row.PackingSize is null)
            errors.Add("PackingSize is required.");
        else if (row.PackingSize <= 0)
            errors.Add("PackingSize must be greater than 0.");
        if (row.Liter is null)
            errors.Add("Liter (unit size) is required.");
        else if (row.Liter < 0)
            errors.Add("Liter cannot be negative.");
        if (row.CostPrice is null)
            errors.Add("CostPrice is required.");
        else if (row.CostPrice < 0)
            errors.Add("CostPrice cannot be negative.");
        if (row.PurchasePrice is null)
            errors.Add("PurchasePrice is required.");
        else if (row.PurchasePrice < 0)
            errors.Add("PurchasePrice cannot be negative.");
        if (row.SalePrice is null)
            errors.Add("SalePrice is required.");
        else if (row.SalePrice < 0)
            errors.Add("SalePrice cannot be negative.");
        if (row.SalePriceExclTaxes is null)
            errors.Add("SalePriceExclTaxes is required.");
        else if (row.SalePriceExclTaxes < 0)
            errors.Add("SalePriceExclTaxes cannot be negative.");

        if (errors.Count > 0)
            throw new ConflictException(string.Join(" ", errors));

        var pTypeCode = row.PType!.Trim().ToUpperInvariant();
        if (pTypeCode is "B")
            throw new ConflictException(
                "PType 'B' is Parts. Use the Parts bulk format (coming soon), not Lubricants & Chemicals.");

        var categoryName = CategoryFromPType(pTypeCode)
            ?? throw new ConflictException(
                $"Unknown PType '{row.PType}'. Allowed for this upload: E, G, D, C, F, N, P, K.");

        var category = categories.FirstOrDefault(c =>
            c.Name.Equals(categoryName, StringComparison.OrdinalIgnoreCase) && c.IsReady)
            ?? throw new ConflictException(
                $"Category '{categoryName}' (from PType {pTypeCode}) is not ready or missing.");

        var pType = pTypes.FirstOrDefault(p =>
            p.CategoryId == category.Id
            && p.Code.Equals(pTypeCode, StringComparison.OrdinalIgnoreCase))
            ?? throw new ConflictException(
                $"PType '{pTypeCode}' is not configured under category '{category.Name}'.");

        var source = OrderLaneCodes.NormalizeSource(row.Source) ?? row.Source!.Trim();
        if (OrderLaneCodes.SameSource(source, "In house"))
            throw new ConflictException(
                "Source 'In house' is awaiting data and cannot be imported yet. Use Local or C.K.D.");

        var supplier = suppliers.FirstOrDefault(s =>
            s.Code.Equals(row.SupplierCode!.Trim(), StringComparison.OrdinalIgnoreCase))
            ?? throw new ConflictException(
                $"Unknown SupplierCode '{row.SupplierCode}'. Use a lookup code such as PSMC, TPL, MPL, ILP.");

        // Unit mapping: Liter > 0 → L; Liter = 0 → unit with value 1 (kits/polish).
        var liter = row.Liter!.Value;
        var unitType = liter > 0 ? "L" : "unit";
        var unitValue = liter > 0 ? liter : 1m;

        var accessory = NormalizeYn(row.Accessory);
        var discontinue = IsYes(row.Discontinue);
        var fed = string.IsNullOrWhiteSpace(row.Fed) ? (bool?)null : IsYes(row.Fed);
        var rpdc = IsYes(row.RpdcFlag);

        // Optional blanks are fine; dash-like values kept for viscosity/API as entered.
        return new UpsertMasterProductRequest(
            PartItemNo: row.PartItemNo!.Trim(),
            Description: row.MobileAppDescription!.Trim(),
            ProductTypeId: productType.Id,
            CategoryId: category.Id,
            PTypeId: pType.Id,
            Viscosity: BlankToNull(row.Viscosity),
            ApiStandard: BlankToNull(row.ApiStandard),
            ModelCode: BlankToNull(row.ModelCode) ?? "COMMON",
            SourceCode: source,
            SupplierCode: supplier.Code,
            UnitValue: unitValue,
            UnitType: unitType,
            PackQuantity: row.PackingSize!.Value,
            CostPrice: row.CostPrice!.Value,
            PurchasePrice: row.PurchasePrice!.Value,
            SalePrice: row.SalePrice!.Value,
            SalePriceExclTaxes: row.SalePriceExclTaxes!.Value,
            FedApplicable: fed,
            Discontinued: discontinue,
            ApplyDate: row.ApplyDate,
            RpdcFlag: rpdc,
            Accessory: accessory,
            ExtraAttributes: null,
            PrimaryImageUrl: null,
            SectionImageUrls: null);
    }

    private static string? CategoryFromPType(string code) => code switch
    {
        "E" => "Engine Oil",
        "G" or "D" => "Gear Oil",
        "C" or "F" or "N" or "P" or "K" => "Chemical",
        _ => null
    };

    private static string? BlankToNull(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string? NormalizeYn(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var v = value.Trim();
        if (v.Equals("Y", StringComparison.OrdinalIgnoreCase)
            || v.Equals("Yes", StringComparison.OrdinalIgnoreCase)
            || v.Equals("true", StringComparison.OrdinalIgnoreCase)
            || v == "1")
            return "Y";
        if (v.Equals("N", StringComparison.OrdinalIgnoreCase)
            || v.Equals("No", StringComparison.OrdinalIgnoreCase)
            || v.Equals("false", StringComparison.OrdinalIgnoreCase)
            || v == "0")
            return "N";
        return v;
    }

    private static bool IsYes(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return false;
        var v = value.Trim();
        return v.Equals("Y", StringComparison.OrdinalIgnoreCase)
            || v.Equals("Yes", StringComparison.OrdinalIgnoreCase)
            || v.Equals("true", StringComparison.OrdinalIgnoreCase)
            || v == "1";
    }

    private static string FriendlyError(Exception ex) => ex switch
    {
        ValidationException ve => string.Join(" ", ve.Errors.SelectMany(kv => kv.Value)),
        ConflictException ce => ce.Message,
        NotFoundException nf => nf.Message,
        _ => ex.Message
    };
}
