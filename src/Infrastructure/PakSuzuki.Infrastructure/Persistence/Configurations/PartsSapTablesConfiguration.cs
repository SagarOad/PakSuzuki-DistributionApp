using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PakSuzuki.Domain.Entities;

namespace PakSuzuki.Infrastructure.Persistence.Configurations;

public class PartsOrderConfiguration : IEntityTypeConfiguration<PartsOrder>
{
    public void Configure(EntityTypeBuilder<PartsOrder> builder)
    {
        builder.ToTable("parts_order");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).UseIdentityColumn();

        builder.Property(x => x.TransferFlag).HasColumnName("transfer_flag");
        builder.Property(x => x.SapTransferStatus).HasColumnName("sap_transfer_status");
        builder.Property(x => x.DealerCode).HasColumnName("dealer_code").HasMaxLength(50).IsRequired();
        builder.Property(x => x.SapDealerCode).HasColumnName("sap_dealer_code").HasMaxLength(50);
        builder.Property(x => x.PoRef).HasColumnName("po_ref").HasMaxLength(80).IsRequired();
        builder.Property(x => x.RefType).HasColumnName("ref_type").HasMaxLength(20).IsRequired();
        builder.Property(x => x.SapSalesOrderNumber).HasColumnName("sap_sales_order_number").HasMaxLength(50);
        builder.Property(x => x.SapSalesOrderDate).HasColumnName("sap_sales_order_date");
        builder.Property(x => x.SapBo1No).HasColumnName("sap_bo1_no").HasMaxLength(50);
        builder.Property(x => x.SapBo2No).HasColumnName("sap_bo2_no").HasMaxLength(50);
        builder.Property(x => x.SapMessage).HasColumnName("sap_message").HasMaxLength(2000);

        builder.Property(x => x.DistributorCode).HasColumnName("distributor_code").HasMaxLength(50);
        builder.Property(x => x.RetailerCode).HasColumnName("retailer_code").HasMaxLength(50);
        builder.Property(x => x.ShipToCode).HasColumnName("ship_to_code").HasMaxLength(50);
        builder.Property(x => x.BillToCode).HasColumnName("bill_to_code").HasMaxLength(50);
        builder.Property(x => x.QueueType).HasColumnName("queue_type").HasMaxLength(40).IsRequired();
        builder.Property(x => x.MiddlewareStatus).HasColumnName("middleware_status").HasMaxLength(80).IsRequired();
        builder.Property(x => x.MiddlewareReferenceId).HasColumnName("middleware_reference_id").HasMaxLength(80);
        builder.Property(x => x.ApprovedBy).HasColumnName("approved_by").HasMaxLength(100);
        builder.Property(x => x.ApprovedAtUtc).HasColumnName("approved_at_utc");
        builder.Property(x => x.ApprovalDetails).HasColumnName("approval_details").HasMaxLength(500);
        builder.Property(x => x.SapStatus).HasColumnName("sap_status").HasMaxLength(80);
        builder.Property(x => x.ErrorDetails).HasColumnName("error_details").HasMaxLength(2000);

        builder.HasMany(x => x.Lines).WithOne(l => l.PartsOrder)
            .HasForeignKey(l => l.PartsOrderId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.Property(x => x.RetryCount).HasColumnName("retry_count");
        builder.Property(x => x.PickedAtUtc).HasColumnName("picked_at_utc");
        builder.Property(x => x.LastRetryAtUtc).HasColumnName("last_retry_at_utc");
        builder.Property(x => x.CreatedAtUtc).HasColumnName("created_at_utc");
        builder.Property(x => x.ModifiedAtUtc).HasColumnName("modified_at_utc");
        builder.Property(x => x.OrderId).HasColumnName("order_id");

        builder.HasIndex(x => x.PoRef).IsUnique();
        builder.HasIndex(x => x.OrderId).IsUnique();
        builder.HasIndex(x => x.TransferFlag);
        builder.HasIndex(x => new { x.TransferFlag, x.SapTransferStatus });

        builder.HasOne(x => x.Order).WithMany().HasForeignKey(x => x.OrderId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public class PartsDeliveryHeaderConfiguration : IEntityTypeConfiguration<PartsDeliveryHeader>
{
    public void Configure(EntityTypeBuilder<PartsDeliveryHeader> builder)
    {
        builder.ToTable("parts_Delivery_header");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).UseIdentityColumn();

        builder.Property(x => x.DealerCode).HasColumnName("dealer_code").HasMaxLength(50).IsRequired();
        builder.Property(x => x.SapDealerCode).HasColumnName("sap_dealer_code").HasMaxLength(50);
        builder.Property(x => x.PoRef).HasColumnName("po_ref").HasMaxLength(80).IsRequired();
        builder.Property(x => x.SapSalesOrderNumber).HasColumnName("sap_sales_order_number").HasMaxLength(50);
        builder.Property(x => x.SapDeliveryNumber).HasColumnName("sap_delivery_number").HasMaxLength(50);
        builder.Property(x => x.SapShipToParty).HasColumnName("sap_ship_to_party").HasMaxLength(50);
        builder.Property(x => x.SapHuNumber).HasColumnName("sap_hu_number").HasMaxLength(50);
        builder.Property(x => x.SapDeliveryDate).HasColumnName("sap_delivery_date");
        builder.Property(x => x.TransferFlag).HasColumnName("transfer_flag");
        builder.Property(x => x.InvoiceNumber).HasColumnName("invoice_number").HasMaxLength(50);
        builder.Property(x => x.InvoiceDate).HasColumnName("invoice_date");
        builder.Property(x => x.InvTransferFlag).HasColumnName("inv_transfer_flag");
        builder.Property(x => x.CreatedAtUtc).HasColumnName("created_at_utc");

        builder.HasIndex(x => x.PoRef);
        builder.HasIndex(x => x.SapDeliveryNumber);
        builder.HasIndex(x => x.TransferFlag);
    }
}

public class PartsDeliveryDetailConfiguration : IEntityTypeConfiguration<PartsDeliveryDetail>
{
    public void Configure(EntityTypeBuilder<PartsDeliveryDetail> builder)
    {
        builder.ToTable("parts_Delivery_detail");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).UseIdentityColumn();

        builder.Property(x => x.DealerCode).HasColumnName("dealer_code").HasMaxLength(50).IsRequired();
        builder.Property(x => x.SapDealerCode).HasColumnName("sap_dealer_code").HasMaxLength(50);
        builder.Property(x => x.PoRef).HasColumnName("po_ref").HasMaxLength(80).IsRequired();
        builder.Property(x => x.SapSalesOrderNumber).HasColumnName("sap_sales_order_number").HasMaxLength(50);
        builder.Property(x => x.SapDeliveryNumber).HasColumnName("sap_delivery_number").HasMaxLength(50);
        builder.Property(x => x.SapHuNumber).HasColumnName("sap_hu_number").HasMaxLength(50);
        builder.Property(x => x.SapMaterial).HasColumnName("sap_material").HasMaxLength(50).IsRequired();
        builder.Property(x => x.OrderQty).HasColumnName("order_qty").HasColumnType("decimal(18,4)");
        builder.Property(x => x.SapDeliveredQuantity).HasColumnName("sap_delivered_quantity").HasColumnType("decimal(18,4)");
        builder.Property(x => x.TransferFlag).HasColumnName("transfer_flag");
        builder.Property(x => x.CreatedAtUtc).HasColumnName("created_at_utc");

        builder.HasIndex(x => x.PoRef);
        builder.HasIndex(x => new { x.PoRef, x.SapMaterial });
        builder.HasIndex(x => x.TransferFlag);
    }
}

public class PartsOrderLineConfiguration : IEntityTypeConfiguration<PartsOrderLine>
{
    public void Configure(EntityTypeBuilder<PartsOrderLine> builder)
    {
        builder.ToTable("parts_order_line");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).UseIdentityColumn();
        builder.Property(x => x.PartsOrderId).HasColumnName("parts_order_id");
        builder.Property(x => x.OrderItemId).HasColumnName("order_item_id");
        builder.Property(x => x.MaterialCode).HasColumnName("material_code").HasMaxLength(50).IsRequired();
        builder.Property(x => x.ApprovedQuantity).HasColumnName("approved_qty").HasColumnType("decimal(18,4)");
        builder.Property(x => x.Uom).HasColumnName("uom").HasMaxLength(20).IsRequired();
        builder.HasIndex(x => x.PartsOrderId);
    }
}
