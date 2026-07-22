using Microsoft.EntityFrameworkCore;
using PakSuzuki.Domain.Entities;

namespace PakSuzuki.Application.Common.Interfaces;

// Application layer depends only on this abstraction, never on EF Core's DbContext
// directly or on the Infrastructure project - keeps Application testable/persistence-agnostic.
public interface IApplicationDbContext
{
    DbSet<Distributor> Distributors { get; }
    DbSet<Retailer> Retailers { get; }
    DbSet<Region> Regions { get; }
    DbSet<BusinessImage> BusinessImages { get; }
    DbSet<Product> Products { get; }
    DbSet<ProductPrice> ProductPrices { get; }
    DbSet<ProductVariant> ProductVariants { get; }
    DbSet<ProductSectionImage> ProductSectionImages { get; }
    DbSet<ShopBanner> ShopBanners { get; }
    DbSet<Order> Orders { get; }
    DbSet<OrderItem> OrderItems { get; }
    DbSet<ProofOfDelivery> ProofsOfDelivery { get; }
    DbSet<Promotion> Promotions { get; }
    DbSet<Incentive> Incentives { get; }
    DbSet<IncentiveParticipant> IncentiveParticipants { get; }
    DbSet<Target> Targets { get; }
    DbSet<RegionalHeadAssignment> RegionalHeadAssignments { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
