using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PakSuzuki.Domain.Entities;

namespace PakSuzuki.Infrastructure.Persistence.Configurations;

public class RegionalHeadAssignmentConfiguration : IEntityTypeConfiguration<RegionalHeadAssignment>
{
    public void Configure(EntityTypeBuilder<RegionalHeadAssignment> builder)
    {
        // Matches InitialCreate migration table name (singular).
        builder.ToTable("RegionalHeadAssignment");
        builder.HasKey(x => x.Id);
        builder.HasIndex(x => x.RegionId);
        builder.HasOne(x => x.Region)
            .WithMany(r => r.RegionalHeads)
            .HasForeignKey(x => x.RegionId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
