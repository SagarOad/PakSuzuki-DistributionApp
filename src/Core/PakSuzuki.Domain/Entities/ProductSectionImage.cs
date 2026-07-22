using PakSuzuki.Domain.Common;

namespace PakSuzuki.Domain.Entities;

/// <summary>Marketing / section banners attached to a product detail page.</summary>
public class ProductSectionImage : AuditableEntity
{
    public Guid ProductId { get; set; }
    public Product Product { get; set; } = default!;
    public string ImageUrl { get; set; } = default!;
    public int SortOrder { get; set; }
}
