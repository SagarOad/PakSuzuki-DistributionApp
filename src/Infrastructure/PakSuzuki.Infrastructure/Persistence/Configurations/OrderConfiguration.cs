using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PakSuzuki.Domain.Entities;

namespace PakSuzuki.Infrastructure.Persistence.Configurations;

public class OrderConfiguration : IEntityTypeConfiguration<Order>
{
    public void Configure(EntityTypeBuilder<Order> builder)
    {
        builder.HasIndex(o => o.OrderNumber).IsUnique();
        builder.Property(o => o.SubTotal).HasColumnType("decimal(18,2)");
        builder.Property(o => o.TotalGst).HasColumnType("decimal(18,2)");
        builder.Property(o => o.TotalFed).HasColumnType("decimal(18,2)");
        builder.Property(o => o.WhtAmount).HasColumnType("decimal(18,2)");
        builder.Property(o => o.GrandTotal).HasColumnType("decimal(18,2)");

        builder.HasOne(o => o.Distributor).WithMany(d => d.Orders)
            .HasForeignKey(o => o.DistributorId).OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(o => o.Retailer).WithMany(r => r.Orders)
            .HasForeignKey(o => o.RetailerId).OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(o => o.OriginatingRetailerOrder)
            .WithMany()
            .HasForeignKey(o => o.OriginatingRetailerOrderId)
            .OnDelete(DeleteBehavior.NoAction);

        builder.HasMany(o => o.Items).WithOne(i => i.Order)
            .HasForeignKey(i => i.OrderId).OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(o => o.ProofsOfDelivery).WithOne(p => p.Order)
            .HasForeignKey(p => p.OrderId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class OrderItemConfiguration : IEntityTypeConfiguration<OrderItem>
{
    public void Configure(EntityTypeBuilder<OrderItem> builder)
    {
        builder.Property(i => i.RequestedQuantity).HasColumnType("decimal(18,4)");
        builder.Property(i => i.ApprovedQuantity).HasColumnType("decimal(18,4)");
        builder.Property(i => i.UnitPrice).HasColumnType("decimal(18,2)");
        builder.Property(i => i.LineSubTotal).HasColumnType("decimal(18,2)");
        builder.Property(i => i.LineGst).HasColumnType("decimal(18,2)");
        builder.Property(i => i.LineFed).HasColumnType("decimal(18,2)");
        builder.Property(i => i.VariantTypeName).HasMaxLength(100);

        // NoAction avoids SQL Server multiple cascade paths (Order/Product already linked).
        builder.HasOne(i => i.ProductVariant)
            .WithMany()
            .HasForeignKey(i => i.ProductVariantId)
            .OnDelete(DeleteBehavior.NoAction);
    }
}
