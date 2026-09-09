namespace PakSuzuki.Domain.Entities;

/// <summary>Client table: parts_Delivery_detail. Line-level delivered qty from SAP.</summary>
public class PartsDeliveryDetail
{
    public int Id { get; set; }

    public string DealerCode { get; set; } = default!;
    public string? SapDealerCode { get; set; }
    public string PoRef { get; set; } = default!;
    public string? SapSalesOrderNumber { get; set; }
    public string? SapDeliveryNumber { get; set; }
    public string? SapHuNumber { get; set; }
    public string SapMaterial { get; set; } = default!;
    public decimal? OrderQty { get; set; }
    public decimal SapDeliveredQuantity { get; set; }
    public int TransferFlag { get; set; } = 1;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
