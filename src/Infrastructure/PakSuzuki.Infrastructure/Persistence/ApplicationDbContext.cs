using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Domain.Common;
using PakSuzuki.Domain.Entities;
using PakSuzuki.Infrastructure.Identity;

namespace PakSuzuki.Infrastructure.Persistence;

// Inherits IdentityDbContext so auth tables (Users/Roles/Claims) live in the same
// database as business tables - simplest option for this app's scale. If Identity
// ever needs to be split into its own DB/service, this is the seam to cut at.
public class ApplicationDbContext : IdentityDbContext<ApplicationUser, ApplicationRole, Guid>, IApplicationDbContext
{
    private readonly ICurrentUserService? _currentUser;
    private readonly IDateTimeService? _dateTime;

    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : base(options) { }

    public ApplicationDbContext(
        DbContextOptions<ApplicationDbContext> options,
        ICurrentUserService currentUser,
        IDateTimeService dateTime) : base(options)
    {
        _currentUser = currentUser;
        _dateTime = dateTime;
    }

    public DbSet<Distributor> Distributors => Set<Distributor>();
    public DbSet<Retailer> Retailers => Set<Retailer>();
    public DbSet<Region> Regions => Set<Region>();
    public DbSet<BusinessImage> BusinessImages => Set<BusinessImage>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<ProductPrice> ProductPrices => Set<ProductPrice>();
    public DbSet<ProductVariant> ProductVariants => Set<ProductVariant>();
    public DbSet<ProductSectionImage> ProductSectionImages => Set<ProductSectionImage>();
    public DbSet<ProductCatalogProfile> ProductCatalogProfiles => Set<ProductCatalogProfile>();
    public DbSet<CatalogProductType> CatalogProductTypes => Set<CatalogProductType>();
    public DbSet<CatalogCategory> CatalogCategories => Set<CatalogCategory>();
    public DbSet<CatalogPType> CatalogPTypes => Set<CatalogPType>();
    public DbSet<CatalogSupplier> CatalogSuppliers => Set<CatalogSupplier>();
    public DbSet<CatalogSource> CatalogSources => Set<CatalogSource>();
    public DbSet<CatalogGstInvoiceType> CatalogGstInvoiceTypes => Set<CatalogGstInvoiceType>();
    public DbSet<CatalogSupplierRule> CatalogSupplierRules => Set<CatalogSupplierRule>();
    public DbSet<TaxRule> TaxRules => Set<TaxRule>();
    public DbSet<DeliveryApprovalThreshold> DeliveryApprovalThresholds => Set<DeliveryApprovalThreshold>();
    public DbSet<PriceVisibilityRule> PriceVisibilityRules => Set<PriceVisibilityRule>();
    public DbSet<ShopBanner> ShopBanners => Set<ShopBanner>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<ProofOfDelivery> ProofsOfDelivery => Set<ProofOfDelivery>();
    public DbSet<Promotion> Promotions => Set<Promotion>();
    public DbSet<Incentive> Incentives => Set<Incentive>();
    public DbSet<IncentiveParticipant> IncentiveParticipants => Set<IncentiveParticipant>();
    public DbSet<IncentiveAchievementSlab> IncentiveAchievementSlabs => Set<IncentiveAchievementSlab>();
    public DbSet<ProductGroup> ProductGroups => Set<ProductGroup>();
    public DbSet<ProductGroupMember> ProductGroupMembers => Set<ProductGroupMember>();
    public DbSet<IncentiveScheme> IncentiveSchemes => Set<IncentiveScheme>();
    public DbSet<IncentiveSchemeSlab> IncentiveSchemeSlabs => Set<IncentiveSchemeSlab>();
    public DbSet<IncentiveSchemeDistributor> IncentiveSchemeDistributors => Set<IncentiveSchemeDistributor>();
    public DbSet<OrderClaim> OrderClaims => Set<OrderClaim>();
    public DbSet<ClaimImage> ClaimImages => Set<ClaimImage>();
    public DbSet<SystemSetting> SystemSettings => Set<SystemSetting>();
    public DbSet<SapOutboundQueue> SapOutboundQueues => Set<SapOutboundQueue>();
    public DbSet<PartsOrder> PartsOrders => Set<PartsOrder>();
    public DbSet<PartsOrderLine> PartsOrderLines => Set<PartsOrderLine>();
    public DbSet<PartsDeliveryHeader> PartsDeliveryHeaders => Set<PartsDeliveryHeader>();
    public DbSet<PartsDeliveryDetail> PartsDeliveryDetails => Set<PartsDeliveryDetail>();
    public DbSet<Target> Targets => Set<Target>();
    public DbSet<RegionalHeadAssignment> RegionalHeadAssignments => Set<RegionalHeadAssignment>();
    public DbSet<AppNotification> AppNotifications => Set<AppNotification>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.ApplyConfigurationsFromAssembly(typeof(ApplicationDbContext).Assembly);

        // DomainEvents are in-memory only — never persist them as a table/columns.
        builder.Ignore<DomainEvent>();
        var domainEventOwners = builder.Model.GetEntityTypes()
            .Where(t => typeof(EntityWithDomainEvents).IsAssignableFrom(t.ClrType))
            .Select(t => t.ClrType)
            .ToList();
        foreach (var clrType in domainEventOwners)
        {
            builder.Entity(clrType).Ignore(nameof(EntityWithDomainEvents.DomainEvents));
        }

        // Computed in C# only — not a database column.
        builder.Entity<Target>().Ignore(t => t.AchievementPercent);
        builder.Entity<Target>().Property(t => t.TargetAmount).HasColumnType("decimal(18,2)");
        builder.Entity<Target>().Property(t => t.AchievedAmount).HasColumnType("decimal(18,2)");

        // Global soft-delete filter: every ISoftDeletable entity is automatically
        // excluded from queries once IsDeleted=true, without every handler needing a .Where().
        foreach (var entityType in builder.Model.GetEntityTypes())
        {
            if (typeof(ISoftDeletable).IsAssignableFrom(entityType.ClrType))
            {
                var method = typeof(ApplicationDbContext)
                    .GetMethod(nameof(SetSoftDeleteFilter), System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!
                    .MakeGenericMethod(entityType.ClrType);
                method.Invoke(null, new object[] { builder });
            }
        }
    }

    private static void SetSoftDeleteFilter<T>(ModelBuilder builder) where T : class, ISoftDeletable =>
        builder.Entity<T>().HasQueryFilter(e => !e.IsDeleted);

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        // Auditing: stamp Created*/Modified* automatically so handlers never have to.
        foreach (var entry in ChangeTracker.Entries<AuditableEntity>())
        {
            switch (entry.State)
            {
                case EntityState.Added:
                    entry.Entity.CreatedAtUtc = _dateTime?.UtcNow ?? DateTime.UtcNow;
                    entry.Entity.CreatedBy = _currentUser?.UserId?.ToString();
                    break;
                case EntityState.Modified:
                    entry.Entity.ModifiedAtUtc = _dateTime?.UtcNow ?? DateTime.UtcNow;
                    entry.Entity.ModifiedBy = _currentUser?.UserId?.ToString();
                    break;
                case EntityState.Deleted:
                    // Soft-delete instead of hard delete for anything auditable.
                    entry.State = EntityState.Modified;
                    entry.Entity.IsDeleted = true;
                    entry.Entity.DeletedAtUtc = _dateTime?.UtcNow ?? DateTime.UtcNow;
                    entry.Entity.DeletedBy = _currentUser?.UserId?.ToString();
                    break;
            }
        }

        return base.SaveChangesAsync(cancellationToken);
    }
}
