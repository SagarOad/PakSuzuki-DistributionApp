using PakSuzuki.Domain.Common;

namespace PakSuzuki.Domain.Entities;

/// <summary>
/// Master-data fields for a catalog SKU (lubricants now, parts later).
/// ExtraAttributesJson holds type-specific fields we do not yet have columns for.
/// Accessory and RpdcFlag are stored only — no business logic until the client defines them.
/// </summary>
public class ProductCatalogProfile : AuditableEntity
{
    public Guid ProductId { get; set; }
    public Product Product { get; set; } = default!;

    public Guid ProductTypeId { get; set; }
    public CatalogProductType ProductType { get; set; } = default!;

    public Guid CategoryId { get; set; }
    public CatalogCategory Category { get; set; } = default!;

    public Guid PTypeId { get; set; }
    public CatalogPType PType { get; set; } = default!;

    public string? Viscosity { get; set; }
    public string? ApiStandard { get; set; }
    public string? ModelCode { get; set; }
    public string SourceCode { get; set; } = default!;
    public bool SgoFlag { get; set; }
    public string SupplierCode { get; set; } = default!;

    /// <summary>Size of one retail unit (bottle/can). Pair with UnitType (L, ml, gm, unit).</summary>
    public decimal UnitValue { get; set; }
    public string UnitType { get; set; } = "L";

    /// <summary>How many retail units are in one sellable pack/carton. Orders use this pack as the unit of measure.</summary>
    public int PackQuantity { get; set; } = 1;

    public decimal SalePriceExclTaxes { get; set; }
    public bool FedApplicable { get; set; }
    public bool Discontinued { get; set; }
    public DateTime? ApplyDate { get; set; }

    public bool RpdcFlag { get; set; }
    public string? Accessory { get; set; }

    public string? ExtraAttributesJson { get; set; }
}
