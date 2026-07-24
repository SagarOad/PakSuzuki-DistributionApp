using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PakSuzuki.Domain.Entities;

namespace PakSuzuki.Infrastructure.Persistence.Configurations;

public class IncentiveConfiguration : IEntityTypeConfiguration<Incentive>
{
    public void Configure(EntityTypeBuilder<Incentive> builder)
    {
        builder.Property(x => x.Name).HasMaxLength(200).IsRequired();
        builder.Property(x => x.Description).HasMaxLength(1000);
        builder.Property(x => x.CriteriaType).HasMaxLength(40).IsRequired();
        builder.Property(x => x.ThresholdValue).HasColumnType("decimal(18,2)");

        builder.HasMany(x => x.Slabs).WithOne(s => s.Incentive)
            .HasForeignKey(s => s.IncentiveId).OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(x => x.Participants).WithOne(p => p.Incentive)
            .HasForeignKey(p => p.IncentiveId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class IncentiveAchievementSlabConfiguration : IEntityTypeConfiguration<IncentiveAchievementSlab>
{
    public void Configure(EntityTypeBuilder<IncentiveAchievementSlab> builder)
    {
        builder.Property(x => x.MinPercent).HasColumnType("decimal(8,2)");
        builder.Property(x => x.MaxPercent).HasColumnType("decimal(8,2)");
        builder.Property(x => x.IncentivePercent).HasColumnType("decimal(8,2)");
    }
}

public class IncentiveParticipantConfiguration : IEntityTypeConfiguration<IncentiveParticipant>
{
    public void Configure(EntityTypeBuilder<IncentiveParticipant> builder)
    {
        builder.Property(x => x.TargetValue).HasColumnType("decimal(18,2)");
        builder.Property(x => x.AchievedValue).HasColumnType("decimal(18,2)");
        builder.Property(x => x.ApprovalStatus).HasMaxLength(40).IsRequired();
    }
}
