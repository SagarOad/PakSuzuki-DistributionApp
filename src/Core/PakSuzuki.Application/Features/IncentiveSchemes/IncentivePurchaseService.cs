using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Orders;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.IncentiveSchemes;

/// <summary>
/// Loads live order liters for a distributor + product group over a date range.
/// </summary>
public interface IIncentivePurchaseService
{
    Task<decimal> SumLitersAsync(
        Guid distributorId,
        IReadOnlyCollection<Guid> productIds,
        DateTime fromUtc,
        DateTime toUtc,
        CancellationToken ct = default);

    Task<decimal> SumSalesPkrAsync(
        Guid distributorId,
        IReadOnlyCollection<Guid> productIds,
        DateTime fromUtc,
        DateTime toUtc,
        CancellationToken ct = default);

    Task<IReadOnlyList<MonthlyLiterRow>> MonthlyLitersAsync(
        Guid distributorId,
        IReadOnlyCollection<Guid> productIds,
        DateTime fromUtc,
        DateTime toUtc,
        CancellationToken ct = default);
}

public record MonthlyLiterRow(int Year, int Month, decimal Liters);

public class IncentivePurchaseService : IIncentivePurchaseService
{
    private readonly IApplicationDbContext _context;

    public IncentivePurchaseService(IApplicationDbContext context) => _context = context;

    private static readonly OrderStatus[] Excluded =
    [
        OrderStatus.Cancelled,
        OrderStatus.RejectedByDistributor,
        OrderStatus.PendingDistributorApproval,
        OrderStatus.SentBackForModification
    ];

    public async Task<decimal> SumLitersAsync(
        Guid distributorId,
        IReadOnlyCollection<Guid> productIds,
        DateTime fromUtc,
        DateTime toUtc,
        CancellationToken ct = default)
    {
        if (productIds.Count == 0) return 0;
        var rows = await LoadLinesAsync(distributorId, productIds, fromUtc, toUtc, ct);
        return Math.Round(rows.Sum(r => r.Liters), 4, MidpointRounding.AwayFromZero);
    }

    public async Task<decimal> SumSalesPkrAsync(
        Guid distributorId,
        IReadOnlyCollection<Guid> productIds,
        DateTime fromUtc,
        DateTime toUtc,
        CancellationToken ct = default)
    {
        if (productIds.Count == 0) return 0;
        var rows = await LoadLinesAsync(distributorId, productIds, fromUtc, toUtc, ct);
        return Math.Round(rows.Sum(r => r.SalesPkr), 2, MidpointRounding.AwayFromZero);
    }

    public async Task<IReadOnlyList<MonthlyLiterRow>> MonthlyLitersAsync(
        Guid distributorId,
        IReadOnlyCollection<Guid> productIds,
        DateTime fromUtc,
        DateTime toUtc,
        CancellationToken ct = default)
    {
        if (productIds.Count == 0) return [];
        var rows = await LoadLinesAsync(distributorId, productIds, fromUtc, toUtc, ct);
        return rows
            .GroupBy(r => new { r.At.Year, r.At.Month })
            .OrderBy(g => g.Key.Year).ThenBy(g => g.Key.Month)
            .Select(g => new MonthlyLiterRow(
                g.Key.Year,
                g.Key.Month,
                Math.Round(g.Sum(x => x.Liters), 4, MidpointRounding.AwayFromZero)))
            .ToList();
    }

    private async Task<List<LineLiters>> LoadLinesAsync(
        Guid distributorId,
        IReadOnlyCollection<Guid> productIds,
        DateTime fromUtc,
        DateTime toUtc,
        CancellationToken ct)
    {
        var items = await _context.OrderItems
            .AsNoTracking()
            .Include(i => i.Order)
            .Include(i => i.Product).ThenInclude(p => p.CatalogProfile)
            .Where(i => i.Order.DistributorId == distributorId)
            .Where(i => productIds.Contains(i.ProductId))
            .Where(i => !Excluded.Contains(i.Order.Status))
            .Where(i => i.Order.CreatedAtUtc >= fromUtc && i.Order.CreatedAtUtc <= toUtc)
            .ToListAsync(ct);

        return items.Select(i =>
        {
            var qty = i.ApprovedQuantity ?? i.RequestedQuantity;
            var liters = OrderPackQuantity.ToThresholdUnits(
                new Domain.Entities.OrderItem
                {
                    Product = i.Product,
                    RequestedQuantity = qty,
                    RequestedUnit = i.RequestedUnit
                },
                "liter");
            var sales = qty * i.UnitPrice;
            return new LineLiters(i.Order.CreatedAtUtc, liters, sales);
        }).ToList();
    }

    private sealed record LineLiters(DateTime At, decimal Liters, decimal SalesPkr);
}
