using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using PakSuzuki.Infrastructure.Persistence;

#nullable disable

namespace PakSuzuki.Infrastructure.Persistence.Migrations
{
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260907120000_AddIncentiveSchemesAndProductGroups")]
    public partial class AddIncentiveSchemesAndProductGroups : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF OBJECT_ID(N'dbo.ProductGroups', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.ProductGroups (
                        Id uniqueidentifier NOT NULL CONSTRAINT PK_ProductGroups PRIMARY KEY,
                        Name nvarchar(200) NOT NULL,
                        Description nvarchar(1000) NULL,
                        IsActive bit NOT NULL CONSTRAINT DF_ProductGroups_IsActive DEFAULT (1),
                        CreatedAtUtc datetime2 NOT NULL,
                        CreatedBy nvarchar(max) NULL,
                        ModifiedAtUtc datetime2 NULL,
                        ModifiedBy nvarchar(max) NULL,
                        IsDeleted bit NOT NULL CONSTRAINT DF_ProductGroups_IsDeleted DEFAULT (0),
                        DeletedAtUtc datetime2 NULL,
                        DeletedBy nvarchar(max) NULL
                    );
                    CREATE INDEX IX_ProductGroups_Name ON dbo.ProductGroups (Name);
                END

                IF OBJECT_ID(N'dbo.ProductGroupMembers', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.ProductGroupMembers (
                        Id uniqueidentifier NOT NULL CONSTRAINT PK_ProductGroupMembers PRIMARY KEY,
                        ProductGroupId uniqueidentifier NOT NULL,
                        ProductId uniqueidentifier NOT NULL,
                        PartItemNo nvarchar(50) NOT NULL,
                        CreatedAtUtc datetime2 NOT NULL,
                        CreatedBy nvarchar(max) NULL,
                        ModifiedAtUtc datetime2 NULL,
                        ModifiedBy nvarchar(max) NULL,
                        IsDeleted bit NOT NULL CONSTRAINT DF_ProductGroupMembers_IsDeleted DEFAULT (0),
                        DeletedAtUtc datetime2 NULL,
                        DeletedBy nvarchar(max) NULL,
                        CONSTRAINT FK_ProductGroupMembers_ProductGroups FOREIGN KEY (ProductGroupId)
                            REFERENCES dbo.ProductGroups (Id) ON DELETE CASCADE,
                        CONSTRAINT FK_ProductGroupMembers_Products FOREIGN KEY (ProductId)
                            REFERENCES dbo.Products (Id)
                    );
                    CREATE UNIQUE INDEX IX_ProductGroupMembers_Group_Product
                        ON dbo.ProductGroupMembers (ProductGroupId, ProductId);
                END

                IF OBJECT_ID(N'dbo.IncentiveSchemes', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.IncentiveSchemes (
                        Id uniqueidentifier NOT NULL CONSTRAINT PK_IncentiveSchemes PRIMARY KEY,
                        Name nvarchar(200) NOT NULL,
                        Description nvarchar(1000) NULL,
                        ProductGroupId uniqueidentifier NOT NULL,
                        SchemeType nvarchar(40) NOT NULL,
                        CurrentPeriodStartUtc datetime2 NOT NULL,
                        CurrentPeriodEndUtc datetime2 NOT NULL,
                        BaselinePeriodStartUtc datetime2 NULL,
                        BaselinePeriodEndUtc datetime2 NULL,
                        PercentOfSalesRate decimal(18,6) NULL,
                        IsActive bit NOT NULL CONSTRAINT DF_IncentiveSchemes_IsActive DEFAULT (1),
                        CreatedAtUtc datetime2 NOT NULL,
                        CreatedBy nvarchar(max) NULL,
                        ModifiedAtUtc datetime2 NULL,
                        ModifiedBy nvarchar(max) NULL,
                        IsDeleted bit NOT NULL CONSTRAINT DF_IncentiveSchemes_IsDeleted DEFAULT (0),
                        DeletedAtUtc datetime2 NULL,
                        DeletedBy nvarchar(max) NULL,
                        CONSTRAINT FK_IncentiveSchemes_ProductGroups FOREIGN KEY (ProductGroupId)
                            REFERENCES dbo.ProductGroups (Id)
                    );
                    CREATE INDEX IX_IncentiveSchemes_Name ON dbo.IncentiveSchemes (Name);
                    CREATE INDEX IX_IncentiveSchemes_ProductGroupId ON dbo.IncentiveSchemes (ProductGroupId);
                END

                IF OBJECT_ID(N'dbo.IncentiveSchemeSlabs', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.IncentiveSchemeSlabs (
                        Id uniqueidentifier NOT NULL CONSTRAINT PK_IncentiveSchemeSlabs PRIMARY KEY,
                        IncentiveSchemeId uniqueidentifier NOT NULL,
                        TargetLiters decimal(18,4) NOT NULL,
                        RatePerLiter decimal(18,4) NOT NULL,
                        FixedBonusPkr decimal(18,2) NOT NULL,
                        SortOrder int NOT NULL,
                        CreatedAtUtc datetime2 NOT NULL,
                        CreatedBy nvarchar(max) NULL,
                        ModifiedAtUtc datetime2 NULL,
                        ModifiedBy nvarchar(max) NULL,
                        IsDeleted bit NOT NULL CONSTRAINT DF_IncentiveSchemeSlabs_IsDeleted DEFAULT (0),
                        DeletedAtUtc datetime2 NULL,
                        DeletedBy nvarchar(max) NULL,
                        CONSTRAINT FK_IncentiveSchemeSlabs_Schemes FOREIGN KEY (IncentiveSchemeId)
                            REFERENCES dbo.IncentiveSchemes (Id) ON DELETE CASCADE
                    );
                    CREATE INDEX IX_IncentiveSchemeSlabs_Scheme_Sort
                        ON dbo.IncentiveSchemeSlabs (IncentiveSchemeId, SortOrder);
                END
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF OBJECT_ID(N'dbo.IncentiveSchemeSlabs', N'U') IS NOT NULL DROP TABLE dbo.IncentiveSchemeSlabs;
                IF OBJECT_ID(N'dbo.IncentiveSchemes', N'U') IS NOT NULL DROP TABLE dbo.IncentiveSchemes;
                IF OBJECT_ID(N'dbo.ProductGroupMembers', N'U') IS NOT NULL DROP TABLE dbo.ProductGroupMembers;
                IF OBJECT_ID(N'dbo.ProductGroups', N'U') IS NOT NULL DROP TABLE dbo.ProductGroups;
                """);
        }
    }
}
