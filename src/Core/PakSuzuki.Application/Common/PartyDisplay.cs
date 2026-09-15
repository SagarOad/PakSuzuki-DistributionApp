using PakSuzuki.Domain.Entities;

namespace PakSuzuki.Application.Common;

/// <summary>
/// Soft-deleted parties remain as historical “ghost” rows for orders / audit.
/// Live assignment UIs should never treat a ghost as an active assignee.
/// </summary>
public static class PartyDisplay
{
    public static string DistributorLabel(Distributor? distributor, string? snapshotName = null)
    {
        if (distributor is null)
            return string.IsNullOrWhiteSpace(snapshotName)
                ? "Former distributor (removed)"
                : $"{snapshotName} (removed)";

        var name = string.IsNullOrWhiteSpace(distributor.BusinessName)
            ? distributor.Name
            : distributor.BusinessName;

        return distributor.IsDeleted ? $"{name} (removed)" : name;
    }

    public static string RetailerLabel(Retailer? retailer, string? snapshotName = null)
    {
        if (retailer is null)
            return string.IsNullOrWhiteSpace(snapshotName)
                ? "Former retailer (removed)"
                : $"{snapshotName} (removed)";

        var name = string.IsNullOrWhiteSpace(retailer.BusinessName)
            ? retailer.Name
            : retailer.BusinessName;

        return retailer.IsDeleted ? $"{name} (removed)" : name;
    }
}
