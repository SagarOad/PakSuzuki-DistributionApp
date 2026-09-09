namespace PakSuzuki.Domain.Entities;

/// <summary>
/// SAP middleware queue (client table: parts_order). One row per manufacturer order.
/// Middleware reads rows with transfer_flag = 1, then writes SAP results back here.
/// </summary>
public class PartsOrder
{
    public int Id { get; set; }

    public Guid OrderId { get; set; }
    public Order Order { get; set; } = default!;

    /// <summary>1 = ready, 2 = success, 9 = error.</summary>
    public int TransferFlag { get; set; } = 1;

    /// <summary>Same codes as TransferFlag (client workbook).</summary>
    public int SapTransferStatus { get; set; } = 1;

    public string DealerCode { get; set; } = default!;
    public string? SapDealerCode { get; set; }
    public string PoRef { get; set; } = default!;
    public string RefType { get; set; } = "PO4W";

    public string? SapSalesOrderNumber { get; set; }
    public DateTime? SapSalesOrderDate { get; set; }
    public string? SapBo1No { get; set; }
    public string? SapBo2No { get; set; }
    public string? SapMessage { get; set; }

    public string? DistributorCode { get; set; }
    public string? RetailerCode { get; set; }
    public string? ShipToCode { get; set; }
    public string? BillToCode { get; set; }

    public string QueueType { get; set; } = "Order";
    public string MiddlewareStatus { get; set; } = "Pending Middleware Pickup";
    public string? MiddlewareReferenceId { get; set; }

    public string? ApprovedBy { get; set; }
    public DateTime? ApprovedAtUtc { get; set; }
    public string? ApprovalDetails { get; set; }
    public string? SapStatus { get; set; }
    public string? ErrorDetails { get; set; }

    public ICollection<PartsOrderLine> Lines { get; set; } = new List<PartsOrderLine>();

    public int RetryCount { get; set; }
    public DateTime? PickedAtUtc { get; set; }
    public DateTime? LastRetryAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ModifiedAtUtc { get; set; }
}
