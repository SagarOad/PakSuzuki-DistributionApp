using PakSuzuki.Domain.Entities;

namespace PakSuzuki.Application.Features.IncentiveSchemes;

public static class IncentiveCalc
{
    /// <summary>Total incentive for a slab = target×rate + fixedBonus (never stored).</summary>
    public static decimal ComputeSlabIncentive(decimal targetLiters, decimal ratePerLiter, decimal fixedBonusPkr) =>
        Math.Round(targetLiters * ratePerLiter + fixedBonusPkr, 2, MidpointRounding.AwayFromZero);

    /// <summary>Cartons = target liters ÷ liters-per-carton (UnitValue × PackQuantity).</summary>
    public static decimal? ComputeCartons(decimal targetLiters, decimal litersPerCarton)
    {
        if (litersPerCarton <= 0) return null;
        return Math.Round(targetLiters / litersPerCarton, 4, MidpointRounding.AwayFromZero);
    }

    /// <summary>
    /// Average per month using only fully closed calendar months in [periodStart, periodEnd]
    /// relative to asOf (exclusive of the in-progress month).
    /// </summary>
    public static decimal? AveragePerClosedMonth(
        decimal currentPeriodLiters,
        DateTime periodStartUtc,
        DateTime periodEndUtc,
        DateTime asOfUtc)
    {
        var closed = CountClosedMonths(periodStartUtc, periodEndUtc, asOfUtc);
        if (closed <= 0) return null;
        return Math.Round(currentPeriodLiters / closed, 4, MidpointRounding.AwayFromZero);
    }

    public static int CountClosedMonths(DateTime periodStartUtc, DateTime periodEndUtc, DateTime asOfUtc)
    {
        var start = new DateTime(periodStartUtc.Year, periodStartUtc.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var endInclusive = periodEndUtc.Date;
        var asOf = asOfUtc.Date;

        // Last month that is fully closed and still inside the period.
        var lastClosedMonthStart = new DateTime(asOf.Year, asOf.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(-1);
        var periodLastMonthStart = new DateTime(endInclusive.Year, endInclusive.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        if (lastClosedMonthStart > periodLastMonthStart)
            lastClosedMonthStart = periodLastMonthStart;

        if (lastClosedMonthStart < start) return 0;

        var count = 0;
        for (var m = start; m <= lastClosedMonthStart; m = m.AddMonths(1))
            count++;
        return count;
    }

    /// <summary>
    /// Qualifying slab = highest slab (by TargetLiters) where currentLiters &gt;= TargetLiters.
    /// </summary>
    public static IncentiveSchemeSlab? QualifyingSlab(
        IEnumerable<IncentiveSchemeSlab> slabs,
        decimal currentLiters)
    {
        return slabs
            .OrderBy(s => s.TargetLiters)
            .ThenBy(s => s.SortOrder)
            .LastOrDefault(s => currentLiters + 0.0001m >= s.TargetLiters);
    }

    public static decimal LitersPerCarton(ProductCatalogProfile? profile)
    {
        if (profile is null) return 0;
        var unit = profile.UnitValue > 0 ? profile.UnitValue : 0;
        var pack = profile.PackQuantity > 0 ? profile.PackQuantity : 0;
        return unit * pack;
    }

    /// <summary>Representative liters/carton for a product group (average of members with packaging).</summary>
    public static decimal GroupLitersPerCarton(IEnumerable<ProductCatalogProfile?> profiles)
    {
        var values = profiles
            .Select(LitersPerCarton)
            .Where(v => v > 0)
            .ToList();
        if (values.Count == 0) return 0;
        return Math.Round(values.Average(), 4, MidpointRounding.AwayFromZero);
    }
}
