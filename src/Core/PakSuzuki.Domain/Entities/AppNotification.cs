using PakSuzuki.Domain.Common;

namespace PakSuzuki.Domain.Entities;

/// <summary>
/// In-app notification for a login user (ApplicationUser Id).
/// </summary>
public class AppNotification : AuditableEntity
{
    public Guid UserId { get; set; }
    public string Title { get; set; } = default!;
    public string Message { get; set; } = default!;
    /// <summary>Order | Incentive | Registration | Claim | System</summary>
    public string Category { get; set; } = "System";
    public string? LinkUrl { get; set; }
    public Guid? RelatedEntityId { get; set; }
    public bool IsRead { get; set; }
    public DateTime? ReadAtUtc { get; set; }
}
