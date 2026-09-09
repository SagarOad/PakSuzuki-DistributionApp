using PakSuzuki.Domain.Common;

namespace PakSuzuki.Domain.Entities;

/// <summary>Configurable tax rate. Rate is a fraction (0.18 = 18%). AppliesTo is category name, "all", or "invoiceTotal".</summary>
public class TaxRule : AuditableEntity
{
    public string Code { get; set; } = default!;
    public decimal Rate { get; set; }
    public string AppliesTo { get; set; } = "all";
    public DateTime? EffectiveFromUtc { get; set; }
    public DateTime? EffectiveToUtc { get; set; }
    public bool IsActive { get; set; } = true;
}

/// <summary>
/// Direct-delivery approval threshold. Null DistributorId = default for that category.
/// Per-distributor rows override the default.
/// </summary>
public class DeliveryApprovalThreshold : AuditableEntity
{
    public Guid CategoryId { get; set; }
    public CatalogCategory Category { get; set; } = default!;
    public Guid? DistributorId { get; set; }
    public string Unit { get; set; } = "carton";
    public decimal QuantityThreshold { get; set; }
    public string ApproverRoles { get; set; } = default!;
    public bool IsActive { get; set; } = true;
}

/// <summary>Which price fields a role may see on product APIs. Role names match Identity roles (and aliases like PSMC).</summary>
public class PriceVisibilityRule : AuditableEntity
{
    public string Role { get; set; } = default!;
    public bool CanSeeCost { get; set; }
    public bool CanSeePurchase { get; set; }
    public bool CanSeeSale { get; set; } = true;
    public bool IsActive { get; set; } = true;
}
