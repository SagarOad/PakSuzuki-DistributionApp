using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using PakSuzuki.Infrastructure.Persistence;

#nullable disable

namespace PakSuzuki.Infrastructure.Persistence.Migrations
{
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260819120000_AddSapPartsIntegrationTables")]
    public partial class AddSapPartsIntegrationTables : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF COL_LENGTH('Distributors', 'SapDealerCode') IS NULL
                    ALTER TABLE [Distributors] ADD [SapDealerCode] nvarchar(50) NULL;
                IF COL_LENGTH('Distributors', 'SapShipToCode') IS NULL
                    ALTER TABLE [Distributors] ADD [SapShipToCode] nvarchar(50) NULL;

                IF OBJECT_ID(N'dbo.parts_order', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.parts_order (
                        id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_parts_order PRIMARY KEY,
                        order_id uniqueidentifier NOT NULL,
                        transfer_flag int NOT NULL CONSTRAINT DF_parts_order_transfer_flag DEFAULT (1),
                        sap_transfer_status int NOT NULL CONSTRAINT DF_parts_order_sap_transfer_status DEFAULT (1),
                        dealer_code nvarchar(50) NOT NULL,
                        sap_dealer_code nvarchar(50) NULL,
                        po_ref nvarchar(80) NOT NULL,
                        ref_type nvarchar(20) NOT NULL,
                        sap_sales_order_number nvarchar(50) NULL,
                        sap_sales_order_date datetime2 NULL,
                        sap_bo1_no nvarchar(50) NULL,
                        sap_bo2_no nvarchar(50) NULL,
                        sap_message nvarchar(2000) NULL,
                        distributor_code nvarchar(50) NULL,
                        retailer_code nvarchar(50) NULL,
                        ship_to_code nvarchar(50) NULL,
                        bill_to_code nvarchar(50) NULL,
                        queue_type nvarchar(40) NOT NULL CONSTRAINT DF_parts_order_queue_type DEFAULT (N'Order'),
                        middleware_status nvarchar(80) NOT NULL CONSTRAINT DF_parts_order_middleware_status DEFAULT (N'Pending Middleware Pickup'),
                        middleware_reference_id nvarchar(80) NULL,
                        approved_by nvarchar(100) NULL,
                        approved_at_utc datetime2 NULL,
                        retry_count int NOT NULL CONSTRAINT DF_parts_order_retry_count DEFAULT (0),
                        picked_at_utc datetime2 NULL,
                        last_retry_at_utc datetime2 NULL,
                        created_at_utc datetime2 NOT NULL CONSTRAINT DF_parts_order_created DEFAULT (SYSUTCDATETIME()),
                        modified_at_utc datetime2 NULL,
                        CONSTRAINT FK_parts_order_Orders FOREIGN KEY (order_id) REFERENCES dbo.Orders (Id)
                    );
                    CREATE UNIQUE INDEX IX_parts_order_po_ref ON dbo.parts_order (po_ref);
                    CREATE UNIQUE INDEX IX_parts_order_order_id ON dbo.parts_order (order_id);
                    CREATE INDEX IX_parts_order_transfer_flag ON dbo.parts_order (transfer_flag);
                    CREATE INDEX IX_parts_order_transfer_status ON dbo.parts_order (transfer_flag, sap_transfer_status);
                END;

                IF OBJECT_ID(N'dbo.parts_Delivery_header', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.parts_Delivery_header (
                        id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_parts_Delivery_header PRIMARY KEY,
                        dealer_code nvarchar(50) NOT NULL,
                        sap_dealer_code nvarchar(50) NULL,
                        po_ref nvarchar(80) NOT NULL,
                        sap_sales_order_number nvarchar(50) NULL,
                        sap_delivery_number nvarchar(50) NULL,
                        sap_ship_to_party nvarchar(50) NULL,
                        sap_hu_number nvarchar(50) NULL,
                        sap_delivery_date datetime2 NULL,
                        transfer_flag int NOT NULL CONSTRAINT DF_parts_delivery_header_tf DEFAULT (1),
                        invoice_number nvarchar(50) NULL,
                        invoice_date datetime2 NULL,
                        inv_transfer_flag int NULL,
                        created_at_utc datetime2 NOT NULL CONSTRAINT DF_parts_delivery_header_created DEFAULT (SYSUTCDATETIME())
                    );
                    CREATE INDEX IX_parts_Delivery_header_po_ref ON dbo.parts_Delivery_header (po_ref);
                    CREATE INDEX IX_parts_Delivery_header_delivery ON dbo.parts_Delivery_header (sap_delivery_number);
                    CREATE INDEX IX_parts_Delivery_header_tf ON dbo.parts_Delivery_header (transfer_flag);
                END;

                IF OBJECT_ID(N'dbo.parts_Delivery_detail', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.parts_Delivery_detail (
                        id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_parts_Delivery_detail PRIMARY KEY,
                        dealer_code nvarchar(50) NOT NULL,
                        sap_dealer_code nvarchar(50) NULL,
                        po_ref nvarchar(80) NOT NULL,
                        sap_sales_order_number nvarchar(50) NULL,
                        sap_delivery_number nvarchar(50) NULL,
                        sap_hu_number nvarchar(50) NULL,
                        sap_material nvarchar(50) NOT NULL,
                        order_qty decimal(18,4) NULL,
                        sap_delivered_quantity decimal(18,4) NOT NULL,
                        transfer_flag int NOT NULL CONSTRAINT DF_parts_delivery_detail_tf DEFAULT (1),
                        created_at_utc datetime2 NOT NULL CONSTRAINT DF_parts_delivery_detail_created DEFAULT (SYSUTCDATETIME())
                    );
                    CREATE INDEX IX_parts_Delivery_detail_po_ref ON dbo.parts_Delivery_detail (po_ref);
                    CREATE INDEX IX_parts_Delivery_detail_po_mat ON dbo.parts_Delivery_detail (po_ref, sap_material);
                    CREATE INDEX IX_parts_Delivery_detail_tf ON dbo.parts_Delivery_detail (transfer_flag);
                END;
                """);

            migrationBuilder.Sql("""
                CREATE OR ALTER PROCEDURE dbo.usp_GetPartsOrderHeader
                    @PoRef nvarchar(80) = NULL,
                    @ReadyOnly bit = 1
                AS
                BEGIN
                    SET NOCOUNT ON;
                    SELECT
                        po.id,
                        po.transfer_flag,
                        po.sap_transfer_status,
                        po.dealer_code,
                        po.sap_dealer_code,
                        po.po_ref,
                        po.ref_type,
                        po.sap_sales_order_number,
                        po.sap_sales_order_date,
                        po.sap_bo1_no,
                        po.sap_bo2_no,
                        po.sap_message,
                        po.distributor_code,
                        po.retailer_code,
                        po.ship_to_code,
                        po.bill_to_code,
                        po.queue_type,
                        po.middleware_status,
                        po.middleware_reference_id,
                        po.retry_count,
                        po.order_id,
                        o.OrderNumber AS internal_order_number,
                        o.Status AS order_status
                    FROM dbo.parts_order po
                    INNER JOIN dbo.Orders o ON o.Id = po.order_id
                    WHERE (@PoRef IS NULL OR po.po_ref = @PoRef)
                      AND (@ReadyOnly = 0 OR po.transfer_flag = 1);
                END;
                """);

            migrationBuilder.Sql("""
                CREATE OR ALTER PROCEDURE dbo.usp_GetPartsOrderDetails
                    @PoRef nvarchar(80)
                AS
                BEGIN
                    SET NOCOUNT ON;
                    SELECT
                        po.dealer_code,
                        po.sap_dealer_code,
                        po.po_ref,
                        po.ref_type,
                        p.Sku AS sap_material,
                        oi.RequestedQuantity AS requested_qty,
                        ISNULL(oi.ApprovedQuantity, oi.RequestedQuantity) AS order_qty,
                        oi.RequestedUnit AS uom,
                        oi.UnitPrice AS unit_price
                    FROM dbo.parts_order po
                    INNER JOIN dbo.OrderItems oi ON oi.OrderId = po.order_id AND oi.IsDeleted = 0
                    INNER JOIN dbo.Products p ON p.Id = oi.ProductId
                    WHERE po.po_ref = @PoRef
                    ORDER BY oi.CreatedAtUtc;
                END;
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF OBJECT_ID(N'dbo.usp_GetPartsOrderDetails', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_GetPartsOrderDetails;
                IF OBJECT_ID(N'dbo.usp_GetPartsOrderHeader', N'P') IS NOT NULL DROP PROCEDURE dbo.usp_GetPartsOrderHeader;
                IF OBJECT_ID(N'dbo.parts_Delivery_detail', N'U') IS NOT NULL DROP TABLE dbo.parts_Delivery_detail;
                IF OBJECT_ID(N'dbo.parts_Delivery_header', N'U') IS NOT NULL DROP TABLE dbo.parts_Delivery_header;
                IF OBJECT_ID(N'dbo.parts_order', N'U') IS NOT NULL DROP TABLE dbo.parts_order;
                IF COL_LENGTH('Distributors', 'SapShipToCode') IS NOT NULL ALTER TABLE [Distributors] DROP COLUMN [SapShipToCode];
                IF COL_LENGTH('Distributors', 'SapDealerCode') IS NOT NULL ALTER TABLE [Distributors] DROP COLUMN [SapDealerCode];
                """);
        }
    }
}
