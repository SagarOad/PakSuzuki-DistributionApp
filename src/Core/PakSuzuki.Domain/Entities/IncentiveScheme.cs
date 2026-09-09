using PakSuzuki.Domain.Common;

namespace PakSuzuki.Domain.Entities;

/// <summary>Named set of product SKUs (PartItemNos) for incentive purchase summing.</summary>
public class ProductGroup : AuditableEntity
{
    public string Name { get; set; } = default!;
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;

    public ICollection<ProductGroupMember> Members { get; set; } = new List<ProductGroupMember>();
    public ICollection<IncentiveScheme> Schemes { get; set; } = new List<IncentiveScheme>();
}

public class ProductGroupMember : AuditableEntity
{
    public Guid ProductGroupId { get; set; }
    public ProductGroup ProductGroup { get; set; } = default!;

    public Guid ProductId { get; set; }
    public Product Product { get; set; } = default!;

    /// <summary>Snapshot of Product.Sku / PartItemNo at add time.</summary>
    public string PartItemNo { get; set; } = default!;
}

public static class IncentiveSchemeTypes
{
    public const string Slab = "Slab";
    public const string PercentOfSales = "PercentOfSales";
    public const string TrackingOnly = "TrackingOnly";

    public static readonly string[] All = [Slab, PercentOfSales, TrackingOnly];
}

/// <summary>
/// Incentive scheme targeting one ProductGroup with a current period.
/// </summary>
public class IncentiveScheme : AuditableEntity
{
    public string Name { get; set; } = default!;
    public string? Description { get; set; }

    public Guid ProductGroupId { get; set; }
    public ProductGroup ProductGroup { get; set; } = default!;

    /// <summary>Slab | PercentOfSales | TrackingOnly</summary>
    public string SchemeType { get; set; } = IncentiveSchemeTypes.Slab;

    public DateTime CurrentPeriodStartUtc { get; set; }
    public DateTime CurrentPeriodEndUtc { get; set; }

    /// <summary>Used by PercentOfSales schemes — percent of purchase value PKR (e.g. 12 = 12%). Admin-configurable.</summary>
    public decimal? PercentOfSalesRate { get; set; }

    public bool IsActive { get; set; } = true;

    public ICollection<IncentiveSchemeSlab> Slabs { get; set; } = new List<IncentiveSchemeSlab>();
    public ICollection<IncentiveSchemeDistributor> Participants { get; set; } = new List<IncentiveSchemeDistributor>();
}

/// <summary>Distributors enrolled in a scheme (schemes are not network-wide).</summary>
public class IncentiveSchemeDistributor : AuditableEntity
{
    public Guid IncentiveSchemeId { get; set; }
    public IncentiveScheme IncentiveScheme { get; set; } = default!;

    public Guid DistributorId { get; set; }
    public Distributor Distributor { get; set; } = default!;
}

/// <summary>
/// Slab row for Slab-type schemes. Total incentive = TargetLiters × RatePerLiter + FixedBonusPkr (computed, not stored).
/// </summary>
public class IncentiveSchemeSlab : AuditableEntity
{
    public Guid IncentiveSchemeId { get; set; }
    public IncentiveScheme IncentiveScheme { get; set; } = default!;

    public decimal TargetLiters { get; set; }
    public decimal RatePerLiter { get; set; }
    public decimal FixedBonusPkr { get; set; }
    public int SortOrder { get; set; }
}
