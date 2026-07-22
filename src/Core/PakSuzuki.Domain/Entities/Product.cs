using PakSuzuki.Domain.Common;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Domain.Entities;

// Section 3.2. Pricing lives in ProductPrice (history-tracked) and ProductVariant
// (per pack size). Shop admin fields support My Shop UI.
public class Product : EntityWithDomainEvents
{
    public string Sku { get; set; } = default!;
    public string Name { get; set; } = default!;
    public string? Description { get; set; }
    public string? Bio { get; set; }
    public string? CategoryName { get; set; }
    public ProductCategory Category { get; set; }
    public UnitOfMeasure BaseUnit { get; set; }

    // Auto-conversion support: e.g. 1 carton = N bottles = M liters.
    public decimal ConversionFactorToBaseUnit { get; set; } = 1;

    public string? PrimaryImageUrl { get; set; }
    public bool IsPublished { get; set; }
    public bool InStock { get; set; } = true;
    public bool IsActive { get; set; } = true;

    public ICollection<ProductPrice> PriceHistory { get; set; } = new List<ProductPrice>();
    public ICollection<ProductVariant> Variants { get; set; } = new List<ProductVariant>();
    public ICollection<ProductSectionImage> SectionImages { get; set; } = new List<ProductSectionImage>();
}
