using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using PakSuzuki.Infrastructure.Persistence;

#nullable disable

namespace PakSuzuki.Infrastructure.Persistence.Migrations
{
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260903120000_AddOrderRetailerRemarks")]
    public partial class AddOrderRetailerRemarks : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF COL_LENGTH('Orders', 'RetailerRemarks') IS NULL
                    ALTER TABLE [Orders] ADD [RetailerRemarks] nvarchar(2000) NULL;
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF COL_LENGTH('Orders', 'RetailerRemarks') IS NOT NULL
                    ALTER TABLE [Orders] DROP COLUMN [RetailerRemarks];
                """);
        }
    }
}
