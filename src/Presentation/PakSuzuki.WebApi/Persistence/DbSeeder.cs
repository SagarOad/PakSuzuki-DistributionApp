using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage;
using PakSuzuki.Domain.Entities;
using PakSuzuki.Domain.Enums;
using PakSuzuki.Infrastructure.Identity;
using PakSuzuki.Infrastructure.Persistence;

namespace PakSuzuki.WebApi.Persistence;

// Roles, SuperAdmin, regions. Regions must exist before distributor registration.
public static class DbSeeder
{
    public static readonly Guid RegionKarachiId = Guid.Parse("11111111-1111-1111-1111-111111111101");
    public static readonly Guid RegionLahoreId = Guid.Parse("11111111-1111-1111-1111-111111111102");
    public static readonly Guid RegionIslamabadId = Guid.Parse("11111111-1111-1111-1111-111111111103");
    public static readonly Guid RegionMultanId = Guid.Parse("11111111-1111-1111-1111-111111111104");
    public static readonly Guid RegionFaisalabadId = Guid.Parse("11111111-1111-1111-1111-111111111105");
    public static readonly Guid RegionPeshawarId = Guid.Parse("11111111-1111-1111-1111-111111111106");
    public static readonly Guid RegionQuettaId = Guid.Parse("11111111-1111-1111-1111-111111111107");

    public static async Task SeedAsync(IServiceProvider services)
    {
        var roleManager = services.GetRequiredService<RoleManager<ApplicationRole>>();
        var userManager = services.GetRequiredService<UserManager<ApplicationUser>>();
        var context = services.GetRequiredService<ApplicationDbContext>();

        var dbName = context.Database.GetDbConnection().Database;
        var creator = context.Database.GetService<IRelationalDatabaseCreator>();

        // IIS app-pool almost never has CREATE DATABASE rights. Create empty DB in SSMS once.
        if (!await creator.ExistsAsync())
        {
            throw new InvalidOperationException(
                $"Database '{dbName}' does not exist. " +
                $"In SSMS (run as admin), execute: CREATE DATABASE [{dbName}]; " +
                "Then give the IIS app pool login access to that database (db_owner), recycle the app pool. " +
                "This app only creates tables via migrations — it will not create the database under IIS.");
        }

        await context.Database.MigrateAsync();

        // Hardening: older production DBs sometimes missed columns/tables after a partial
        // deploy. Missing Product.CategoryName / ProductVariants / OrderItems.VariantTypeName
        // makes /api/orders and /api/products return HTTP 500.
        await EnsureProfileImageColumnsAsync(context);
        await EnsureShopAndOrderSchemaAsync(context);
        await EnsureRegionalHeadAssignmentTableAsync(context);

        foreach (var role in Roles.All)
        {
            if (!await roleManager.RoleExistsAsync(role))
                await roleManager.CreateAsync(new ApplicationRole { Name = role });
        }

        await SeedRegionsAsync(context);
        await SeedDefaultSettingsAsync(context);

        var env = services.GetRequiredService<IHostEnvironment>();
        var logger = services.GetRequiredService<ILoggerFactory>().CreateLogger("CatalogMasterSeeder");
        await CatalogMasterSeeder.SeedAsync(context, env, logger);

        const string superAdminEmail = "superadmin@paksuzuki.local";
        if (await userManager.FindByNameAsync(superAdminEmail) is null)
        {
            var user = new ApplicationUser { UserName = superAdminEmail, Email = superAdminEmail, EmailConfirmed = true };
            var result = await userManager.CreateAsync(user, "ChangeMe!2026");
            if (result.Succeeded)
                await userManager.AddToRoleAsync(user, Roles.SuperAdmin);
        }

        await SeedRegionalHeadAsync(userManager, context);
    }

    /// <summary>
    /// View-only Regional Head login for dashboards / map / regional stats.
    /// Email: regionalhead@paksuzuki.local  Password: ChangeMe!2026
    /// </summary>
    private static async Task SeedRegionalHeadAsync(
        UserManager<ApplicationUser> userManager,
        ApplicationDbContext context)
    {
        const string email = "regionalhead@paksuzuki.local";
        var user = await userManager.FindByNameAsync(email);
        if (user is null)
        {
            user = new ApplicationUser
            {
                UserName = email,
                Email = email,
                EmailConfirmed = true,
                IsActive = true
            };
            var result = await userManager.CreateAsync(user, "ChangeMe!2026");
            if (!result.Succeeded) return;
        }

        if (!await userManager.IsInRoleAsync(user, Roles.RegionalHead))
            await userManager.AddToRoleAsync(user, Roles.RegionalHead);

        var regionIds = new[]
        {
            RegionKarachiId, RegionLahoreId, RegionIslamabadId, RegionMultanId,
            RegionFaisalabadId, RegionPeshawarId, RegionQuettaId
        };

        foreach (var regionId in regionIds)
        {
            var exists = await context.RegionalHeadAssignments
                .AnyAsync(a => a.ApplicationUserId == user.Id && a.RegionId == regionId);
            if (exists) continue;

            // Skip if region row missing (should be seeded already).
            if (!await context.Regions.AnyAsync(r => r.Id == regionId)) continue;

            context.RegionalHeadAssignments.Add(new RegionalHeadAssignment
            {
                ApplicationUserId = user.Id,
                RegionId = regionId
            });
        }

        await context.SaveChangesAsync();
    }

    private static async Task EnsureRegionalHeadAssignmentTableAsync(ApplicationDbContext context)
    {
        await context.Database.ExecuteSqlRawAsync("""
            IF OBJECT_ID(N'[RegionalHeadAssignment]', N'U') IS NULL
            BEGIN
                CREATE TABLE [RegionalHeadAssignment] (
                    [Id] uniqueidentifier NOT NULL,
                    [ApplicationUserId] uniqueidentifier NOT NULL,
                    [RegionId] uniqueidentifier NOT NULL,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    [CreatedBy] nvarchar(max) NULL,
                    [ModifiedAtUtc] datetime2 NULL,
                    [ModifiedBy] nvarchar(max) NULL,
                    [IsDeleted] bit NOT NULL CONSTRAINT [DF_RegionalHeadAssignment_IsDeleted] DEFAULT (0),
                    [DeletedAtUtc] datetime2 NULL,
                    [DeletedBy] nvarchar(max) NULL,
                    CONSTRAINT [PK_RegionalHeadAssignment] PRIMARY KEY ([Id]),
                    CONSTRAINT [FK_RegionalHeadAssignment_Regions_RegionId]
                        FOREIGN KEY ([RegionId]) REFERENCES [Regions]([Id]) ON DELETE CASCADE
                );
                CREATE INDEX [IX_RegionalHeadAssignment_RegionId]
                    ON [RegionalHeadAssignment]([RegionId]);
            END
            """);
    }

    private static async Task EnsureProfileImageColumnsAsync(ApplicationDbContext context)
    {
        await context.Database.ExecuteSqlRawAsync("""
            IF COL_LENGTH('Distributors', 'ProfileImageUrl') IS NULL
                ALTER TABLE [Distributors] ADD [ProfileImageUrl] nvarchar(500) NULL;
            IF COL_LENGTH('Retailers', 'ProfileImageUrl') IS NULL
                ALTER TABLE [Retailers] ADD [ProfileImageUrl] nvarchar(500) NULL;
            """);
    }

    private static async Task EnsureShopAndOrderSchemaAsync(ApplicationDbContext context)
    {
        await context.Database.ExecuteSqlRawAsync("""
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
            IF COL_LENGTH('Orders', 'OriginatingRetailerOrderId') IS NULL
                ALTER TABLE [Orders] ADD [OriginatingRetailerOrderId] uniqueidentifier NULL;
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

            IF COL_LENGTH('CatalogSources', 'IsReady') IS NULL
                ALTER TABLE [CatalogSources] ADD [IsReady] bit NOT NULL CONSTRAINT [DF_CatalogSources_IsReady] DEFAULT (1);
            IF COL_LENGTH('CatalogSources', 'NotReadyMessage') IS NULL
                ALTER TABLE [CatalogSources] ADD [NotReadyMessage] nvarchar(400) NULL;

            -- One login-popup type: merge legacy newsletter / promotion banner rows.
            IF OBJECT_ID(N'[Promotions]', N'U') IS NOT NULL
            BEGIN
                UPDATE [Promotions]
                SET [Type] = N'LoginPopup'
                WHERE [Type] IN (N'NewsletterPopUp', N'PromotionBanner', N'PromoPopup');
            END

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

            IF OBJECT_ID(N'[ProductSectionImages]', N'U') IS NULL
            BEGIN
                CREATE TABLE [ProductSectionImages] (
                    [Id] uniqueidentifier NOT NULL,
                    [ProductId] uniqueidentifier NOT NULL,
                    [ImageUrl] nvarchar(1000) NOT NULL,
                    [SortOrder] int NOT NULL,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    [CreatedBy] nvarchar(max) NULL,
                    [ModifiedAtUtc] datetime2 NULL,
                    [ModifiedBy] nvarchar(max) NULL,
                    [IsDeleted] bit NOT NULL,
                    [DeletedAtUtc] datetime2 NULL,
                    [DeletedBy] nvarchar(max) NULL,
                    CONSTRAINT [PK_ProductSectionImages] PRIMARY KEY ([Id]),
                    CONSTRAINT [FK_ProductSectionImages_Products_ProductId] FOREIGN KEY ([ProductId]) REFERENCES [Products]([Id]) ON DELETE CASCADE
                );
                CREATE INDEX [IX_ProductSectionImages_ProductId] ON [ProductSectionImages]([ProductId]);
            END

            IF OBJECT_ID(N'[ShopBanners]', N'U') IS NULL
            BEGIN
                CREATE TABLE [ShopBanners] (
                    [Id] uniqueidentifier NOT NULL,
                    [Type] int NOT NULL,
                    [ProductCode] nvarchar(50) NOT NULL,
                    [BannerName] nvarchar(200) NULL,
                    [CategoryName] nvarchar(100) NOT NULL,
                    [ImageUrl] nvarchar(1000) NOT NULL,
                    [ProductId] uniqueidentifier NULL,
                    [IsActive] bit NOT NULL,
                    [SortOrder] int NOT NULL,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    [CreatedBy] nvarchar(max) NULL,
                    [ModifiedAtUtc] datetime2 NULL,
                    [ModifiedBy] nvarchar(max) NULL,
                    [IsDeleted] bit NOT NULL,
                    [DeletedAtUtc] datetime2 NULL,
                    [DeletedBy] nvarchar(max) NULL,
                    CONSTRAINT [PK_ShopBanners] PRIMARY KEY ([Id]),
                    CONSTRAINT [FK_ShopBanners_Products_ProductId] FOREIGN KEY ([ProductId]) REFERENCES [Products]([Id]) ON DELETE SET NULL
                );
                CREATE INDEX [IX_ShopBanners_ProductId] ON [ShopBanners]([ProductId]);
                CREATE INDEX [IX_ShopBanners_Type_IsActive] ON [ShopBanners]([Type], [IsActive]);
            END
            """);
    }

    private static async Task SeedDefaultSettingsAsync(ApplicationDbContext context)
    {
        await EnsureSettingAsync(context, "ShipToParty:AmountThreshold", "10000000",
            Guid.Parse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0001"));
        // 0002 is already used by ShipToParty:QuantityThreshold (migration seed).
        await EnsureSettingAsync(context, "Tax:WhtPercent", "0",
            Guid.Parse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0003"));
    }

    private static async Task EnsureSettingAsync(
        ApplicationDbContext context, string key, string value, Guid id)
    {
        var existing = await context.SystemSettings
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.Key == key);
        if (existing is not null)
        {
            if (existing.IsDeleted)
            {
                existing.IsDeleted = false;
                existing.DeletedAtUtc = null;
                existing.DeletedBy = null;
                if (string.IsNullOrWhiteSpace(existing.Value))
                    existing.Value = value;
                await context.SaveChangesAsync();
            }
            return;
        }

        var idTaken = await context.SystemSettings
            .IgnoreQueryFilters()
            .AnyAsync(s => s.Id == id);

        context.SystemSettings.Add(new SystemSetting
        {
            Id = idTaken ? Guid.NewGuid() : id,
            Key = key,
            Value = value
        });
        await context.SaveChangesAsync();
    }

    private static async Task SeedRegionsAsync(ApplicationDbContext context)
    {
        var regions = new[]
        {
            new Region { Id = RegionKarachiId, Name = "Karachi", Code = "KHI", CenterLatitude = 24.8607, CenterLongitude = 67.0011 },
            new Region { Id = RegionLahoreId, Name = "Lahore", Code = "LHE", CenterLatitude = 31.5204, CenterLongitude = 74.3587 },
            new Region { Id = RegionIslamabadId, Name = "Islamabad", Code = "ISB", CenterLatitude = 33.6844, CenterLongitude = 73.0479 },
            new Region { Id = RegionMultanId, Name = "Multan", Code = "MUX", CenterLatitude = 30.1575, CenterLongitude = 71.5249 },
            new Region { Id = RegionFaisalabadId, Name = "Faisalabad", Code = "FSD", CenterLatitude = 31.4504, CenterLongitude = 73.1350 },
            new Region { Id = RegionPeshawarId, Name = "Peshawar", Code = "PEW", CenterLatitude = 34.0151, CenterLongitude = 71.5249 },
            new Region { Id = RegionQuettaId, Name = "Quetta", Code = "QTA", CenterLatitude = 30.1798, CenterLongitude = 66.9750 }
        };

        foreach (var region in regions)
        {
            var existing = await context.Regions.FirstOrDefaultAsync(r => r.Id == region.Id || r.Code == region.Code);
            if (existing is null)
            {
                context.Regions.Add(region);
            }
            else if (existing.CenterLatitude == 0 && existing.CenterLongitude == 0)
            {
                existing.CenterLatitude = region.CenterLatitude;
                existing.CenterLongitude = region.CenterLongitude;
                if (string.IsNullOrWhiteSpace(existing.Name)) existing.Name = region.Name;
            }
        }

        await context.SaveChangesAsync();
    }
}
