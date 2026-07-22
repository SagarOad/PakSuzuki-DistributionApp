using PakSuzuki.Domain.Common;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Domain.Entities;

// Section 3.1 registration + retailer blocking rule (45 days inactivity, section 2.3).
public class Retailer : EntityWithDomainEvents
{
    public Guid ApplicationUserId { get; set; }
    public string RetailerCode { get; set; } = default!;

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

    public Guid DistributorId { get; set; }
    public Distributor Distributor { get; set; } = default!;

    // Registration workflow: retailer signs up -> distributor approves -> PSMCL final approval.
    public ApprovalStatus DistributorApprovalStatus { get; set; } = ApprovalStatus.PendingReview;
    public ApprovalStatus SuperAdminApprovalStatus { get; set; } = ApprovalStatus.PendingReview;
    public string? ApprovalRemarks { get; set; }

    public bool IsActive { get; set; } = true;
    public bool IsBlocked { get; set; } = false; // set true after 45 days with no orders
    public DateTime? BlockedAtUtc { get; set; }
    public DateTime? LastOrderAtUtc { get; set; } // drives the 45-day blocking rule

    // Ship-to-Party (3.4): retailer becomes eligible for direct PakSuzuki delivery
    // once a quantity threshold is met; SAP BP code stored once created.
    public bool IsEligibleForDirectShipToParty { get; set; }
    public string? SapBusinessPartnerCode { get; set; }

    public ICollection<BusinessImage> BusinessImages { get; set; } = new List<BusinessImage>();
    public ICollection<Order> Orders { get; set; } = new List<Order>();
}
