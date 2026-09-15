using PakSuzuki.Domain.Entities;

namespace PakSuzuki.Application.Features.Orders;

/// <summary>
/// Total lubricant volume in liters: packs × bottles-per-pack × liters-per-bottle.
/// </summary>
public static class OrderLiterTotals
{
    public static decimal LineLiters(
        decimal packs,
        int? packQuantity,
        decimal? unitValue,
        string? unitType)
    {
        if (packs <= 0) return 0;
        var bottles = packQuantity is > 0 ? packQuantity.Value : 1;
        var size = unitValue is > 0 ? unitValue.Value : 0m;
        if (size <= 0) return 0;

        var litersPerBottle = LitersPerUnit(size, unitType);
        if (litersPerBottle <= 0) return 0;
        return Math.Round(packs * bottles * litersPerBottle, 2, MidpointRounding.AwayFromZero);
    }

    public static decimal ForItems(IEnumerable<OrderItem> items)
    {
        var total = 0m;
        foreach (var item in items.Where(i => !i.IsDeleted))
        {
            var packs = item.ApprovedQuantity ?? item.RequestedQuantity;
            var profile = item.Product?.CatalogProfile;
            total += LineLiters(packs, profile?.PackQuantity, profile?.UnitValue, profile?.UnitType);
        }
        return Math.Round(total, 2, MidpointRounding.AwayFromZero);
    }

    private static decimal LitersPerUnit(decimal size, string? unitType)
    {
        var unit = (unitType ?? "L").Trim().ToLowerInvariant();
        return unit switch
        {
            "ml" or "milliliter" or "millilitre" => size / 1000m,
            "l" or "ltr" or "lt" or "liter" or "liters" or "litre" or "litres" or "" => size,
            _ => 0
        };
    }
}
