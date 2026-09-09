using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PakSuzuki.Domain.Entities;

namespace PakSuzuki.Infrastructure.Persistence.Configurations;

public class CatalogProductTypeConfiguration : IEntityTypeConfiguration<CatalogProductType>
{
    public void Configure(EntityTypeBuilder<CatalogProductType> builder)
    {
        builder.HasIndex(x => x.Code).IsUnique();
        builder.Property(x => x.Code).HasMaxLength(40).IsRequired();
        builder.Property(x => x.Name).HasMaxLength(80).IsRequired();
        builder.Property(x => x.NotReadyMessage).HasMaxLength(400);
        builder.HasMany(x => x.Categories).WithOne(c => c.ProductType)
            .HasForeignKey(c => c.ProductTypeId).OnDelete(DeleteBehavior.Restrict);
    }
}

public class CatalogCategoryConfiguration : IEntityTypeConfiguration<CatalogCategory>
{
    public void Configure(EntityTypeBuilder<CatalogCategory> builder)
    {
        builder.HasIndex(x => new { x.ProductTypeId, x.Code }).IsUnique();
        builder.Property(x => x.Code).HasMaxLength(40).IsRequired();
        builder.Property(x => x.Name).HasMaxLength(80).IsRequired();
        builder.Property(x => x.FormProfileJson).IsRequired();
        builder.Property(x => x.OrderUnit).HasMaxLength(20).IsRequired();
        builder.Property(x => x.GstInvoiceTypeCode).HasMaxLength(20);
        builder.Property(x => x.NotReadyMessage).HasMaxLength(400);
        builder.HasMany(x => x.PTypes).WithOne(p => p.Category)
            .HasForeignKey(p => p.CategoryId).OnDelete(DeleteBehavior.SetNull);
    }
}

public class CatalogPTypeConfiguration : IEntityTypeConfiguration<CatalogPType>
{
    public void Configure(EntityTypeBuilder<CatalogPType> builder)
    {
        builder.HasIndex(x => x.Code).IsUnique();
        builder.Property(x => x.Code).HasMaxLength(8).IsRequired();
        builder.Property(x => x.DeliveryType).HasMaxLength(80).IsRequired();
        builder.Property(x => x.SourceScopeJson).HasMaxLength(200).IsRequired();
    }
}

public class CatalogSupplierConfiguration : IEntityTypeConfiguration<CatalogSupplier>
{
    public void Configure(EntityTypeBuilder<CatalogSupplier> builder)
    {
        builder.HasIndex(x => x.Code).IsUnique();
        builder.Property(x => x.Code).HasMaxLength(20).IsRequired();
        builder.Property(x => x.Name).HasMaxLength(120).IsRequired();
    }
}

public class CatalogSourceConfiguration : IEntityTypeConfiguration<CatalogSource>
{
    public void Configure(EntityTypeBuilder<CatalogSource> builder)
    {
        builder.HasIndex(x => x.Code).IsUnique();
        builder.Property(x => x.Code).HasMaxLength(20).IsRequired();
        builder.Property(x => x.Name).HasMaxLength(40).IsRequired();
    }
}

public class CatalogGstInvoiceTypeConfiguration : IEntityTypeConfiguration<CatalogGstInvoiceType>
{
    public void Configure(EntityTypeBuilder<CatalogGstInvoiceType> builder)
    {
        builder.HasIndex(x => x.Code).IsUnique();
        builder.Property(x => x.Code).HasMaxLength(20).IsRequired();
        builder.Property(x => x.Name).HasMaxLength(160).IsRequired();
    }
}

public class CatalogSupplierRuleConfiguration : IEntityTypeConfiguration<CatalogSupplierRule>
{
    public void Configure(EntityTypeBuilder<CatalogSupplierRule> builder)
    {
        builder.Property(x => x.SourceCode).HasMaxLength(20);
        builder.Property(x => x.PTypeCode).HasMaxLength(8);
        builder.Property(x => x.ModelCode).HasMaxLength(40);
        builder.Property(x => x.SupplierCode).HasMaxLength(20).IsRequired();
        builder.HasIndex(x => new { x.PTypeCode, x.SourceCode, x.ModelCode, x.Priority });
    }
}

public class TaxRuleConfiguration : IEntityTypeConfiguration<TaxRule>
{
    public void Configure(EntityTypeBuilder<TaxRule> builder)
    {
        builder.HasIndex(x => x.Code).IsUnique();
        builder.Property(x => x.Code).HasMaxLength(40).IsRequired();
        builder.Property(x => x.Rate).HasColumnType("decimal(12,6)");
        builder.Property(x => x.AppliesTo).HasMaxLength(200).IsRequired();
    }
}

public class DeliveryApprovalThresholdConfiguration : IEntityTypeConfiguration<DeliveryApprovalThreshold>
{
    public void Configure(EntityTypeBuilder<DeliveryApprovalThreshold> builder)
    {
        builder.Property(x => x.Unit).HasMaxLength(20).IsRequired();
        builder.Property(x => x.QuantityThreshold).HasColumnType("decimal(18,2)");
        builder.Property(x => x.ApproverRoles).HasMaxLength(200).IsRequired();
        builder.HasIndex(x => new { x.CategoryId, x.DistributorId }).IsUnique();
        builder.HasOne(x => x.Category).WithMany()
            .HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.Restrict);
    }
}

public class PriceVisibilityRuleConfiguration : IEntityTypeConfiguration<PriceVisibilityRule>
{
    public void Configure(EntityTypeBuilder<PriceVisibilityRule> builder)
    {
        builder.HasIndex(x => x.Role).IsUnique();
        builder.Property(x => x.Role).HasMaxLength(40).IsRequired();
    }
}

public class ProductCatalogProfileConfiguration : IEntityTypeConfiguration<ProductCatalogProfile>
{
    public void Configure(EntityTypeBuilder<ProductCatalogProfile> builder)
    {
        builder.HasIndex(x => x.ProductId).IsUnique();
        builder.Property(x => x.Viscosity).HasMaxLength(40);
        builder.Property(x => x.ApiStandard).HasMaxLength(20);
        builder.Property(x => x.ModelCode).HasMaxLength(40);
        builder.Property(x => x.SourceCode).HasMaxLength(20).IsRequired();
        builder.Property(x => x.SupplierCode).HasMaxLength(20).IsRequired();
        builder.Property(x => x.UnitType).HasMaxLength(20).IsRequired();
        builder.Property(x => x.UnitValue).HasColumnType("decimal(18,4)");
        builder.Property(x => x.SalePriceExclTaxes).HasColumnType("decimal(18,2)");
        builder.Property(x => x.Accessory).HasMaxLength(8);
        builder.HasOne(x => x.ProductType).WithMany()
            .HasForeignKey(x => x.ProductTypeId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(x => x.Category).WithMany()
            .HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(x => x.PType).WithMany()
            .HasForeignKey(x => x.PTypeId).OnDelete(DeleteBehavior.Restrict);
    }
}
