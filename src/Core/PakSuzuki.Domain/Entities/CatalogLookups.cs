using PakSuzuki.Domain.Common;

namespace PakSuzuki.Domain.Entities;

/// <summary>Top-level product family (Lubricants, Parts). New types can be added without a code change.</summary>
public class CatalogProductType : AuditableEntity
{
    public string Code { get; set; } = default!;
    public string Name { get; set; } = default!;
    public bool IsReady { get; set; } = true;
    public string? NotReadyMessage { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;

    public ICollection<CatalogCategory> Categories { get; set; } = new List<CatalogCategory>();
}

/// <summary>
/// UI category under a product type. Engine Oil / Gear Oil / Chemical today;
/// Parts categories can be seeded later. FormProfileJson drives which wizard fields appear.
/// </summary>
public class CatalogCategory : AuditableEntity
{
    public Guid ProductTypeId { get; set; }
    public CatalogProductType ProductType { get; set; } = default!;

    public string Code { get; set; } = default!;
    public string Name { get; set; } = default!;
    public string FormProfileJson { get; set; } = "{}";
    public string OrderUnit { get; set; } = "carton";
    public bool DefaultFedApplicable { get; set; }
    public string? GstInvoiceTypeCode { get; set; }
    public int SortOrder { get; set; }
    public bool IsReady { get; set; } = true;
    public string? NotReadyMessage { get; set; }
    public bool IsActive { get; set; } = true;

    public ICollection<CatalogPType> PTypes { get; set; } = new List<CatalogPType>();
}

/// <summary>PType code (E, G, D, …). Many PTypes can belong to one UI category.</summary>
public class CatalogPType : AuditableEntity
{
    public string Code { get; set; } = default!;
    public string DeliveryType { get; set; } = default!;
    public bool SgoFlag { get; set; }
    public string SourceScopeJson { get; set; } = "[]";
    public Guid? CategoryId { get; set; }
    public CatalogCategory? Category { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
}

public class CatalogSupplier : AuditableEntity
{
    public string Code { get; set; } = default!;
    public string Name { get; set; } = default!;
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
}

public class CatalogSource : AuditableEntity
{
    public string Code { get; set; } = default!;
    public string Name { get; set; } = default!;
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
}

public class CatalogGstInvoiceType : AuditableEntity
{
    public string Code { get; set; } = default!;
    public string Name { get; set; } = default!;
    public bool IsActive { get; set; } = true;
}

/// <summary>Default supplier from Source + PType (+ optional model). Highest Priority wins.</summary>
public class CatalogSupplierRule : AuditableEntity
{
    public string? SourceCode { get; set; }
    public string? PTypeCode { get; set; }
    public string? ModelCode { get; set; }
    public string SupplierCode { get; set; } = default!;
    public int Priority { get; set; }
    public bool IsActive { get; set; } = true;
}
