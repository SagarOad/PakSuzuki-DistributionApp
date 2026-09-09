using PakSuzuki.Domain.Entities;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Orders;

/// <summary>
/// Lubricant / parts ordering is pack-based. Threshold rules are usually in cartons.
/// This converts a line's requested qty+unit into pack (carton) count for comparison.
/// </summary>
public static class OrderPackQuantity
{
    public static decimal ToPacks(OrderItem item)
    {
        if (item.Product is null)
        {
            // Create/amend flows store lines as Carton (or Piece for parts). Prefer that
            // over failing when Product was soft-deleted / not eager-loaded.
            if (item.RequestedUnit is UnitOfMeasure.Carton or UnitOfMeasure.Piece)
                return Math.Max(0, item.RequestedQuantity);
            throw new InvalidOperationException("Order item product is required to convert pack quantity.");
        }

        return ToPacks(item.RequestedQuantity, item.RequestedUnit, item.Product);
    }

    public static decimal ToPacks(decimal quantity, UnitOfMeasure unit, Product product)
    {
        if (quantity <= 0) return 0;

        var profile = product.CatalogProfile;
        var bottlesPerPack = profile?.PackQuantity > 0
            ? profile.PackQuantity
            : (product.ConversionFactorToBaseUnit > 0 ? product.ConversionFactorToBaseUnit : 1m);
        var litersPerBottle = profile?.UnitValue > 0 ? profile.UnitValue : 1m;
        var litersPerPack = litersPerBottle * bottlesPerPack;

        return unit switch
        {
            UnitOfMeasure.Carton => quantity,
            // Parts / piece lines: treat as order units (same as one "pack" slot for qty thresholds).
            UnitOfMeasure.Piece => quantity,
            UnitOfMeasure.Bottle => bottlesPerPack <= 0 ? quantity : quantity / bottlesPerPack,
            UnitOfMeasure.Liter => litersPerPack <= 0 ? quantity : quantity / litersPerPack,
            _ => quantity
        };
    }

    /// <summary>
    /// Convert a line into the threshold rule's unit (carton / liter / qty).
    /// </summary>
    public static decimal ToThresholdUnits(OrderItem item, string? ruleUnit)
    {
        if (item.Product is null)
        {
            if (item.RequestedUnit is UnitOfMeasure.Carton or UnitOfMeasure.Piece)
                return Math.Max(0, item.RequestedQuantity);
            throw new InvalidOperationException("Order item product is required for threshold conversion.");
        }

        var unit = (ruleUnit ?? "carton").Trim().ToLowerInvariant();
        var packs = ToPacks(item.RequestedQuantity, item.RequestedUnit, item.Product);

        var profile = item.Product.CatalogProfile;
        var bottlesPerPack = profile?.PackQuantity > 0
            ? profile.PackQuantity
            : (item.Product.ConversionFactorToBaseUnit > 0 ? item.Product.ConversionFactorToBaseUnit : 1m);
        var litersPerBottle = profile?.UnitValue > 0 ? profile.UnitValue : 1m;

        return unit switch
        {
            "liter" or "liters" or "l" => packs * litersPerBottle * bottlesPerPack,
            "bottle" or "bottles" or "pcs" or "piece" or "pieces" or "qty" or "quantity" =>
                packs * bottlesPerPack,
            _ => packs // carton / cartons / pack / packs
        };
    }

    /// <summary>
    /// Normalize lubricants to Carton (pack) quantity for storage and pricing.
    /// </summary>
    public static (decimal PackQuantity, UnitOfMeasure Unit) NormalizeToOrderUnit(
        decimal quantity, UnitOfMeasure unit, Product product)
    {
        var packs = Math.Round(ToPacks(quantity, unit, product), 4, MidpointRounding.AwayFromZero);
        if (product.Category == ProductCategory.Parts && unit == UnitOfMeasure.Piece)
            return (quantity, UnitOfMeasure.Piece);
        return (packs, UnitOfMeasure.Carton);
    }
}
