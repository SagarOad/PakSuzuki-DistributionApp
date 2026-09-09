using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using PakSuzuki.Infrastructure.Persistence;

#nullable disable

namespace PakSuzuki.Infrastructure.Persistence.Migrations;

[DbContext(typeof(ApplicationDbContext))]
[Migration("20260907140000_RemoveIncentiveSchemeBaseline")]
public partial class RemoveIncentiveSchemeBaseline : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH('dbo.IncentiveSchemes', 'BaselinePeriodStartUtc') IS NOT NULL
                ALTER TABLE dbo.IncentiveSchemes DROP COLUMN BaselinePeriodStartUtc;
            IF COL_LENGTH('dbo.IncentiveSchemes', 'BaselinePeriodEndUtc') IS NOT NULL
                ALTER TABLE dbo.IncentiveSchemes DROP COLUMN BaselinePeriodEndUtc;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH('dbo.IncentiveSchemes', 'BaselinePeriodStartUtc') IS NULL
                ALTER TABLE dbo.IncentiveSchemes ADD BaselinePeriodStartUtc datetime2 NULL;
            IF COL_LENGTH('dbo.IncentiveSchemes', 'BaselinePeriodEndUtc') IS NULL
                ALTER TABLE dbo.IncentiveSchemes ADD BaselinePeriodEndUtc datetime2 NULL;
            """);
    }
}
