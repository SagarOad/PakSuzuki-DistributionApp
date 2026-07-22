using PakSuzuki.Domain.Common;

namespace PakSuzuki.Domain.Entities;

// 3.10: monthly target setting + achievement tracking, e.g. "Distributor target:
// PKR 6 Million (6 months)".
public class Target : AuditableEntity
{
    public Guid DistributorId { get; set; }
    public Distributor Distributor { get; set; } = default!;

    public decimal TargetAmount { get; set; }
    public DateTime PeriodStartUtc { get; set; }
    public DateTime PeriodEndUtc { get; set; }

    public decimal AchievedAmount { get; set; }
    public decimal AchievementPercent => TargetAmount == 0 ? 0 : Math.Round(AchievedAmount / TargetAmount * 100, 2);
}
