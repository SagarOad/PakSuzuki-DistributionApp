using PakSuzuki.Domain.Common;

namespace PakSuzuki.Domain.Entities;

// 3.7.1: dynamic incentive criteria based on Liters / Cartons / Amount, targeted
// at a dynamic selection of distributors/retailers.
public class Incentive : AuditableEntity
{
    public string Name { get; set; } = default!;
    public string CriteriaType { get; set; } = default!; // "Liters" | "Cartons" | "Amount"
    public decimal ThresholdValue { get; set; }
    public decimal RewardValue { get; set; }
    public DateTime StartDateUtc { get; set; }
    public DateTime EndDateUtc { get; set; }
    public bool IsActive { get; set; } = true;

    public ICollection<IncentiveParticipant> Participants { get; set; } = new List<IncentiveParticipant>();
}

public class IncentiveParticipant : AuditableEntity
{
    public Guid IncentiveId { get; set; }
    public Incentive Incentive { get; set; } = default!;

    public Guid? DistributorId { get; set; }
    public Guid? RetailerId { get; set; }

    public decimal AchievedValue { get; set; }
    public bool IsEligible { get; set; }
}
