using PakSuzuki.Domain.Common;

namespace PakSuzuki.Domain.Entities;

// 3.3.2: both distributor and retailer can upload delivery proof.
public class ProofOfDelivery : AuditableEntity
{
    public Guid OrderId { get; set; }
    public Order Order { get; set; } = default!;

    public Guid UploadedByUserId { get; set; }
    public string UploadedByRole { get; set; } = default!; // "Distributor" or "Retailer"
    public string StorageUrl { get; set; } = default!;
    public string FileName { get; set; } = default!;
}
