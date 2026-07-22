using PakSuzuki.Domain.Common;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Domain.Entities;

/// <summary>Header / category banners shown in the Shop (mobile + admin My Shop).</summary>
public class ShopBanner : AuditableEntity
{
    public ShopBannerType Type { get; set; }
    public string ProductCode { get; set; } = default!;
    public string? BannerName { get; set; }
    public string CategoryName { get; set; } = default!;
    public string ImageUrl { get; set; } = string.Empty;
    public Guid? ProductId { get; set; }
    public Product? Product { get; set; }
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
}
