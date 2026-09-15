using PakSuzuki.Domain.Common;

namespace PakSuzuki.Domain.Entities;

// 3.7.2: role-based banners/announcements with optional redirect URL.
public class Promotion : AuditableEntity
{
    public string Title { get; set; } = default!;

    /// <summary>Canonical type is LoginPopup (legacy NewsletterPopUp / PromotionBanner normalized on save).</summary>
    public string Type { get; set; } = default!;

    public string ImageUrl { get; set; } = default!;
    public int ImageWidth { get; set; }
    public int ImageHeight { get; set; }
    public string? RedirectUrl { get; set; }

    public DateTime StartDateUtc { get; set; }
    public DateTime EndDateUtc { get; set; }

    /// <summary>Comma-separated roles, e.g. "Distributor,Retailer".</summary>
    public string TargetRoles { get; set; } = default!;
    public bool IsActive { get; set; } = true;
}

/// <summary>Key/value app configuration (e.g. ship-to-party threshold).</summary>
public class SystemSetting : AuditableEntity
{
    public string Key { get; set; } = default!;
    public string Value { get; set; } = default!;
}
