-- Run on production DB (distribution) if /api/products returns 500
-- due to missing shop columns/tables. Safe to re-run.

IF COL_LENGTH('Products', 'Bio') IS NULL
    ALTER TABLE [Products] ADD [Bio] nvarchar(500) NULL;
IF COL_LENGTH('Products', 'CategoryName') IS NULL
    ALTER TABLE [Products] ADD [CategoryName] nvarchar(100) NULL;
IF COL_LENGTH('Products', 'PrimaryImageUrl') IS NULL
    ALTER TABLE [Products] ADD [PrimaryImageUrl] nvarchar(1000) NULL;
IF COL_LENGTH('Products', 'IsPublished') IS NULL
    ALTER TABLE [Products] ADD [IsPublished] bit NOT NULL CONSTRAINT DF_Products_IsPublished DEFAULT(0);
IF COL_LENGTH('Products', 'InStock') IS NULL
    ALTER TABLE [Products] ADD [InStock] bit NOT NULL CONSTRAINT DF_Products_InStock DEFAULT(1);

IF COL_LENGTH('OrderItems', 'ProductVariantId') IS NULL
    ALTER TABLE [OrderItems] ADD [ProductVariantId] uniqueidentifier NULL;
IF COL_LENGTH('OrderItems', 'VariantTypeName') IS NULL
    ALTER TABLE [OrderItems] ADD [VariantTypeName] nvarchar(100) NULL;

IF OBJECT_ID(N'[ProductVariants]', N'U') IS NULL
BEGIN
    CREATE TABLE [ProductVariants] (
        [Id] uniqueidentifier NOT NULL,
        [ProductId] uniqueidentifier NOT NULL,
        [TypeName] nvarchar(100) NOT NULL,
        [UnitQuantity] decimal(18,2) NOT NULL,
        [RetailPrice] decimal(18,2) NOT NULL,
        [DistributorPrice] decimal(18,2) NOT NULL,
        [CostPrice] decimal(18,2) NOT NULL,
        [GstPercent] decimal(5,2) NOT NULL,
        [FedPercent] decimal(5,2) NOT NULL,
        [WhtPercent] decimal(5,2) NOT NULL,
        [ProfitAmount] decimal(18,2) NOT NULL,
        [InStock] bit NOT NULL,
        [IsPublished] bit NOT NULL,
        [SortOrder] int NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        [CreatedBy] nvarchar(max) NULL,
        [ModifiedAtUtc] datetime2 NULL,
        [ModifiedBy] nvarchar(max) NULL,
        [IsDeleted] bit NOT NULL,
        [DeletedAtUtc] datetime2 NULL,
        [DeletedBy] nvarchar(max) NULL,
        CONSTRAINT [PK_ProductVariants] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_ProductVariants_Products_ProductId] FOREIGN KEY ([ProductId]) REFERENCES [Products]([Id]) ON DELETE CASCADE
    );
    CREATE INDEX [IX_ProductVariants_ProductId] ON [ProductVariants]([ProductId]);
END
GO
