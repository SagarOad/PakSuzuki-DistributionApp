using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using PakSuzuki.Infrastructure.Persistence;

#nullable disable

namespace PakSuzuki.Infrastructure.Persistence.Migrations
{
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260902120000_AddRetailerThresholdAndMiddlewareLines")]
    public partial class AddRetailerThresholdAndMiddlewareLines : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF COL_LENGTH('Orders', 'ThresholdMet') IS NULL
                    ALTER TABLE [Orders] ADD [ThresholdMet] bit NOT NULL CONSTRAINT DF_Orders_ThresholdMet DEFAULT (0);
                IF COL_LENGTH('Orders', 'FulfillmentChoice') IS NULL
                    ALTER TABLE [Orders] ADD [FulfillmentChoice] int NULL;
                IF COL_LENGTH('Orders', 'PakSuzukiShipTo') IS NULL
                    ALTER TABLE [Orders] ADD [PakSuzukiShipTo] int NULL;
                IF COL_LENGTH('Orders', 'DistributorCode') IS NULL
                    ALTER TABLE [Orders] ADD [DistributorCode] nvarchar(50) NULL;
                IF COL_LENGTH('Orders', 'RetailerCode') IS NULL
                    ALTER TABLE [Orders] ADD [RetailerCode] nvarchar(50) NULL;
                IF COL_LENGTH('Orders', 'ShipToCode') IS NULL
                    ALTER TABLE [Orders] ADD [ShipToCode] nvarchar(50) NULL;
                IF COL_LENGTH('Orders', 'BillToCode') IS NULL
                    ALTER TABLE [Orders] ADD [BillToCode] nvarchar(50) NULL;

                IF COL_LENGTH('parts_order', 'approval_details') IS NULL
                    ALTER TABLE dbo.parts_order ADD approval_details nvarchar(500) NULL;
                IF COL_LENGTH('parts_order', 'sap_status') IS NULL
                    ALTER TABLE dbo.parts_order ADD sap_status nvarchar(80) NULL;
                IF COL_LENGTH('parts_order', 'error_details') IS NULL
                    ALTER TABLE dbo.parts_order ADD error_details nvarchar(2000) NULL;

                IF OBJECT_ID(N'dbo.parts_order_line', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.parts_order_line (
                        id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_parts_order_line PRIMARY KEY,
                        parts_order_id int NOT NULL,
                        order_item_id uniqueidentifier NULL,
                        material_code nvarchar(50) NOT NULL,
                        approved_qty decimal(18,4) NOT NULL,
                        uom nvarchar(20) NOT NULL,
                        CONSTRAINT FK_parts_order_line_header FOREIGN KEY (parts_order_id)
                            REFERENCES dbo.parts_order (id)
                    );
                    CREATE INDEX IX_parts_order_line_header ON dbo.parts_order_line (parts_order_id);
                END;

                UPDATE d
                SET SapDealerCode = ISNULL(NULLIF(LTRIM(RTRIM(d.SapDealerCode)), ''), N'D-' + d.DistributorCode),
                    SapShipToCode = ISNULL(NULLIF(LTRIM(RTRIM(d.SapShipToCode)), ''), N'ST-D-' + d.DistributorCode)
                FROM dbo.Distributors d
                WHERE d.IsDeleted = 0;

                UPDATE r
                SET SapBusinessPartnerCode = ISNULL(NULLIF(LTRIM(RTRIM(r.SapBusinessPartnerCode)), ''), N'R-' + r.RetailerCode)
                FROM dbo.Retailers r
                WHERE r.IsDeleted = 0;
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
                        po.sap_status,
                        po.error_details,
                        po.approval_details,
                        po.approved_by,
                        po.approved_at_utc,
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
                    IF EXISTS (SELECT 1 FROM dbo.parts_order_line l
                               INNER JOIN dbo.parts_order po ON po.id = l.parts_order_id
                               WHERE po.po_ref = @PoRef)
                    BEGIN
                        SELECT
                            po.dealer_code,
                            po.sap_dealer_code,
                            po.po_ref,
                            po.ref_type,
                            l.material_code AS sap_material,
                            l.approved_qty AS order_qty,
                            l.uom,
                            po.distributor_code,
                            po.retailer_code,
                            po.ship_to_code,
                            po.bill_to_code,
                            po.middleware_status,
                            po.sap_status,
                            po.error_details,
                            po.approval_details
                        FROM dbo.parts_order po
                        INNER JOIN dbo.parts_order_line l ON l.parts_order_id = po.id
                        WHERE po.po_ref = @PoRef
                        ORDER BY l.id;
                        RETURN;
                    END;

                    SELECT
                        po.dealer_code,
                        po.sap_dealer_code,
                        po.po_ref,
                        po.ref_type,
                        p.Sku AS sap_material,
                        ISNULL(oi.ApprovedQuantity, oi.RequestedQuantity) AS order_qty,
                        oi.RequestedUnit AS uom,
                        po.distributor_code,
                        po.retailer_code,
                        po.ship_to_code,
                        po.bill_to_code,
                        po.middleware_status,
                        po.sap_status,
                        po.error_details,
                        po.approval_details
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
                IF OBJECT_ID(N'dbo.parts_order_line', N'U') IS NOT NULL DROP TABLE dbo.parts_order_line;
                IF COL_LENGTH('parts_order', 'approval_details') IS NOT NULL ALTER TABLE dbo.parts_order DROP COLUMN approval_details;
                IF COL_LENGTH('parts_order', 'sap_status') IS NOT NULL ALTER TABLE dbo.parts_order DROP COLUMN sap_status;
                IF COL_LENGTH('parts_order', 'error_details') IS NOT NULL ALTER TABLE dbo.parts_order DROP COLUMN error_details;
                IF COL_LENGTH('Orders', 'ThresholdMet') IS NOT NULL ALTER TABLE [Orders] DROP COLUMN [ThresholdMet];
                IF COL_LENGTH('Orders', 'FulfillmentChoice') IS NOT NULL ALTER TABLE [Orders] DROP COLUMN [FulfillmentChoice];
                IF COL_LENGTH('Orders', 'PakSuzukiShipTo') IS NOT NULL ALTER TABLE [Orders] DROP COLUMN [PakSuzukiShipTo];
                IF COL_LENGTH('Orders', 'DistributorCode') IS NOT NULL ALTER TABLE [Orders] DROP COLUMN [DistributorCode];
                IF COL_LENGTH('Orders', 'RetailerCode') IS NOT NULL ALTER TABLE [Orders] DROP COLUMN [RetailerCode];
                IF COL_LENGTH('Orders', 'ShipToCode') IS NOT NULL ALTER TABLE [Orders] DROP COLUMN [ShipToCode];
                IF COL_LENGTH('Orders', 'BillToCode') IS NOT NULL ALTER TABLE [Orders] DROP COLUMN [BillToCode];
                """);
        }
    }
}
