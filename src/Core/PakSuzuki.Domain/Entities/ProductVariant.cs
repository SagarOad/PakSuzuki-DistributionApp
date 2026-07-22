using PakSuzuki.Domain.Common;

namespace PakSuzuki.Domain.Entities;

/// <summary>Pack size / product type under a parent product (e.g. 2.2 Liters).</summary>
public class ProductVariant : AuditableEntity
{
    public Guid ProductId { get; set; }
    public Product Product { get; set; } = default!;

    public string TypeName { get; set; } = default!;
    public decimal UnitQuantity { get; set; }
    public decimal RetailPrice { get; set; }
    public decimal DistributorPrice { get; set; }
    public decimal CostPrice { get; set; }
    public decimal GstPercent { get; set; }
    public decimal FedPercent { get; set; }
    public decimal WhtPercent { get; set; }
    public decimal ProfitAmount { get; set; }
    public bool InStock { get; set; } = true;
    public bool IsPublished { get; set; } = true;
    public int SortOrder { get; set; }
}
