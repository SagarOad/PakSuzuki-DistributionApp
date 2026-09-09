using PakSuzuki.Domain.Entities;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Orders;

/// <summary>
/// Suzuki will replace these with live SAP partner codes. Until then we snapshot
/// sample codes from the profile business codes so middleware always has values.
/// </summary>
public static class SapPartnerCodes
{
    public static string Distributor(Distributor distributor) =>
        FirstNonEmpty(distributor.SapDealerCode, distributor.DistributorCode, "D-SAMPLE-001");

    public static string Retailer(Retailer retailer) =>
        FirstNonEmpty(retailer.SapBusinessPartnerCode, retailer.RetailerCode, "R-SAMPLE-001");

    public static string ShipToDistributor(Distributor distributor) =>
        FirstNonEmpty(distributor.SapShipToCode, $"ST-D-{Distributor(distributor)}");

    public static string ShipToRetailer(Retailer retailer) =>
        FirstNonEmpty(retailer.SapBusinessPartnerCode, $"ST-R-{Retailer(retailer)}");

    public static string BillToDistributor(Distributor distributor) =>
        FirstNonEmpty(distributor.SapDealerCode, $"BT-D-{Distributor(distributor)}");

    public static void ApplyPassThroughCodes(Order order, PakSuzukiShipTo shipTo)
    {
        var distributor = order.Distributor ?? throw new InvalidOperationException("Order distributor is required.");
        order.DistributorCode = Distributor(distributor);
        order.BillToCode = BillToDistributor(distributor);

        if (order.ThresholdMet
            && order.FulfillmentChoice == OrderFulfillmentChoice.PassToPakSuzuki
            && order.Retailer != null)
        {
            order.RetailerCode = Retailer(order.Retailer);
            order.ShipToCode = shipTo == PakSuzukiShipTo.Retailer
                ? ShipToRetailer(order.Retailer)
                : ShipToDistributor(distributor);
        }
        else
        {
            order.RetailerCode = null;
            order.ShipToCode = ShipToDistributor(distributor);
        }
    }

    public static void ApplyDistributorDirectCodes(Order order)
    {
        var distributor = order.Distributor ?? throw new InvalidOperationException("Order distributor is required.");
        order.DistributorCode = Distributor(distributor);
        order.RetailerCode = null;
        order.ShipToCode = ShipToDistributor(distributor);
        order.BillToCode = BillToDistributor(distributor);
    }

    private static string FirstNonEmpty(params string?[] values) =>
        values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v))?.Trim() ?? "SAMPLE-000";
}
