using PakSuzuki.Domain.Common;

namespace PakSuzuki.Domain.Entities;

// Effective-dated price record -> full history retained (3.2), and lets us compute
// margins (Super Admin/Distributor see % and fixed value margins per doc).
public class ProductPrice : AuditableEntity
{
    public Guid ProductId { get; set; }
    public Product Product { get; set; } = default!;

    public decimal CostPrice { get; set; }
    public decimal SellingPrice { get; set; }   // distributor-facing
    public decimal RetailPrice { get; set; }    // retailer-facing

    // Dynamic tax percentages per doc (3.2).
    public decimal GstPercent { get; set; }
    public decimal FedPercent { get; set; }
    public decimal WhtPercent { get; set; } // WHT (Advance Income Tax) applied at order-summary level, not per line

    public DateTime EffectiveFromUtc { get; set; } = DateTime.UtcNow;
    public DateTime? EffectiveToUtc { get; set; }
    public bool IsCurrent { get; set; } = true;

    public decimal MarginFixed => SellingPrice - CostPrice;
    public decimal MarginPercent => CostPrice == 0 ? 0 : Math.Round((SellingPrice - CostPrice) / CostPrice * 100, 2);
}
