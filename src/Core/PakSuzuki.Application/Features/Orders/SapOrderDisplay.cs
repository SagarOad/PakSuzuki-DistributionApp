using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Orders;

public static class SapOrderDisplay
{
    public static string StatusColor(
        OrderStatus status,
        string? sapInvoiceNumber,
        string? sapDeliveryNumber,
        string? sapMessage,
        int? sapTransferStatus)
    {
        if (status is OrderStatus.Cancelled or OrderStatus.RejectedByDistributor)
            return "Grey";

        if (status == OrderStatus.InvoiceConfirmed || !string.IsNullOrWhiteSpace(sapInvoiceNumber))
            return "Green";

        if (status is OrderStatus.Delivered or OrderStatus.PartiallyDelivered
            || !string.IsNullOrWhiteSpace(sapDeliveryNumber))
            return "Yellow";

        if (sapTransferStatus == SapTransferFlags.Error || !string.IsNullOrWhiteSpace(sapMessage))
            return "Red";

        if (status is OrderStatus.ApprovedByPakSuzuki or OrderStatus.SubmittedToSap)
            return "Red";

        return "Grey";
    }
}
