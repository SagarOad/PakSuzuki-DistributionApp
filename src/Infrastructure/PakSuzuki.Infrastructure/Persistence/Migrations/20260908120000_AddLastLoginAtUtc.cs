using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using PakSuzuki.Infrastructure.Persistence;

#nullable disable

namespace PakSuzuki.Infrastructure.Persistence.Migrations;

[DbContext(typeof(ApplicationDbContext))]
[Migration("20260908120000_AddLastLoginAtUtc")]
public partial class AddLastLoginAtUtc : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH(N'dbo.AspNetUsers', N'LastLoginAtUtc') IS NULL
            BEGIN
                ALTER TABLE dbo.AspNetUsers ADD LastLoginAtUtc datetime2 NULL;
            END
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF COL_LENGTH(N'dbo.AspNetUsers', N'LastLoginAtUtc') IS NOT NULL
                ALTER TABLE dbo.AspNetUsers DROP COLUMN LastLoginAtUtc;
            """);
    }
}
