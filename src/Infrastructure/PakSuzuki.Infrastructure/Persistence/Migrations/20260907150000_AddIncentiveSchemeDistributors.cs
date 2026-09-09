using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using PakSuzuki.Infrastructure.Persistence;

#nullable disable

namespace PakSuzuki.Infrastructure.Persistence.Migrations;

[DbContext(typeof(ApplicationDbContext))]
[Migration("20260907150000_AddIncentiveSchemeDistributors")]
public partial class AddIncentiveSchemeDistributors : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'dbo.IncentiveSchemeDistributors', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.IncentiveSchemeDistributors (
                    Id uniqueidentifier NOT NULL CONSTRAINT PK_IncentiveSchemeDistributors PRIMARY KEY,
                    IncentiveSchemeId uniqueidentifier NOT NULL,
                    DistributorId uniqueidentifier NOT NULL,
                    CreatedAtUtc datetime2 NOT NULL,
                    CreatedBy nvarchar(max) NULL,
                    ModifiedAtUtc datetime2 NULL,
                    ModifiedBy nvarchar(max) NULL,
                    IsDeleted bit NOT NULL CONSTRAINT DF_IncentiveSchemeDistributors_IsDeleted DEFAULT (0),
                    DeletedAtUtc datetime2 NULL,
                    DeletedBy nvarchar(max) NULL,
                    CONSTRAINT FK_IncentiveSchemeDistributors_Schemes FOREIGN KEY (IncentiveSchemeId)
                        REFERENCES dbo.IncentiveSchemes (Id) ON DELETE CASCADE,
                    CONSTRAINT FK_IncentiveSchemeDistributors_Distributors FOREIGN KEY (DistributorId)
                        REFERENCES dbo.Distributors (Id) ON DELETE NO ACTION
                );
                CREATE UNIQUE INDEX IX_IncentiveSchemeDistributors_Scheme_Distributor
                    ON dbo.IncentiveSchemeDistributors (IncentiveSchemeId, DistributorId);
            END
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'dbo.IncentiveSchemeDistributors', N'U') IS NOT NULL
                DROP TABLE dbo.IncentiveSchemeDistributors;
            """);
    }
}
