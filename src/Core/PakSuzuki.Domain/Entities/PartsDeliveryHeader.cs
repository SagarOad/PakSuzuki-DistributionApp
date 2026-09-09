namespace PakSuzuki.Domain.Entities;

/// <summary>Client table: parts_Delivery_header. Written by middleware after SAP delivery.</summary>
public class PartsDeliveryHeader
{
    public int Id { get; set; }

    public string DealerCode { get; set; } = default!;
    public string? SapDealerCode { get; set; }
    public string PoRef { get; set; } = default!;
    public string? SapSalesOrderNumber { get; set; }
    public string? SapDeliveryNumber { get; set; }
    public string? SapShipToParty { get; set; }
    public string? SapHuNumber { get; set; }
    public DateTime? SapDeliveryDate { get; set; }
    public int TransferFlag { get; set; } = 1;

    public string? InvoiceNumber { get; set; }
    public DateTime? InvoiceDate { get; set; }
    public int? InvTransferFlag { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
