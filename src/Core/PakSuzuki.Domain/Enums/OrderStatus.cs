namespace PakSuzuki.Domain.Enums;

// Retailer -> Distributor -> PakSuzuki lifecycle (3.3). "Red" status in the doc
// (undelivered/uninvoiced) maps to any status before InvoiceConfirmed.
public enum OrderStatus
{
    PendingDistributorApproval = 0,
    SentBackForModification = 1,
    ApprovedByDistributor = 2,
    PartiallyApprovedByDistributor = 3,
    RejectedByDistributor = 4,
    ForwardedToPakSuzuki = 5,       // distributor could not fulfill, or is a direct distributor order
    PendingPakSuzukiApproval = 6,
    ApprovedByPakSuzuki = 7,
    SubmittedToSap = 8,
    PartiallyDelivered = 9,
    Delivered = 10,
    InvoiceConfirmed = 11,
    Cancelled = 12
}
