using PakSuzuki.Domain.Common;

namespace PakSuzuki.Domain.Entities;

// 3.7.1: dynamic incentive criteria (Liters / Cartons / Amount) with achievement
// slabs and a dynamic selection of distributors/retailers.
public class Incentive : AuditableEntity
{
    public string Name { get; set; } = default!;
    public string? Description { get; set; }

    /// <summary>Liters | Cartons | Amount</summary>
    public string CriteriaType { get; set; } = default!;

    /// <summary>Sum of participant targets (convenience / KPI).</summary>
    public decimal ThresholdValue { get; set; }

    public DateTime StartDateUtc { get; set; }
    public DateTime EndDateUtc { get; set; }
    public bool IsActive { get; set; } = true;

    public ICollection<IncentiveAchievementSlab> Slabs { get; set; } = new List<IncentiveAchievementSlab>();
    public ICollection<IncentiveParticipant> Participants { get; set; } = new List<IncentiveParticipant>();
}

public class IncentiveAchievementSlab : AuditableEntity
{
    public Guid IncentiveId { get; set; }
    public Incentive Incentive { get; set; } = default!;

    /// <summary>Inclusive lower bound of achievement % (e.g. 80).</summary>
    public decimal MinPercent { get; set; }

    /// <summary>Inclusive upper bound of achievement % (e.g. 90). Use 999 for open-ended.</summary>
    public decimal MaxPercent { get; set; }

    public decimal IncentivePercent { get; set; }
    public int SortOrder { get; set; }
}

public class IncentiveParticipant : AuditableEntity
{
    public Guid IncentiveId { get; set; }
    public Incentive Incentive { get; set; } = default!;

    public Guid? DistributorId { get; set; }
    public Guid? RetailerId { get; set; }

    public decimal TargetValue { get; set; }
    public decimal AchievedValue { get; set; }

    /// <summary>Pending | SentForApproval | Approved | Rejected</summary>
    public string ApprovalStatus { get; set; } = "Pending";

    public bool IsEligible { get; set; }
}
