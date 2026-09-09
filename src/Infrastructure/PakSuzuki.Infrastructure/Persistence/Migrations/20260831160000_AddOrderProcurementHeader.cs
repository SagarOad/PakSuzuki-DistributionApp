using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using PakSuzuki.Infrastructure.Persistence;

#nullable disable

namespace PakSuzuki.Infrastructure.Persistence.Migrations;

[DbContext(typeof(ApplicationDbContext))]
[Migration("20260831160000_AddOrderProcurementHeader")]
public partial class AddOrderProcurementHeader : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH('Orders', 'VendorCode') IS NULL
                ALTER TABLE [Orders] ADD [VendorCode] nvarchar(20) NULL;
            IF COL_LENGTH('Orders', 'MaterialSourceCode') IS NULL
                ALTER TABLE [Orders] ADD [MaterialSourceCode] nvarchar(20) NULL;
            IF COL_LENGTH('Orders', 'DeliveryTypeCode') IS NULL
                ALTER TABLE [Orders] ADD [DeliveryTypeCode] nvarchar(8) NULL;
            IF COL_LENGTH('Orders', 'DeliveryTypeName') IS NULL
                ALTER TABLE [Orders] ADD [DeliveryTypeName] nvarchar(80) NULL;
            IF COL_LENGTH('Orders', 'SupplierCode') IS NULL
                ALTER TABLE [Orders] ADD [SupplierCode] nvarchar(20) NULL;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH('Orders', 'VendorCode') IS NOT NULL ALTER TABLE [Orders] DROP COLUMN [VendorCode];
            IF COL_LENGTH('Orders', 'MaterialSourceCode') IS NOT NULL ALTER TABLE [Orders] DROP COLUMN [MaterialSourceCode];
            IF COL_LENGTH('Orders', 'DeliveryTypeCode') IS NOT NULL ALTER TABLE [Orders] DROP COLUMN [DeliveryTypeCode];
            IF COL_LENGTH('Orders', 'DeliveryTypeName') IS NOT NULL ALTER TABLE [Orders] DROP COLUMN [DeliveryTypeName];
            IF COL_LENGTH('Orders', 'SupplierCode') IS NOT NULL ALTER TABLE [Orders] DROP COLUMN [SupplierCode];
            """);
    }
}
