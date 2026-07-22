using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PakSuzuki.Domain.Entities;

namespace PakSuzuki.Infrastructure.Persistence.Configurations;

public class DistributorConfiguration : IEntityTypeConfiguration<Distributor>
{
    public void Configure(EntityTypeBuilder<Distributor> builder)
    {
        builder.HasIndex(d => d.DistributorCode).IsUnique();
        builder.HasIndex(d => d.Cnic).IsUnique();
        builder.HasIndex(d => d.Email).IsUnique();
        builder.Property(d => d.Name).HasMaxLength(200);
        builder.Property(d => d.Iban).HasMaxLength(34);

        builder.HasOne(d => d.Region).WithMany(r => r.Distributors)
            .HasForeignKey(d => d.RegionId).OnDelete(DeleteBehavior.Restrict);

        builder.HasMany(d => d.BusinessImages).WithOne()
            .HasForeignKey(bi => bi.DistributorId).OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(d => d.Retailers).WithOne(r => r.Distributor)
            .HasForeignKey(r => r.DistributorId).OnDelete(DeleteBehavior.Restrict);
    }
}
