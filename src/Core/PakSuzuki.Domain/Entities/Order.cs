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

    /// <summary>
    /// When a distributor places a Manufacturer (Pak Suzuki) order because they could not
    /// fulfill a retailer order from inventory, this links back to that retailer order.
    /// Super Admin still treats the new order as a normal DistributorDirectOrder.
    /// </summary>
    public Guid? OriginatingRetailerOrderId { get; set; }
    public Order? OriginatingRetailerOrder { get; set; }

    public OrderStatus Status { get; set; } = OrderStatus.PendingDistributorApproval;

    public string? DistributorRemarks { get; set; }
    public string? PakSuzukiRemarks { get; set; }
    /// <summary>Note from retailer when placing or resubmitting an order.</summary>
    public string? RetailerRemarks { get; set; }

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

    /// <summary>Manufacturer for this PO. Currently always PSMC (Pak Suzuki).</summary>
    public string? VendorCode { get; set; }

    /// <summary>Product source lane: Local or C.K.D. (old "Order Type"). Separate from Order.Source (who placed the order).</summary>
    public string? MaterialSourceCode { get; set; }

    /// <summary>PType code that drives delivery type / SGO lane (E, G, D, …).</summary>
    public string? DeliveryTypeCode { get; set; }

    /// <summary>Friendly delivery label snapshot, e.g. SGO (Engine Oil).</summary>
    public string? DeliveryTypeName { get; set; }

    /// <summary>Supplier for this PO (PSMC, ILP, TPL, …).</summary>
    public string? SupplierCode { get; set; }

    /// <summary>True when this order's pack quantity meets the configured delivery threshold.</summary>
    public bool ThresholdMet { get; set; }

    /// <summary>Distributor choice when ThresholdMet: fulfill from stock or pass to Pak Suzuki.</summary>
    public OrderFulfillmentChoice? FulfillmentChoice { get; set; }

    /// <summary>Where Pak Suzuki should deliver when the order is passed on.</summary>
    public PakSuzukiShipTo? PakSuzukiShipTo { get; set; }

    /// <summary>Always snapshotted. Suzuki will replace sample values with live SAP codes.</summary>
    public string? DistributorCode { get; set; }

    /// <summary>Only set when threshold is met and the order is passed to Pak Suzuki.</summary>
    public string? RetailerCode { get; set; }

    public string? ShipToCode { get; set; }
    public string? BillToCode { get; set; }

    public ICollection<OrderItem> Items { get; set; } = new List<OrderItem>();
    public ICollection<ProofOfDelivery> ProofsOfDelivery { get; set; } = new List<ProofOfDelivery>();
}
