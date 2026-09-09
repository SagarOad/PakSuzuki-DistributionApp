using PakSuzuki.Domain.Common;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Domain.Entities;

// Section 3.1 registration fields + section 2.2 capabilities.
public class Distributor : EntityWithDomainEvents
{
    public Guid ApplicationUserId { get; set; } // 1:1 link to Identity user (login)
    public string DistributorCode { get; set; } = default!; // used in order number format

    // Registration fields (3.1)
    public string Name { get; set; } = default!;
    public string Cnic { get; set; } = default!;
    public string MobileNumber { get; set; } = default!;
    public string Email { get; set; } = default!;
    public string BusinessName { get; set; } = default!;
    public string Ntn { get; set; } = default!;
    public string Iban { get; set; } = default!;
    public string BusinessAddress { get; set; } = default!;
    public double Latitude { get; set; }
    public double Longitude { get; set; }

    /// <summary>Optional profile / avatar photo URL (stored under wwwroot/uploads).</summary>
    public string? ProfileImageUrl { get; set; }

    public Guid RegionId { get; set; }
    public Region Region { get; set; } = default!;

    public ApprovalStatus ApprovalStatus { get; set; } = ApprovalStatus.PendingReview;
    public string? ApprovalRemarks { get; set; }
    public DateTime? ApprovedAtUtc { get; set; }
    public Guid? ApprovedByUserId { get; set; } // Super Admin (PSMCL) final approval

    public bool IsActive { get; set; } = true;

    /// <summary>SAP dealer / BP code used in parts_order.sap_dealer_code.</summary>
    public string? SapDealerCode { get; set; }
    /// <summary>SAP ship-to party code when different from dealer code.</summary>
    public string? SapShipToCode { get; set; }

    public ICollection<BusinessImage> BusinessImages { get; set; } = new List<BusinessImage>();
    public ICollection<Retailer> Retailers { get; set; } = new List<Retailer>();
    public ICollection<Order> Orders { get; set; } = new List<Order>();
    public ICollection<Target> Targets { get; set; } = new List<Target>();
}
