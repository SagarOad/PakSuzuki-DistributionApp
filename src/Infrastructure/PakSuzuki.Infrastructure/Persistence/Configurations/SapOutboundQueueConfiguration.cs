using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PakSuzuki.Domain.Entities;

namespace PakSuzuki.Infrastructure.Persistence.Configurations;

public class SapOutboundQueueConfiguration : IEntityTypeConfiguration<SapOutboundQueue>
{
    public void Configure(EntityTypeBuilder<SapOutboundQueue> builder)
    {
        builder.ToTable("SapOutboundQueues");
        builder.Property(x => x.QueueType).HasMaxLength(80).IsRequired();
        builder.Property(x => x.Status).HasMaxLength(40).IsRequired();
        builder.Property(x => x.CorrelationKey).HasMaxLength(100);
        builder.Property(x => x.PayloadJson).HasColumnType("nvarchar(max)");
        builder.Property(x => x.ResponseJson).HasColumnType("nvarchar(max)");
        builder.Property(x => x.LastError).HasMaxLength(2000);
        builder.Property(x => x.ExtJson).HasColumnType("nvarchar(max)");

        builder.HasOne(x => x.Order).WithMany().HasForeignKey(x => x.OrderId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(x => x.Status);
        builder.HasIndex(x => x.QueueType);
        builder.HasIndex(x => x.OrderId);
        builder.HasIndex(x => new { x.Status, x.NextAttemptAtUtc });
    }
}
