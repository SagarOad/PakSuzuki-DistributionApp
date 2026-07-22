namespace PakSuzuki.Domain.Enums;

// Matches functional doc section 2. Stored as string in Identity roles table,
// this enum is used across Application/API for switch-based authorization logic
// and to keep role names typo-proof.
public static class Roles
{
    public const string SuperAdmin = "SuperAdmin";   // PSMCL final approver, full visibility
    public const string Admin = "Admin";              // PSMCL operational admin (product/pricing/promos)
    public const string RegionalHead = "RegionalHead";// view-only, region-scoped dashboards
    public const string Distributor = "Distributor";  // approves retailers, fulfills/places orders
    public const string Retailer = "Retailer";        // places orders to assigned distributor

    public static readonly string[] All = { SuperAdmin, Admin, RegionalHead, Distributor, Retailer };
}
