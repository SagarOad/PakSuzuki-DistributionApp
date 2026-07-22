using PakSuzuki.Domain.Common;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Domain.Entities;

public class OrderItem : AuditableEntity
{
    public Guid OrderId { get; set; }
    public Order Order { get; set; } = default!;

    public Guid ProductId { get; set; }
    public Product Product { get; set; } = default!;

    public decimal RequestedQuantity { get; set; }
    public UnitOfMeasure RequestedUnit { get; set; }

    // Distributor can amend / partially approve retailer orders (3.3.2).
    public decimal? ApprovedQuantity { get; set; }

    public decimal UnitPrice { get; set; }      // snapshot of ProductPrice at order time
    public decimal LineSubTotal { get; set; }
    public decimal LineGst { get; set; }
    public decimal LineFed { get; set; }
}
