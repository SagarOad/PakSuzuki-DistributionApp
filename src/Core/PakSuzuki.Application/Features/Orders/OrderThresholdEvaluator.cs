using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Settings;
using PakSuzuki.Domain.Entities;

namespace PakSuzuki.Application.Features.Orders;

public static class OrderThresholdEvaluator
{
    /// <summary>
    /// Threshold is met when this order's quantity (converted to the rule unit,
    /// usually cartons/packs) reaches a category rule or the system pack setting.
    /// Ordering in Liters / Bottles is converted to packs before comparison.
    /// </summary>
    public static async Task<bool> IsMetAsync(
        IApplicationDbContext context,
        Guid distributorId,
        IReadOnlyCollection<OrderItem> items,
        CancellationToken ct)
    {
        if (items.Count == 0) return false;

        var categoryIds = items
            .Select(i => i.Product?.CatalogProfile?.CategoryId)
            .Where(id => id.HasValue)
            .Select(id => id!.Value)
            .Distinct()
            .ToList();

        if (categoryIds.Count > 0)
        {
            var rules = await context.DeliveryApprovalThresholds
                .AsNoTracking()
                .Where(t => t.IsActive && categoryIds.Contains(t.CategoryId)
                    && (t.DistributorId == null || t.DistributorId == distributorId))
                .ToListAsync(ct);

            foreach (var categoryId in categoryIds)
            {
                var rule = rules.FirstOrDefault(t => t.CategoryId == categoryId && t.DistributorId == distributorId)
                    ?? rules.FirstOrDefault(t => t.CategoryId == categoryId && t.DistributorId == null);
                if (rule is null) continue;

                var categoryQty = items
                    .Where(i => i.Product?.CatalogProfile?.CategoryId == categoryId)
                    .Sum(i => OrderPackQuantity.ToThresholdUnits(i, rule.Unit));
                if (categoryQty >= rule.QuantityThreshold)
                    return true;
            }
        }

        // Global setting is pack/carton based.
        var totalPacks = items.Sum(OrderPackQuantity.ToPacks);
        var setting = await context.SystemSettings
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Key == SettingKeys.ShipToPartyQuantityThreshold, ct);
        if (decimal.TryParse(setting?.Value, out var globalQty) && globalQty > 0 && totalPacks >= globalQty)
            return true;

        return false;
    }
}
