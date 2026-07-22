using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PakSuzuki.Domain.Entities;

namespace PakSuzuki.Infrastructure.Persistence.Configurations;

public class RetailerConfiguration : IEntityTypeConfiguration<Retailer>
{
    public void Configure(EntityTypeBuilder<Retailer> builder)
    {
        builder.HasIndex(r => r.RetailerCode).IsUnique();
        builder.HasIndex(r => r.Cnic).IsUnique();
        builder.HasIndex(r => r.Email).IsUnique();
        builder.Property(r => r.Name).HasMaxLength(200);

        builder.HasMany(r => r.BusinessImages).WithOne()
            .HasForeignKey(bi => bi.RetailerId).OnDelete(DeleteBehavior.Cascade);
    }
}
