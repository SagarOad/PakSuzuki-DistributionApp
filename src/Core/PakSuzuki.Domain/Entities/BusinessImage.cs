using PakSuzuki.Domain.Common;

namespace PakSuzuki.Domain.Entities;

// "Business Images (minimum 6)" registration requirement (3.1). Owner is either a
// Distributor or Retailer - exactly one of the two FKs is set.
public class BusinessImage : AuditableEntity
{
    public Guid? DistributorId { get; set; }
    public Guid? RetailerId { get; set; }
    public string StorageUrl { get; set; } = default!;
    public string FileName { get; set; } = default!;
}
