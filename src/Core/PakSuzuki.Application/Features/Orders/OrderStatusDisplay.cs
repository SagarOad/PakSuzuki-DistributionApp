using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Orders;

/// <summary>
/// Role-aware order status wording. Internal workflow still uses OrderStatus;
/// retailers should never see SAP / middleware wording.
/// </summary>
public static class OrderStatusDisplay
{
    public enum Viewer
    {
        Retailer,
        Distributor,
        Staff
    }

    public static string CustomerLabel(OrderStatus status) =>
        Contextual(status, Viewer.Retailer);

    public static string StaffLabel(OrderStatus status) =>
        Contextual(status, Viewer.Staff);

    public static string ForViewer(OrderStatus status, bool retailerViewer) =>
        Contextual(status, retailerViewer ? Viewer.Retailer : Viewer.Staff);

    /// <summary>
    /// Clear labels for list/detail screens (amendment, threshold, sent to Pak Suzuki).
    /// </summary>
    public static string Contextual(
        OrderStatus status,
        Viewer viewer,
        bool thresholdMet = false,
        bool sentBackByPakSuzuki = false,
        OrderSourceType? source = null)
    {
        switch (status)
        {
            case OrderStatus.SentBackForModification:
                return viewer == Viewer.Retailer
                    ? "Needs your amendment"
                    : "Sent back for amendment";

            case OrderStatus.PendingDistributorApproval when sentBackByPakSuzuki:
                return viewer switch
                {
                    Viewer.Distributor => "New amendment",
                    Viewer.Retailer => "Distributor updating after Pak Suzuki",
                    _ => "Sent back to distributor (amendment)"
                };

            case OrderStatus.PendingDistributorApproval when thresholdMet:
                return viewer switch
                {
                    Viewer.Distributor => "Threshold met — action needed",
                    Viewer.Retailer => "Pending approval (threshold met)",
                    _ => "Threshold met — pending distributor"
                };

            case OrderStatus.PendingDistributorApproval:
                return viewer switch
                {
                    Viewer.Distributor => "Pending your approval",
                    Viewer.Retailer => "Pending approval",
                    _ => "Pending distributor approval"
                };

            case OrderStatus.ForwardedToPakSuzuki:
            case OrderStatus.PendingPakSuzukiApproval:
                return viewer switch
                {
                    Viewer.Retailer => "Sent to Pak Suzuki",
                    Viewer.Distributor => "Sent to Pak Suzuki",
                    _ => source == OrderSourceType.DistributorDirectOrder
                        ? "Distributor order — pending Pak Suzuki"
                        : "Sent to Pak Suzuki — pending approval"
                };

            case OrderStatus.ApprovedByDistributor:
                return viewer == Viewer.Retailer
                    ? "Confirmed by distributor"
                    : "Pending";

            case OrderStatus.PartiallyApprovedByDistributor:
                return viewer == Viewer.Retailer
                    ? "Confirmed by distributor"
                    : "Pending";

            case OrderStatus.RejectedByDistributor:
                return viewer == Viewer.Retailer
                    ? "Rejected by distributor"
                    : "Rejected";

            case OrderStatus.ApprovedByPakSuzuki:
            case OrderStatus.SubmittedToSap:
                return viewer == Viewer.Retailer
                    ? "Confirmed by distributor"
                    : "Pending";

            case OrderStatus.PartiallyDelivered:
                return viewer == Viewer.Retailer
                    ? "In process"
                    : "In Process";

            case OrderStatus.Delivered:
                return "Delivered";

            case OrderStatus.InvoiceConfirmed:
                return viewer == Viewer.Retailer ? "Completed" : "Invoice confirmed";

            case OrderStatus.Cancelled:
                return "Cancelled";

            default:
                return viewer == Viewer.Retailer ? "In process" : status.ToString();
        }
    }

    public static Viewer ResolveViewer(Guid? retailerScope, Guid? distributorScope) =>
        retailerScope is not null ? Viewer.Retailer
        : distributorScope is not null ? Viewer.Distributor
        : Viewer.Staff;
}
