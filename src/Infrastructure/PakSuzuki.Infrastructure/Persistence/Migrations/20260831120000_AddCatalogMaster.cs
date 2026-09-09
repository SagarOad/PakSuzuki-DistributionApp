using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using PakSuzuki.Infrastructure.Persistence;

#nullable disable

namespace PakSuzuki.Infrastructure.Persistence.Migrations;

[DbContext(typeof(ApplicationDbContext))]
[Migration("20260831120000_AddCatalogMaster")]
public partial class AddCatalogMaster : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'[CatalogProductTypes]', N'U') IS NULL
            BEGIN
                CREATE TABLE [CatalogProductTypes] (
                    [Id] uniqueidentifier NOT NULL,
                    [Code] nvarchar(40) NOT NULL,
                    [Name] nvarchar(80) NOT NULL,
                    [IsReady] bit NOT NULL,
                    [NotReadyMessage] nvarchar(400) NULL,
                    [SortOrder] int NOT NULL,
                    [IsActive] bit NOT NULL,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    [CreatedBy] nvarchar(max) NULL,
                    [ModifiedAtUtc] datetime2 NULL,
                    [ModifiedBy] nvarchar(max) NULL,
                    [IsDeleted] bit NOT NULL,
                    [DeletedAtUtc] datetime2 NULL,
                    [DeletedBy] nvarchar(max) NULL,
                    CONSTRAINT [PK_CatalogProductTypes] PRIMARY KEY ([Id])
                );
                CREATE UNIQUE INDEX [IX_CatalogProductTypes_Code] ON [CatalogProductTypes]([Code]);
            END

            IF OBJECT_ID(N'[CatalogCategories]', N'U') IS NULL
            BEGIN
                CREATE TABLE [CatalogCategories] (
                    [Id] uniqueidentifier NOT NULL,
                    [ProductTypeId] uniqueidentifier NOT NULL,
                    [Code] nvarchar(40) NOT NULL,
                    [Name] nvarchar(80) NOT NULL,
                    [FormProfileJson] nvarchar(max) NOT NULL,
                    [OrderUnit] nvarchar(20) NOT NULL,
                    [DefaultFedApplicable] bit NOT NULL,
                    [GstInvoiceTypeCode] nvarchar(20) NULL,
                    [SortOrder] int NOT NULL,
                    [IsReady] bit NOT NULL,
                    [NotReadyMessage] nvarchar(400) NULL,
                    [IsActive] bit NOT NULL,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    [CreatedBy] nvarchar(max) NULL,
                    [ModifiedAtUtc] datetime2 NULL,
                    [ModifiedBy] nvarchar(max) NULL,
                    [IsDeleted] bit NOT NULL,
                    [DeletedAtUtc] datetime2 NULL,
                    [DeletedBy] nvarchar(max) NULL,
                    CONSTRAINT [PK_CatalogCategories] PRIMARY KEY ([Id]),
                    CONSTRAINT [FK_CatalogCategories_CatalogProductTypes] FOREIGN KEY ([ProductTypeId]) REFERENCES [CatalogProductTypes]([Id])
                );
                CREATE UNIQUE INDEX [IX_CatalogCategories_ProductTypeId_Code] ON [CatalogCategories]([ProductTypeId], [Code]);
            END

            IF OBJECT_ID(N'[CatalogPTypes]', N'U') IS NULL
            BEGIN
                CREATE TABLE [CatalogPTypes] (
                    [Id] uniqueidentifier NOT NULL,
                    [Code] nvarchar(8) NOT NULL,
                    [DeliveryType] nvarchar(80) NOT NULL,
                    [SgoFlag] bit NOT NULL,
                    [SourceScopeJson] nvarchar(200) NOT NULL,
                    [CategoryId] uniqueidentifier NULL,
                    [SortOrder] int NOT NULL,
                    [IsActive] bit NOT NULL,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    [CreatedBy] nvarchar(max) NULL,
                    [ModifiedAtUtc] datetime2 NULL,
                    [ModifiedBy] nvarchar(max) NULL,
                    [IsDeleted] bit NOT NULL,
                    [DeletedAtUtc] datetime2 NULL,
                    [DeletedBy] nvarchar(max) NULL,
                    CONSTRAINT [PK_CatalogPTypes] PRIMARY KEY ([Id]),
                    CONSTRAINT [FK_CatalogPTypes_CatalogCategories] FOREIGN KEY ([CategoryId]) REFERENCES [CatalogCategories]([Id]) ON DELETE SET NULL
                );
                CREATE UNIQUE INDEX [IX_CatalogPTypes_Code] ON [CatalogPTypes]([Code]);
            END

            IF OBJECT_ID(N'[CatalogSuppliers]', N'U') IS NULL
            BEGIN
                CREATE TABLE [CatalogSuppliers] (
                    [Id] uniqueidentifier NOT NULL,
                    [Code] nvarchar(20) NOT NULL,
                    [Name] nvarchar(120) NOT NULL,
                    [SortOrder] int NOT NULL,
                    [IsActive] bit NOT NULL,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    [CreatedBy] nvarchar(max) NULL,
                    [ModifiedAtUtc] datetime2 NULL,
                    [ModifiedBy] nvarchar(max) NULL,
                    [IsDeleted] bit NOT NULL,
                    [DeletedAtUtc] datetime2 NULL,
                    [DeletedBy] nvarchar(max) NULL,
                    CONSTRAINT [PK_CatalogSuppliers] PRIMARY KEY ([Id])
                );
                CREATE UNIQUE INDEX [IX_CatalogSuppliers_Code] ON [CatalogSuppliers]([Code]);
            END

            IF OBJECT_ID(N'[CatalogSources]', N'U') IS NULL
            BEGIN
                CREATE TABLE [CatalogSources] (
                    [Id] uniqueidentifier NOT NULL,
                    [Code] nvarchar(20) NOT NULL,
                    [Name] nvarchar(40) NOT NULL,
                    [SortOrder] int NOT NULL,
                    [IsActive] bit NOT NULL,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    [CreatedBy] nvarchar(max) NULL,
                    [ModifiedAtUtc] datetime2 NULL,
                    [ModifiedBy] nvarchar(max) NULL,
                    [IsDeleted] bit NOT NULL,
                    [DeletedAtUtc] datetime2 NULL,
                    [DeletedBy] nvarchar(max) NULL,
                    CONSTRAINT [PK_CatalogSources] PRIMARY KEY ([Id])
                );
                CREATE UNIQUE INDEX [IX_CatalogSources_Code] ON [CatalogSources]([Code]);
            END

            IF OBJECT_ID(N'[CatalogGstInvoiceTypes]', N'U') IS NULL
            BEGIN
                CREATE TABLE [CatalogGstInvoiceTypes] (
                    [Id] uniqueidentifier NOT NULL,
                    [Code] nvarchar(20) NOT NULL,
                    [Name] nvarchar(160) NOT NULL,
                    [IsActive] bit NOT NULL,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    [CreatedBy] nvarchar(max) NULL,
                    [ModifiedAtUtc] datetime2 NULL,
                    [ModifiedBy] nvarchar(max) NULL,
                    [IsDeleted] bit NOT NULL,
                    [DeletedAtUtc] datetime2 NULL,
                    [DeletedBy] nvarchar(max) NULL,
                    CONSTRAINT [PK_CatalogGstInvoiceTypes] PRIMARY KEY ([Id])
                );
                CREATE UNIQUE INDEX [IX_CatalogGstInvoiceTypes_Code] ON [CatalogGstInvoiceTypes]([Code]);
            END

            IF OBJECT_ID(N'[CatalogSupplierRules]', N'U') IS NULL
            BEGIN
                CREATE TABLE [CatalogSupplierRules] (
                    [Id] uniqueidentifier NOT NULL,
                    [SourceCode] nvarchar(20) NULL,
                    [PTypeCode] nvarchar(8) NULL,
                    [ModelCode] nvarchar(40) NULL,
                    [SupplierCode] nvarchar(20) NOT NULL,
                    [Priority] int NOT NULL,
                    [IsActive] bit NOT NULL,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    [CreatedBy] nvarchar(max) NULL,
                    [ModifiedAtUtc] datetime2 NULL,
                    [ModifiedBy] nvarchar(max) NULL,
                    [IsDeleted] bit NOT NULL,
                    [DeletedAtUtc] datetime2 NULL,
                    [DeletedBy] nvarchar(max) NULL,
                    CONSTRAINT [PK_CatalogSupplierRules] PRIMARY KEY ([Id])
                );
                CREATE INDEX [IX_CatalogSupplierRules_Lookup] ON [CatalogSupplierRules]([PTypeCode], [SourceCode], [ModelCode], [Priority]);
            END

            IF OBJECT_ID(N'[TaxRules]', N'U') IS NULL
            BEGIN
                CREATE TABLE [TaxRules] (
                    [Id] uniqueidentifier NOT NULL,
                    [Code] nvarchar(40) NOT NULL,
                    [Rate] decimal(12,6) NOT NULL,
                    [AppliesTo] nvarchar(200) NOT NULL,
                    [EffectiveFromUtc] datetime2 NULL,
                    [EffectiveToUtc] datetime2 NULL,
                    [IsActive] bit NOT NULL,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    [CreatedBy] nvarchar(max) NULL,
                    [ModifiedAtUtc] datetime2 NULL,
                    [ModifiedBy] nvarchar(max) NULL,
                    [IsDeleted] bit NOT NULL,
                    [DeletedAtUtc] datetime2 NULL,
                    [DeletedBy] nvarchar(max) NULL,
                    CONSTRAINT [PK_TaxRules] PRIMARY KEY ([Id])
                );
                CREATE UNIQUE INDEX [IX_TaxRules_Code] ON [TaxRules]([Code]);
            END

            IF OBJECT_ID(N'[DeliveryApprovalThresholds]', N'U') IS NULL
            BEGIN
                CREATE TABLE [DeliveryApprovalThresholds] (
                    [Id] uniqueidentifier NOT NULL,
                    [CategoryId] uniqueidentifier NOT NULL,
                    [DistributorId] uniqueidentifier NULL,
                    [Unit] nvarchar(20) NOT NULL,
                    [QuantityThreshold] decimal(18,2) NOT NULL,
                    [ApproverRoles] nvarchar(200) NOT NULL,
                    [IsActive] bit NOT NULL,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    [CreatedBy] nvarchar(max) NULL,
                    [ModifiedAtUtc] datetime2 NULL,
                    [ModifiedBy] nvarchar(max) NULL,
                    [IsDeleted] bit NOT NULL,
                    [DeletedAtUtc] datetime2 NULL,
                    [DeletedBy] nvarchar(max) NULL,
                    CONSTRAINT [PK_DeliveryApprovalThresholds] PRIMARY KEY ([Id]),
                    CONSTRAINT [FK_DeliveryApprovalThresholds_Categories] FOREIGN KEY ([CategoryId]) REFERENCES [CatalogCategories]([Id])
                );
                CREATE UNIQUE INDEX [IX_DeliveryApprovalThresholds_Category_Distributor]
                    ON [DeliveryApprovalThresholds]([CategoryId], [DistributorId])
                    WHERE [DistributorId] IS NOT NULL;
                CREATE UNIQUE INDEX [IX_DeliveryApprovalThresholds_Category_Default]
                    ON [DeliveryApprovalThresholds]([CategoryId])
                    WHERE [DistributorId] IS NULL;
            END

            IF OBJECT_ID(N'[PriceVisibilityRules]', N'U') IS NULL
            BEGIN
                CREATE TABLE [PriceVisibilityRules] (
                    [Id] uniqueidentifier NOT NULL,
                    [Role] nvarchar(40) NOT NULL,
                    [CanSeeCost] bit NOT NULL,
                    [CanSeePurchase] bit NOT NULL,
                    [CanSeeSale] bit NOT NULL,
                    [IsActive] bit NOT NULL,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    [CreatedBy] nvarchar(max) NULL,
                    [ModifiedAtUtc] datetime2 NULL,
                    [ModifiedBy] nvarchar(max) NULL,
                    [IsDeleted] bit NOT NULL,
                    [DeletedAtUtc] datetime2 NULL,
                    [DeletedBy] nvarchar(max) NULL,
                    CONSTRAINT [PK_PriceVisibilityRules] PRIMARY KEY ([Id])
                );
                CREATE UNIQUE INDEX [IX_PriceVisibilityRules_Role] ON [PriceVisibilityRules]([Role]);
            END

            IF OBJECT_ID(N'[ProductCatalogProfiles]', N'U') IS NULL
            BEGIN
                CREATE TABLE [ProductCatalogProfiles] (
                    [Id] uniqueidentifier NOT NULL,
                    [ProductId] uniqueidentifier NOT NULL,
                    [ProductTypeId] uniqueidentifier NOT NULL,
                    [CategoryId] uniqueidentifier NOT NULL,
                    [PTypeId] uniqueidentifier NOT NULL,
                    [Viscosity] nvarchar(40) NULL,
                    [ApiStandard] nvarchar(20) NULL,
                    [ModelCode] nvarchar(40) NULL,
                    [SourceCode] nvarchar(20) NOT NULL,
                    [SgoFlag] bit NOT NULL,
                    [SupplierCode] nvarchar(20) NOT NULL,
                    [UnitValue] decimal(18,4) NOT NULL,
                    [UnitType] nvarchar(20) NOT NULL,
                    [PackQuantity] int NOT NULL,
                    [SalePriceExclTaxes] decimal(18,2) NOT NULL,
                    [FedApplicable] bit NOT NULL,
                    [Discontinued] bit NOT NULL,
                    [ApplyDate] datetime2 NULL,
                    [RpdcFlag] bit NOT NULL,
                    [Accessory] nvarchar(8) NULL,
                    [ExtraAttributesJson] nvarchar(max) NULL,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    [CreatedBy] nvarchar(max) NULL,
                    [ModifiedAtUtc] datetime2 NULL,
                    [ModifiedBy] nvarchar(max) NULL,
                    [IsDeleted] bit NOT NULL,
                    [DeletedAtUtc] datetime2 NULL,
                    [DeletedBy] nvarchar(max) NULL,
                    CONSTRAINT [PK_ProductCatalogProfiles] PRIMARY KEY ([Id]),
                    CONSTRAINT [FK_ProductCatalogProfiles_Products] FOREIGN KEY ([ProductId]) REFERENCES [Products]([Id]) ON DELETE CASCADE,
                    CONSTRAINT [FK_ProductCatalogProfiles_Types] FOREIGN KEY ([ProductTypeId]) REFERENCES [CatalogProductTypes]([Id]),
                    CONSTRAINT [FK_ProductCatalogProfiles_Categories] FOREIGN KEY ([CategoryId]) REFERENCES [CatalogCategories]([Id]),
                    CONSTRAINT [FK_ProductCatalogProfiles_PTypes] FOREIGN KEY ([PTypeId]) REFERENCES [CatalogPTypes]([Id])
                );
                CREATE UNIQUE INDEX [IX_ProductCatalogProfiles_ProductId] ON [ProductCatalogProfiles]([ProductId]);
            END
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'[ProductCatalogProfiles]', N'U') IS NOT NULL DROP TABLE [ProductCatalogProfiles];
            IF OBJECT_ID(N'[DeliveryApprovalThresholds]', N'U') IS NOT NULL DROP TABLE [DeliveryApprovalThresholds];
            IF OBJECT_ID(N'[PriceVisibilityRules]', N'U') IS NOT NULL DROP TABLE [PriceVisibilityRules];
            IF OBJECT_ID(N'[TaxRules]', N'U') IS NOT NULL DROP TABLE [TaxRules];
            IF OBJECT_ID(N'[CatalogSupplierRules]', N'U') IS NOT NULL DROP TABLE [CatalogSupplierRules];
            IF OBJECT_ID(N'[CatalogGstInvoiceTypes]', N'U') IS NOT NULL DROP TABLE [CatalogGstInvoiceTypes];
            IF OBJECT_ID(N'[CatalogSources]', N'U') IS NOT NULL DROP TABLE [CatalogSources];
            IF OBJECT_ID(N'[CatalogSuppliers]', N'U') IS NOT NULL DROP TABLE [CatalogSuppliers];
            IF OBJECT_ID(N'[CatalogPTypes]', N'U') IS NOT NULL DROP TABLE [CatalogPTypes];
            IF OBJECT_ID(N'[CatalogCategories]', N'U') IS NOT NULL DROP TABLE [CatalogCategories];
            IF OBJECT_ID(N'[CatalogProductTypes]', N'U') IS NOT NULL DROP TABLE [CatalogProductTypes];
            """);
    }
}
