using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PakSuzuki.Domain.Entities;

namespace PakSuzuki.Infrastructure.Persistence.Configurations;

public class OrderClaimConfiguration : IEntityTypeConfiguration<OrderClaim>
{
    public void Configure(EntityTypeBuilder<OrderClaim> builder)
    {
        builder.ToTable("OrderClaims");
        builder.Property(x => x.Reason).HasMaxLength(4000).IsRequired();
        builder.Property(x => x.StaffRemarks).HasMaxLength(2000);

        builder.HasOne(x => x.Order).WithMany().HasForeignKey(x => x.OrderId)
            .OnDelete(DeleteBehavior.SetNull);
        builder.HasOne(x => x.Distributor).WithMany().HasForeignKey(x => x.DistributorId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(x => x.Retailer).WithMany().HasForeignKey(x => x.RetailerId)
            .OnDelete(DeleteBehavior.SetNull);
        builder.HasMany(x => x.Images).WithOne(i => i.Claim)
            .HasForeignKey(i => i.ClaimId).OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(x => x.Status);
        builder.HasIndex(x => x.DistributorId);
    }
}

public class ClaimImageConfiguration : IEntityTypeConfiguration<ClaimImage>
{
    public void Configure(EntityTypeBuilder<ClaimImage> builder)
    {
        builder.ToTable("ClaimImages");
        builder.Property(x => x.StorageUrl).HasMaxLength(1000).IsRequired();
        builder.Property(x => x.FileName).HasMaxLength(260).IsRequired();
    }
}
