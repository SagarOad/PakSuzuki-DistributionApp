using PakSuzuki.Domain.Common;

namespace PakSuzuki.Domain.Entities;

// 3.7.2: role-based banners/announcements/circulars with date validation and image sizing.
public class Promotion : AuditableEntity
{
    public string Title { get; set; } = default!;
    public string Type { get; set; } = default!; // Banner | Announcement | Circular
    public string ImageUrl { get; set; } = default!;
    public int ImageWidth { get; set; }
    public int ImageHeight { get; set; }

    public DateTime StartDateUtc { get; set; }
    public DateTime EndDateUtc { get; set; }

    // Comma-separated roles this promotion targets, e.g. "Distributor,Retailer".
    public string TargetRoles { get; set; } = default!;
    public bool IsActive { get; set; } = true;
}
