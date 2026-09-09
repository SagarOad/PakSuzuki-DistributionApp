using PakSuzuki.Domain.Entities;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Orders;

/// <summary>
/// Business rules for partial fulfillment / delivery by order channel and product type.
/// </summary>
public static class OrderFulfillmentRules
{
    public static bool IsLubricantCategory(ProductCategory category) =>
        category is ProductCategory.Lube
            or ProductCategory.MotorOil
            or ProductCategory.MotorCar
            or ProductCategory.MotorBike
            or ProductCategory.OneS4W
            or ProductCategory.OneS2W;

    public static bool IsPartsCategory(ProductCategory category) =>
        category == ProductCategory.Parts;

    public static bool OrderContainsParts(IEnumerable<OrderItem> items) =>
        items.Any(i => i.Product != null && IsPartsCategory(i.Product.Category));

    public static bool PakSuzukiDelivers(Order order) =>
        order.Source == OrderSourceType.DistributorDirectOrder
        || order.FulfillmentChoice == OrderFulfillmentChoice.PassToPakSuzuki;

    /// <summary>
    /// Partial deliveries are allowed only for Distributor → Pak Suzuki orders that include Parts (not Lubricants-only).
    /// Retailer ↔ Distributor never allows partial delivery or partial approval.
    /// </summary>
    public static bool AllowsPartialDelivery(Order order) =>
        PakSuzukiDelivers(order) && OrderContainsParts(order.Items);

    public static bool AllowsPartialApproval(Order order) => false;
}
