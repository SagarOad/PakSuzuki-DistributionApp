using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using PakSuzuki.Infrastructure.Persistence;

#nullable disable

namespace PakSuzuki.Infrastructure.Persistence.Migrations
{
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260811120000_AddProfileImageUrl")]
    public partial class AddProfileImageUrl : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Idempotent — safe if column was already added manually / hardening SQL.
            migrationBuilder.Sql("""
                IF COL_LENGTH('Distributors', 'ProfileImageUrl') IS NULL
                    ALTER TABLE [Distributors] ADD [ProfileImageUrl] nvarchar(500) NULL;
                IF COL_LENGTH('Retailers', 'ProfileImageUrl') IS NULL
                    ALTER TABLE [Retailers] ADD [ProfileImageUrl] nvarchar(500) NULL;
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF COL_LENGTH('Distributors', 'ProfileImageUrl') IS NOT NULL
                    ALTER TABLE [Distributors] DROP COLUMN [ProfileImageUrl];
                IF COL_LENGTH('Retailers', 'ProfileImageUrl') IS NOT NULL
                    ALTER TABLE [Retailers] DROP COLUMN [ProfileImageUrl];
                """);
        }
    }
}
