namespace PakSuzuki.Domain.Enums;

/// <summary>
/// Values from the client SAP workbook (transfer_flag / sap_transfer_status).
/// 1 = ready to transfer, 2 = transferred, 9 = SAP error.
/// </summary>
public static class SapTransferFlags
{
    public const int ReadyToTransfer = 1;
    public const int SuccessfullyTransferred = 2;
    public const int Error = 9;
}

public static class SapMiddlewareStatuses
{
    public const string PendingMiddlewarePickup = "Pending Middleware Pickup";
    public const string PickedByMiddleware = "Picked by Middleware";
    public const string Acknowledged = "Acknowledged";
    public const string MiddlewareValidationFailed = "Middleware Validation Failed";
    public const string ProcessingInSap = "Processing in SAP";
    public const string SapOrderCreated = "SAP Order Created";
    public const string SapError = "SAP Error";
    public const string DeliveryCreated = "Delivery Created";
    public const string InvoicePending = "Invoice Pending";
    public const string InvoiceGenerated = "Invoice Generated";
    public const string Completed = "Completed";
    public const string AmendmentPending = "Amendment Pending Pickup";
}

public static class SapQueueTypes
{
    public const string Order = "Order";
    public const string Amendment = "Amendment";
}
