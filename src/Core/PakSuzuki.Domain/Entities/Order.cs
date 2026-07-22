using PakSuzuki.Domain.Common;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Domain.Entities;

// Section 3.3. Covers both the retailer->distributor flow and the distributor->PakSuzuki
// direct order flow (3.3.3) via OrderSource + nullable RetailerId.
public class Order : EntityWithDomainEvents
{
    // Format from doc: PO4WR/00020/26/00005 (PO + channel + R/D + codes + year + cycle number).
    public string OrderNumber { get; set; } = default!;

    public OrderSourceType Source { get; set; }

    public Guid? RetailerId { get; set; }       // null when Source == DistributorDirectOrder
    public Retailer? Retailer { get; set; }

    public Guid DistributorId { get; set; }
    public Distributor Distributor { get; set; } = default!;

    public OrderStatus Status { get; set; } = OrderStatus.PendingDistributorApproval;

    public string? DistributorRemarks { get; set; }
    public string? PakSuzukiRemarks { get; set; }

    // WHT is applied at order-summary level, not per product line (3.2 note).
    public decimal SubTotal { get; set; }
    public decimal TotalGst { get; set; }
    public decimal TotalFed { get; set; }
    public decimal WhtAmount { get; set; }
    public decimal GrandTotal { get; set; }

    // SAP integration fields (3.3.3) - populated once forwarded to SAP.
    public string? SapDocumentNumber { get; set; }
    public string? SapDeliveryNumber { get; set; }
    public string? SapGrnNumber { get; set; }
    public string? SapInvoiceNumber { get; set; }
    public bool IsPartialDelivery { get; set; }

    public DateTime? DistributorActionedAtUtc { get; set; }
    public DateTime? PakSuzukiActionedAtUtc { get; set; }
    public DateTime? InvoiceConfirmedAtUtc { get; set; }

    public ICollection<OrderItem> Items { get; set; } = new List<OrderItem>();
    public ICollection<ProofOfDelivery> ProofsOfDelivery { get; set; } = new List<ProofOfDelivery>();
}
