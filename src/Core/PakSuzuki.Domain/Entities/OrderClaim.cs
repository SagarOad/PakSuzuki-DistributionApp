using PakSuzuki.Domain.Common;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Domain.Entities;

/// <summary>
/// Distributor/retailer product or delivery claim reviewed by Pak Suzuki staff.
/// </summary>
public class OrderClaim : AuditableEntity
{
    public Guid? OrderId { get; set; }
    public Order? Order { get; set; }

    public Guid DistributorId { get; set; }
    public Distributor Distributor { get; set; } = default!;

    public Guid? RetailerId { get; set; }
    public Retailer? Retailer { get; set; }

    public string Reason { get; set; } = default!;
    public ClaimStatus Status { get; set; } = ClaimStatus.InProcess;

    public string? StaffRemarks { get; set; }
    public DateTime? ActionedAtUtc { get; set; }

    public ICollection<ClaimImage> Images { get; set; } = new List<ClaimImage>();
}

public class ClaimImage : AuditableEntity
{
    public Guid ClaimId { get; set; }
    public OrderClaim Claim { get; set; } = default!;

    public string StorageUrl { get; set; } = default!;
    public string FileName { get; set; } = default!;
    public int SortOrder { get; set; }
}
