using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PakSuzuki.Domain.Entities;

namespace PakSuzuki.Infrastructure.Persistence.Configurations;

public class ProductConfiguration : IEntityTypeConfiguration<Product>
{
    public void Configure(EntityTypeBuilder<Product> builder)
    {
        builder.HasIndex(p => p.Sku).IsUnique();
        builder.Property(p => p.Name).HasMaxLength(200);
        builder.Property(p => p.Bio).HasMaxLength(500);
        builder.Property(p => p.CategoryName).HasMaxLength(100);
        builder.Property(p => p.PrimaryImageUrl).HasMaxLength(1000);
        builder.Property(p => p.ConversionFactorToBaseUnit).HasColumnType("decimal(18,4)");

        builder.HasMany(p => p.PriceHistory).WithOne(pp => pp.Product)
            .HasForeignKey(pp => pp.ProductId).OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(p => p.Variants).WithOne(v => v.Product)
            .HasForeignKey(v => v.ProductId).OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(p => p.SectionImages).WithOne(i => i.Product)
            .HasForeignKey(i => i.ProductId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class ProductPriceConfiguration : IEntityTypeConfiguration<ProductPrice>
{
    public void Configure(EntityTypeBuilder<ProductPrice> builder)
    {
        builder.Property(pp => pp.CostPrice).HasColumnType("decimal(18,2)");
        builder.Property(pp => pp.SellingPrice).HasColumnType("decimal(18,2)");
        builder.Property(pp => pp.RetailPrice).HasColumnType("decimal(18,2)");
        builder.Property(pp => pp.GstPercent).HasColumnType("decimal(5,2)");
        builder.Property(pp => pp.FedPercent).HasColumnType("decimal(5,2)");
        builder.Property(pp => pp.WhtPercent).HasColumnType("decimal(5,2)");
        builder.Ignore(pp => pp.MarginFixed);
        builder.Ignore(pp => pp.MarginPercent);

        builder.HasIndex(pp => new { pp.ProductId, pp.IsCurrent })
            .HasFilter("[IsCurrent] = 1");
    }
}

public class ProductVariantConfiguration : IEntityTypeConfiguration<ProductVariant>
{
    public void Configure(EntityTypeBuilder<ProductVariant> builder)
    {
        builder.Property(v => v.TypeName).HasMaxLength(100);
        builder.Property(v => v.UnitQuantity).HasColumnType("decimal(18,2)");
        builder.Property(v => v.RetailPrice).HasColumnType("decimal(18,2)");
        builder.Property(v => v.DistributorPrice).HasColumnType("decimal(18,2)");
        builder.Property(v => v.CostPrice).HasColumnType("decimal(18,2)");
        builder.Property(v => v.GstPercent).HasColumnType("decimal(5,2)");
        builder.Property(v => v.FedPercent).HasColumnType("decimal(5,2)");
        builder.Property(v => v.WhtPercent).HasColumnType("decimal(5,2)");
        builder.Property(v => v.ProfitAmount).HasColumnType("decimal(18,2)");
    }
}

public class ProductSectionImageConfiguration : IEntityTypeConfiguration<ProductSectionImage>
{
    public void Configure(EntityTypeBuilder<ProductSectionImage> builder)
    {
        builder.Property(i => i.ImageUrl).HasMaxLength(1000);
    }
}

public class ShopBannerConfiguration : IEntityTypeConfiguration<ShopBanner>
{
    public void Configure(EntityTypeBuilder<ShopBanner> builder)
    {
        builder.Property(b => b.ProductCode).HasMaxLength(50);
        builder.Property(b => b.BannerName).HasMaxLength(200);
        builder.Property(b => b.CategoryName).HasMaxLength(100);
        builder.Property(b => b.ImageUrl).HasMaxLength(1000);
        builder.HasOne(b => b.Product).WithMany()
            .HasForeignKey(b => b.ProductId).OnDelete(DeleteBehavior.SetNull);
        builder.HasIndex(b => new { b.Type, b.IsActive });
    }
}
