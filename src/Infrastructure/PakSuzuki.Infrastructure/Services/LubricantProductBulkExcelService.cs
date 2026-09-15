using ClosedXML.Excel;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;

namespace PakSuzuki.Infrastructure.Services;

public class LubricantProductBulkExcelService : ILubricantProductBulkExcelService
{
    public static readonly string[] Headers =
    [
        "Sr",
        "PartItemNo",
        "Mobile App Description",
        "Viscosity",
        "API Standard",
        "ModelCode",
        "Source",
        "LubeFlag",
        "GearOil",
        "Chemicals",
        "CostPrice",
        "PurchasePrice",
        "SalePrice",
        "SalePriceExclTaxes",
        "PackingSize",
        "SGOFlag",
        "Liter",
        "PType",
        "Accessory",
        "Discontinue",
        "SupplierCode",
        "FED",
        "ApplyDate",
        "RPDCFlag"
    ];

    public byte[] BuildSampleTemplate()
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add("Products");

        for (var i = 0; i < Headers.Length; i++)
        {
            var cell = sheet.Cell(1, i + 1);
            cell.Value = Headers[i];
            cell.Style.Font.Bold = true;
            cell.Style.Fill.BackgroundColor = XLColor.FromHtml("#0B2E59");
            cell.Style.Font.FontColor = XLColor.White;
        }

        // Example rows matching client layout (optional fields may be blank).
        WriteSampleRow(sheet, 2,
            sr: 1,
            part: "99000-22B00-000",
            name: "ECSTAR AT FLUID",
            viscosity: "75W-80",
            api: "-",
            model: "COMMON",
            source: "Local",
            lube: "Y",
            gear: "Y",
            chem: "N",
            cost: 1000m,
            purchase: 1200m,
            sale: 1500m,
            saleExcl: 1271.19m,
            pack: 12,
            sgo: "Y",
            liter: 1m,
            pType: "G",
            accessory: "N",
            discontinue: "N",
            supplier: "PSMC",
            fed: "N",
            apply: new DateTime(2026, 8, 27),
            rpdc: "N");

        WriteSampleRow(sheet, 3,
            sr: 2,
            part: "99000-EXAMPLE-E01",
            name: "ECSTAR ENGINE OIL 5W-30",
            viscosity: "5W-30",
            api: "SN",
            model: "COMMON",
            source: "C.K.D.",
            lube: "Y",
            gear: "N",
            chem: "N",
            cost: 2000m,
            purchase: 2300m,
            sale: 2800m,
            saleExcl: 2372.88m,
            pack: 4,
            sgo: "Y",
            liter: 4m,
            pType: "E",
            accessory: "N",
            discontinue: "N",
            supplier: "PSMC",
            fed: "Y",
            apply: new DateTime(2026, 8, 27),
            rpdc: "N");

        WriteSampleRow(sheet, 4,
            sr: 3,
            part: "99000-EXAMPLE-C01",
            name: "SUZUKI COOLANT",
            viscosity: "-",
            api: "-",
            model: "COMMON",
            source: "Local",
            lube: "N",
            gear: "N",
            chem: "Y",
            cost: 500m,
            purchase: 600m,
            sale: 750m,
            saleExcl: 635.59m,
            pack: 12,
            sgo: "N",
            liter: 1m,
            pType: "C",
            accessory: "N",
            discontinue: "N",
            supplier: "TPL",
            fed: "N",
            apply: null,
            rpdc: "N");

        sheet.Columns().AdjustToContents();
        sheet.SheetView.FreezeRows(1);

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    public IReadOnlyList<LubricantBulkExcelRow> Parse(Stream xlsxStream)
    {
        using var workbook = new XLWorkbook(xlsxStream);
        var sheet = workbook.Worksheets.FirstOrDefault()
            ?? throw new ConflictException("Excel file has no worksheet.");

        ValidateHeaders(sheet);

        var rows = new List<LubricantBulkExcelRow>();
        var lastRow = sheet.LastRowUsed()?.RowNumber() ?? 1;
        for (var r = 2; r <= lastRow; r++)
        {
            if (IsEmptyRow(sheet, r)) continue;

            rows.Add(new LubricantBulkExcelRow(
                ExcelRowNumber: r,
                Sr: ReadInt(sheet.Cell(r, 1)),
                PartItemNo: ReadString(sheet.Cell(r, 2)),
                MobileAppDescription: ReadString(sheet.Cell(r, 3)),
                Viscosity: ReadString(sheet.Cell(r, 4)),
                ApiStandard: ReadString(sheet.Cell(r, 5)),
                ModelCode: ReadString(sheet.Cell(r, 6)),
                Source: ReadString(sheet.Cell(r, 7)),
                LubeFlag: ReadString(sheet.Cell(r, 8)),
                GearOil: ReadString(sheet.Cell(r, 9)),
                Chemicals: ReadString(sheet.Cell(r, 10)),
                CostPrice: ReadDecimal(sheet.Cell(r, 11)),
                PurchasePrice: ReadDecimal(sheet.Cell(r, 12)),
                SalePrice: ReadDecimal(sheet.Cell(r, 13)),
                SalePriceExclTaxes: ReadDecimal(sheet.Cell(r, 14)),
                PackingSize: ReadInt(sheet.Cell(r, 15)),
                SgoFlag: ReadString(sheet.Cell(r, 16)),
                Liter: ReadDecimal(sheet.Cell(r, 17)),
                PType: ReadString(sheet.Cell(r, 18)),
                Accessory: ReadString(sheet.Cell(r, 19)),
                Discontinue: ReadString(sheet.Cell(r, 20)),
                SupplierCode: ReadString(sheet.Cell(r, 21)),
                Fed: ReadString(sheet.Cell(r, 22)),
                ApplyDate: ReadDate(sheet.Cell(r, 23)),
                RpdcFlag: ReadString(sheet.Cell(r, 24))));
        }

        if (rows.Count == 0)
            throw new ConflictException("No product rows found. Put data from row 2 onward.");

        return rows;
    }

    private static void ValidateHeaders(IXLWorksheet sheet)
    {
        for (var i = 0; i < Headers.Length; i++)
        {
            var actual = ReadString(sheet.Cell(1, i + 1)) ?? string.Empty;
            if (!actual.Equals(Headers[i], StringComparison.OrdinalIgnoreCase))
            {
                throw new ConflictException(
                    $"Invalid header in column {i + 1}. Expected '{Headers[i]}' but found '{actual}'. "
                    + "Download the sample Excel and keep the header row exactly as provided.");
            }
        }
    }

    private static void WriteSampleRow(
        IXLWorksheet sheet, int row,
        int sr, string part, string name, string viscosity, string api, string model, string source,
        string lube, string gear, string chem,
        decimal cost, decimal purchase, decimal sale, decimal saleExcl,
        int pack, string sgo, decimal liter, string pType,
        string accessory, string discontinue, string supplier, string fed, DateTime? apply, string rpdc)
    {
        sheet.Cell(row, 1).Value = sr;
        sheet.Cell(row, 2).Value = part;
        sheet.Cell(row, 3).Value = name;
        sheet.Cell(row, 4).Value = viscosity;
        sheet.Cell(row, 5).Value = api;
        sheet.Cell(row, 6).Value = model;
        sheet.Cell(row, 7).Value = source;
        sheet.Cell(row, 8).Value = lube;
        sheet.Cell(row, 9).Value = gear;
        sheet.Cell(row, 10).Value = chem;
        sheet.Cell(row, 11).Value = cost;
        sheet.Cell(row, 12).Value = purchase;
        sheet.Cell(row, 13).Value = sale;
        sheet.Cell(row, 14).Value = saleExcl;
        sheet.Cell(row, 15).Value = pack;
        sheet.Cell(row, 16).Value = sgo;
        sheet.Cell(row, 17).Value = liter;
        sheet.Cell(row, 18).Value = pType;
        sheet.Cell(row, 19).Value = accessory;
        sheet.Cell(row, 20).Value = discontinue;
        sheet.Cell(row, 21).Value = supplier;
        sheet.Cell(row, 22).Value = fed;
        if (apply is DateTime d)
        {
            sheet.Cell(row, 23).Value = d;
            sheet.Cell(row, 23).Style.DateFormat.Format = "yyyy-mm-dd";
        }
        sheet.Cell(row, 24).Value = rpdc;
    }

    private static bool IsEmptyRow(IXLWorksheet sheet, int row)
    {
        for (var c = 1; c <= Headers.Length; c++)
        {
            if (!sheet.Cell(row, c).IsEmpty()) return false;
        }
        return true;
    }

    private static string? ReadString(IXLCell cell)
    {
        if (cell.IsEmpty()) return null;
        string? text = null;
        try { text = cell.GetString()?.Trim(); } catch { /* not a string cell */ }
        if (string.IsNullOrWhiteSpace(text))
            text = cell.Value.ToString()?.Trim();
        return string.IsNullOrWhiteSpace(text) ? null : text;
    }

    private static int? ReadInt(IXLCell cell)
    {
        if (cell.IsEmpty()) return null;
        if (cell.TryGetValue(out double d)) return (int)Math.Round(d);
        var s = ReadString(cell);
        return int.TryParse(s, out var i) ? i : null;
    }

    private static decimal? ReadDecimal(IXLCell cell)
    {
        if (cell.IsEmpty()) return null;
        if (cell.TryGetValue(out double d)) return Convert.ToDecimal(d);
        var s = ReadString(cell);
        return decimal.TryParse(s, out var m) ? m : null;
    }

    private static DateTime? ReadDate(IXLCell cell)
    {
        if (cell.IsEmpty()) return null;
        if (cell.TryGetValue(out DateTime dt)) return dt.Date;
        if (cell.TryGetValue(out double oa))
        {
            try { return DateTime.FromOADate(oa).Date; }
            catch { /* ignore */ }
        }

        var s = ReadString(cell);
        if (string.IsNullOrWhiteSpace(s)) return null;
        if (DateTime.TryParse(s, out var parsed)) return parsed.Date;
        return null;
    }
}
