namespace PakSuzuki.Domain.Enums;

/// <summary>
/// Distributor decision when a retailer order meets the configured pack threshold.
/// </summary>
public enum OrderFulfillmentChoice
{
    DistributorSelf = 0,
    PassToPakSuzuki = 1
}

/// <summary>
/// Where Pak Suzuki should deliver when the distributor passes a threshold order.
/// </summary>
public enum PakSuzukiShipTo
{
    Distributor = 0,
    Retailer = 1
}
