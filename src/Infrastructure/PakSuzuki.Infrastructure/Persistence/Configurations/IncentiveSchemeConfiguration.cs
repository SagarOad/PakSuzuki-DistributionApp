using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PakSuzuki.Domain.Entities;

namespace PakSuzuki.Infrastructure.Persistence.Configurations;

public class ProductGroupConfiguration : IEntityTypeConfiguration<ProductGroup>
{
    public void Configure(EntityTypeBuilder<ProductGroup> builder)
    {
        builder.Property(x => x.Name).HasMaxLength(200).IsRequired();
        builder.Property(x => x.Description).HasMaxLength(1000);
        builder.HasIndex(x => x.Name);
        builder.HasMany(x => x.Members).WithOne(m => m.ProductGroup).HasForeignKey(m => m.ProductGroupId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(x => x.Schemes).WithOne(s => s.ProductGroup).HasForeignKey(s => s.ProductGroupId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public class ProductGroupMemberConfiguration : IEntityTypeConfiguration<ProductGroupMember>
{
    public void Configure(EntityTypeBuilder<ProductGroupMember> builder)
    {
        builder.Property(x => x.PartItemNo).HasMaxLength(50).IsRequired();
        builder.HasIndex(x => new { x.ProductGroupId, x.ProductId }).IsUnique();
        builder.HasOne(x => x.Product).WithMany().HasForeignKey(x => x.ProductId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public class IncentiveSchemeConfiguration : IEntityTypeConfiguration<IncentiveScheme>
{
    public void Configure(EntityTypeBuilder<IncentiveScheme> builder)
    {
        builder.Property(x => x.Name).HasMaxLength(200).IsRequired();
        builder.Property(x => x.Description).HasMaxLength(1000);
        builder.Property(x => x.SchemeType).HasMaxLength(40).IsRequired();
        builder.Property(x => x.PercentOfSalesRate).HasPrecision(18, 6);
        builder.HasIndex(x => x.Name);
        builder.HasMany(x => x.Slabs).WithOne(s => s.IncentiveScheme).HasForeignKey(s => s.IncentiveSchemeId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(x => x.Participants).WithOne(p => p.IncentiveScheme).HasForeignKey(p => p.IncentiveSchemeId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public class IncentiveSchemeDistributorConfiguration : IEntityTypeConfiguration<IncentiveSchemeDistributor>
{
    public void Configure(EntityTypeBuilder<IncentiveSchemeDistributor> builder)
    {
        builder.HasIndex(x => new { x.IncentiveSchemeId, x.DistributorId }).IsUnique();
        builder.HasOne(x => x.Distributor).WithMany().HasForeignKey(x => x.DistributorId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public class IncentiveSchemeSlabConfiguration : IEntityTypeConfiguration<IncentiveSchemeSlab>
{
    public void Configure(EntityTypeBuilder<IncentiveSchemeSlab> builder)
    {
        builder.Property(x => x.TargetLiters).HasPrecision(18, 4);
        builder.Property(x => x.RatePerLiter).HasPrecision(18, 4);
        builder.Property(x => x.FixedBonusPkr).HasPrecision(18, 2);
        builder.HasIndex(x => new { x.IncentiveSchemeId, x.SortOrder });
    }
}
