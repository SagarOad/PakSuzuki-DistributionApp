namespace PakSuzuki.Application.Common.Interfaces;

public record LubricantBulkExcelRow(
    int ExcelRowNumber,
    int? Sr,
    string? PartItemNo,
    string? MobileAppDescription,
    string? Viscosity,
    string? ApiStandard,
    string? ModelCode,
    string? Source,
    string? LubeFlag,
    string? GearOil,
    string? Chemicals,
    decimal? CostPrice,
    decimal? PurchasePrice,
    decimal? SalePrice,
    decimal? SalePriceExclTaxes,
    int? PackingSize,
    string? SgoFlag,
    decimal? Liter,
    string? PType,
    string? Accessory,
    string? Discontinue,
    string? SupplierCode,
    string? Fed,
    DateTime? ApplyDate,
    string? RpdcFlag);

public interface ILubricantProductBulkExcelService
{
    byte[] BuildSampleTemplate();
    IReadOnlyList<LubricantBulkExcelRow> Parse(Stream xlsxStream);
}
