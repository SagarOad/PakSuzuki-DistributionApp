namespace PakSuzuki.Domain.Enums;

// 3.3.3: system must track whether an order originated from a retailer or was
// placed directly by a distributor to Pak Suzuki, for reporting/SAP tracking.
public enum OrderSourceType
{
    RetailerOrder = 0,
    DistributorDirectOrder = 1
}
