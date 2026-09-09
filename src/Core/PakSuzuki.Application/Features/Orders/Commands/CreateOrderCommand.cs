using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Orders;
using PakSuzuki.Domain.Entities;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Orders.Commands;

// Covers both 3.3.1 (retailer order) and 3.3.3 (distributor direct order to Pak Suzuki):
// RetailerId is null + Source=DistributorDirectOrder for the latter.
public record CreateOrderItemDto(Guid ProductId, decimal Quantity, UnitOfMeasure Unit, Guid? ProductVariantId = null);

public record CreateOrderCommand(
    OrderSourceType Source, Guid? RetailerId, Guid DistributorId, List<CreateOrderItemDto> Items,
    Guid? OriginatingRetailerOrderId = null,
    string? VendorCode = null,
    string? MaterialSourceCode = null,
    string? DeliveryTypeCode = null,
    string? DeliveryTypeName = null,
    string? SupplierCode = null,
    string? RetailerRemarks = null
) : IRequest<CreateOrderResult>;

public record CreateOrderResult(Guid Id, string OrderNumber, string Status, string StatusLabel, string Message);

public class CreateOrderCommandValidator : AbstractValidator<CreateOrderCommand>
{
    public CreateOrderCommandValidator()
    {
        RuleFor(x => x.DistributorId).NotEmpty();
        RuleFor(x => x.Items).NotEmpty().WithMessage("Order must contain at least one product line.");
        RuleFor(x => x.RetailerId).NotEmpty().When(x => x.Source == OrderSourceType.RetailerOrder)
            .WithMessage("RetailerId is required for retailer orders.");
        RuleForEach(x => x.Items).ChildRules(item =>
        {
            item.RuleFor(i => i.ProductId).NotEmpty();
            item.RuleFor(i => i.Quantity).GreaterThan(0);
        });
        RuleFor(x => x.MaterialSourceCode).NotEmpty()
            .When(x => x.Source == OrderSourceType.DistributorDirectOrder
                || HasLane(x.MaterialSourceCode, x.DeliveryTypeCode, x.SupplierCode))
            .WithMessage("Select Local or C.K.D. before placing the order.");
        RuleFor(x => x.DeliveryTypeCode).NotEmpty()
            .When(x => x.Source == OrderSourceType.DistributorDirectOrder
                || HasLane(x.MaterialSourceCode, x.DeliveryTypeCode, x.SupplierCode))
            .WithMessage("Select a delivery type before placing the order.");
        RuleFor(x => x.SupplierCode).NotEmpty()
            .When(x => x.Source == OrderSourceType.DistributorDirectOrder
                || HasLane(x.MaterialSourceCode, x.DeliveryTypeCode, x.SupplierCode))
            .WithMessage("Select a supplier before placing the order.");
    }

    private static bool HasLane(string? source, string? delivery, string? supplier) =>
        !string.IsNullOrWhiteSpace(source) || !string.IsNullOrWhiteSpace(delivery) || !string.IsNullOrWhiteSpace(supplier);
}

public class CreateOrderCommandHandler : IRequestHandler<CreateOrderCommand, CreateOrderResult>
{
    private readonly IApplicationDbContext _context;
    private readonly IDateTimeService _dateTime;
    private readonly IAppNotificationService _notifications;

    public CreateOrderCommandHandler(
        IApplicationDbContext context, IDateTimeService dateTime, IAppNotificationService notifications)
    {
        _context = context;
        _dateTime = dateTime;
        _notifications = notifications;
    }

    public async Task<CreateOrderResult> Handle(CreateOrderCommand request, CancellationToken ct)
    {
        var distributor = await _context.Distributors.FirstOrDefaultAsync(d => d.Id == request.DistributorId, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Distributor), request.DistributorId);

        if (distributor.ApprovalStatus != ApprovalStatus.Approved || !distributor.IsActive)
            throw new ConflictException("Distributor is not approved/active and cannot participate in orders.");

        Retailer? retailer = null;
        if (request.Source == OrderSourceType.RetailerOrder)
        {
            retailer = await _context.Retailers.FirstOrDefaultAsync(r => r.Id == request.RetailerId, ct)
                ?? throw new NotFoundException(nameof(Domain.Entities.Retailer), request.RetailerId!.Value);

            if (retailer.DistributorId != distributor.Id)
                throw new ConflictException("Retailer can only order from their assigned distributor.");

            if (retailer.DistributorApprovalStatus != ApprovalStatus.Approved
                || retailer.SuperAdminApprovalStatus != ApprovalStatus.Approved
                || !retailer.IsActive)
                throw new ConflictException("Retailer registration is not fully approved yet (Distributor → Super Admin).");

            if (retailer.IsBlocked)
                throw new ConflictException("This retailer is blocked due to 45 days of inactivity and cannot place orders.");
        }

        // Distributor direct orders skip retailer approval and go to Pak Suzuki queue.
        var initialStatus = request.Source == OrderSourceType.DistributorDirectOrder
            ? OrderStatus.PendingPakSuzukiApproval
            : OrderStatus.PendingDistributorApproval;

        Guid? originatingRetailerOrderId = null;
        Domain.Entities.Order? originatingOrder = null;
        if (request.Source == OrderSourceType.DistributorDirectOrder
            && request.OriginatingRetailerOrderId is Guid originId)
        {
            originatingOrder = await _context.Orders.FirstOrDefaultAsync(o => o.Id == originId, ct)
                ?? throw new NotFoundException(nameof(Domain.Entities.Order), originId);

            if (originatingOrder.Source != OrderSourceType.RetailerOrder)
                throw new ConflictException("Originating order must be a retailer order.");
            if (originatingOrder.DistributorId != distributor.Id)
                throw new ForbiddenAccessException("Originating retailer order is not under your distributorship.");
            if (originatingOrder.Status is not (OrderStatus.PendingDistributorApproval or OrderStatus.SentBackForModification))
                throw new ConflictException(
                    $"Retailer order is in status '{originatingOrder.Status}' and cannot be ordered to manufacturer.");

            originatingRetailerOrderId = originatingOrder.Id;
        }

        // Load products first so manufacturer orders can take the lane from the cart SKUs
        // (avoids Start Order header mismatch like Local vs C.K.D.).
        var productIds = request.Items.Select(i => i.ProductId).Distinct().ToList();
        var products = await _context.Products
            .Include(p => p.PriceHistory)
            .Include(p => p.Variants)
            .Include(p => p.CatalogProfile).ThenInclude(c => c!.PType)
            .Where(p => productIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, ct);

        string? laneSource = OrderLaneCodes.NormalizeSource(request.MaterialSourceCode);
        string? laneDelivery = string.IsNullOrWhiteSpace(request.DeliveryTypeCode) ? null : request.DeliveryTypeCode.Trim();
        string? laneDeliveryName = string.IsNullOrWhiteSpace(request.DeliveryTypeName) ? null : request.DeliveryTypeName.Trim();
        string? laneSupplier = string.IsNullOrWhiteSpace(request.SupplierCode) ? null : request.SupplierCode.Trim();

        if (request.Source == OrderSourceType.DistributorDirectOrder)
        {
            // Prefer originating retailer order lane when forwarding that order.
            if (originatingOrder != null
                && (!string.IsNullOrWhiteSpace(originatingOrder.MaterialSourceCode)
                    || !string.IsNullOrWhiteSpace(originatingOrder.DeliveryTypeCode)))
            {
                laneSource = OrderLaneCodes.NormalizeSource(originatingOrder.MaterialSourceCode) ?? laneSource;
                laneDelivery = string.IsNullOrWhiteSpace(originatingOrder.DeliveryTypeCode)
                    ? laneDelivery
                    : originatingOrder.DeliveryTypeCode.Trim();
                laneDeliveryName = string.IsNullOrWhiteSpace(originatingOrder.DeliveryTypeName)
                    ? laneDeliveryName
                    : originatingOrder.DeliveryTypeName.Trim();
                laneSupplier = string.IsNullOrWhiteSpace(originatingOrder.SupplierCode)
                    ? laneSupplier
                    : originatingOrder.SupplierCode.Trim();
            }

            // Always align manufacturer PO lane to the products in the cart (must be one lane).
            ProductCatalogProfile? firstProfile = null;
            foreach (var item in request.Items)
            {
                if (!products.TryGetValue(item.ProductId, out var product))
                    throw new NotFoundException(nameof(Domain.Entities.Product), item.ProductId);
                var profile = product.CatalogProfile
                    ?? throw new ConflictException($"Product '{product.Name}' is missing master catalog data and cannot be ordered.");
                if (product.CatalogProfile?.Discontinued == true)
                    throw new ConflictException($"Product '{product.Name}' is discontinued and cannot be ordered.");

                if (firstProfile is null)
                {
                    firstProfile = profile;
                    continue;
                }

                if (!OrderLaneCodes.SameSource(firstProfile.SourceCode, profile.SourceCode)
                    || !OrderLaneCodes.SameCode(firstProfile.PType.Code, profile.PType.Code)
                    || !OrderLaneCodes.SameCode(firstProfile.SupplierCode, profile.SupplierCode))
                {
                    throw new ConflictException(
                        "Cart mixes different source / delivery type / supplier products. Start a separate manufacturer order for each lane.");
                }
            }

            if (firstProfile != null)
            {
                laneSource = OrderLaneCodes.NormalizeSource(firstProfile.SourceCode);
                laneDelivery = firstProfile.PType.Code;
                laneDeliveryName = firstProfile.PType.DeliveryType;
                laneSupplier = firstProfile.SupplierCode;
            }
        }

        var order = new Order
        {
            Source = request.Source,
            RetailerId = retailer?.Id,
            Retailer = retailer,
            DistributorId = distributor.Id,
            Distributor = distributor,
            OriginatingRetailerOrderId = originatingRetailerOrderId,
            Status = initialStatus,
            OrderNumber = await GenerateOrderNumberAsync(request.Source, distributor.DistributorCode, retailer?.RetailerCode, ct),
            VendorCode = string.IsNullOrWhiteSpace(request.VendorCode) ? "PSMC" : request.VendorCode.Trim(),
            MaterialSourceCode = laneSource,
            DeliveryTypeCode = laneDelivery,
            DeliveryTypeName = laneDeliveryName,
            SupplierCode = laneSupplier,
            RetailerRemarks = string.IsNullOrWhiteSpace(request.RetailerRemarks)
                ? null
                : request.RetailerRemarks.Trim()
        };

        decimal subTotal = 0, totalGst = 0, totalFed = 0;

        var taxRules = await _context.TaxRules.AsNoTracking()
            .Where(t => t.IsActive)
            .ToListAsync(ct);
        static decimal TaxRulePercent(IEnumerable<TaxRule> rules, string code) =>
            Math.Round((rules.FirstOrDefault(t => t.Code == code)?.Rate ?? 0m) * 100, 2);
        var systemGstPercent = TaxRulePercent(taxRules, "GST");
        var systemFedPercent = TaxRulePercent(taxRules, "FED");

        foreach (var item in request.Items)
        {
            if (!products.TryGetValue(item.ProductId, out var product))
                throw new NotFoundException(nameof(Domain.Entities.Product), item.ProductId);

            if (product.CatalogProfile?.Discontinued == true)
                throw new ConflictException($"Product '{product.Name}' is discontinued and cannot be ordered.");

            var enforceLane = request.Source == OrderSourceType.DistributorDirectOrder
                || !string.IsNullOrWhiteSpace(request.MaterialSourceCode);
            if (enforceLane)
            {
                var profile = product.CatalogProfile
                    ?? throw new ConflictException($"Product '{product.Name}' is missing master catalog data and cannot be ordered.");

                if (!OrderLaneCodes.SameSource(profile.SourceCode, order.MaterialSourceCode))
                    throw new ConflictException(
                        $"Product '{product.Name}' is source '{profile.SourceCode}', but this order is '{order.MaterialSourceCode}'. Start a separate order for each source.");

                if (!OrderLaneCodes.SameCode(profile.PType.Code, order.DeliveryTypeCode))
                    throw new ConflictException(
                        $"Product '{product.Name}' is delivery type '{profile.PType.Code}', but this order is '{order.DeliveryTypeCode}'. Start a separate order for each delivery type.");

                if (!OrderLaneCodes.SameCode(profile.SupplierCode, order.SupplierCode))
                    throw new ConflictException(
                        $"Product '{product.Name}' is supplier '{profile.SupplierCode}', but this order is '{order.SupplierCode}'. Start a separate order for each supplier.");
            }

            ProductVariant? variant = null;
            if (item.ProductVariantId is Guid variantId)
            {
                variant = product.Variants.FirstOrDefault(v => v.Id == variantId)
                    ?? throw new NotFoundException(nameof(ProductVariant), variantId);
            }

            // Prices are per pack/carton. Convert Liter/Bottle qty into packs so threshold + totals stay correct.
            var (packQty, orderUnit) = OrderPackQuantity.NormalizeToOrderUnit(item.Quantity, item.Unit, product);
            if (packQty <= 0)
                throw new ConflictException(
                    $"Quantity for '{product.Name}' converts to zero packs. Order by carton/pack (or send enough liters for one pack).");

            var currentPrice = product.PriceHistory.FirstOrDefault(pp => pp.IsCurrent);
            decimal unitPrice;
            decimal gstPercent;
            decimal fedPercent;

            if (variant != null)
            {
                // Distributor direct orders use distributor price; retailer orders use retail.
                unitPrice = request.Source == OrderSourceType.DistributorDirectOrder
                    ? variant.DistributorPrice
                    : variant.RetailPrice;
                // Prefer variant tax; fall back to current price row when variant tax was never set.
                gstPercent = variant.GstPercent > 0
                    ? variant.GstPercent
                    : currentPrice?.GstPercent ?? 0;
                fedPercent = variant.FedPercent > 0
                    ? variant.FedPercent
                    : currentPrice?.FedPercent ?? 0;
            }
            else
            {
                if (currentPrice is null)
                    throw new ConflictException($"Product {product.Name} has no active price.");
                unitPrice = currentPrice.SellingPrice;
                gstPercent = currentPrice.GstPercent;
                fedPercent = currentPrice.FedPercent;
            }

            if (gstPercent <= 0) gstPercent = systemGstPercent;
            if (fedPercent <= 0) fedPercent = systemFedPercent;

            var lineSubTotal = unitPrice * packQty;
            var lineGst = lineSubTotal * gstPercent / 100;
            var lineFed = lineSubTotal * fedPercent / 100;

            order.Items.Add(new OrderItem
            {
                ProductId = product.Id,
                Product = product,
                ProductVariantId = variant?.Id,
                VariantTypeName = variant?.TypeName,
                RequestedQuantity = packQty,
                RequestedUnit = orderUnit,
                UnitPrice = unitPrice,
                LineSubTotal = lineSubTotal,
                LineGst = lineGst,
                LineFed = lineFed
            });

            subTotal += lineSubTotal;
            totalGst += lineGst;
            totalFed += lineFed;
        }

        var whtPercent = await OrderWhtCalculator.GetSystemPercentAsync(_context, ct);

        order.SubTotal = Math.Round(subTotal, 2, MidpointRounding.AwayFromZero);
        order.TotalGst = Math.Round(totalGst, 2, MidpointRounding.AwayFromZero);
        order.TotalFed = Math.Round(totalFed, 2, MidpointRounding.AwayFromZero);
        // One WHT amount on the order total — not summed from per-product lines.
        order.WhtAmount = OrderWhtCalculator.AmountFromSubTotal(order.SubTotal, whtPercent);
        order.GrandTotal = order.SubTotal + order.TotalGst + order.TotalFed + order.WhtAmount;

        if (retailer != null) retailer.LastOrderAtUtc = _dateTime.UtcNow;

        if (request.Source == OrderSourceType.DistributorDirectOrder)
            SapPartnerCodes.ApplyDistributorDirectCodes(order);
        else
        {
            order.DistributorCode = SapPartnerCodes.Distributor(distributor);
            order.ThresholdMet = await OrderThresholdEvaluator.IsMetAsync(
                _context, distributor.Id, order.Items.ToList(), ct);
        }

        _context.Orders.Add(order);

        // Mark the source retailer order as forwarded — Pak Suzuki processes the new distributor-direct order.
        if (originatingRetailerOrderId is Guid linkedId)
        {
            var origin = await _context.Orders.FirstAsync(o => o.Id == linkedId, ct);
            origin.Status = OrderStatus.ForwardedToPakSuzuki;
            origin.DistributorActionedAtUtc = _dateTime.UtcNow;
            origin.DistributorRemarks = string.IsNullOrWhiteSpace(origin.DistributorRemarks)
                ? "Ordered to manufacturer (Pak Suzuki) by distributor."
                : origin.DistributorRemarks;
        }

        await _context.SaveChangesAsync(ct);

        var isRetailer = request.Source == OrderSourceType.RetailerOrder;
        var link = $"/orders/{order.Id}";
        if (isRetailer && retailer != null)
        {
            await _notifications.NotifyDistributorAsync(
                distributor.Id,
                "New retailer order",
                $"{retailer.Name} placed order {order.OrderNumber}. Please review.",
                NotificationCategories.Order,
                link,
                order.Id,
                ct);
        }
        else
        {
            await _notifications.NotifyStaffAsync(
                "New distributor order",
                $"{distributor.Name} placed order {order.OrderNumber} for Pak Suzuki review.",
                NotificationCategories.Order,
                link,
                order.Id,
                ct);

            if (originatingRetailerOrderId is Guid originNotifyId && originatingOrder?.RetailerId is Guid originRetailerId)
            {
                await _notifications.NotifyRetailerAsync(
                    originRetailerId,
                    "Order forwarded to manufacturer",
                    $"Your order is being processed with the manufacturer ({order.OrderNumber}).",
                    NotificationCategories.Order,
                    $"/orders/{originNotifyId}",
                    originNotifyId,
                    ct);
            }
        }

        var message = isRetailer
            ? $"Order {order.OrderNumber} placed successfully. Your distributor will review it shortly."
            : $"Order {order.OrderNumber} placed successfully.";

        return new CreateOrderResult(
            order.Id,
            order.OrderNumber,
            order.Status.ToString(),
            OrderStatusDisplay.ForViewer(order.Status, isRetailer),
            message);
    }

    // Format from doc: PO4WR/00020/26/00005 -> PO + channel(4W/2W/OBM) + R|D + codes + year + cycle.
    // Channel is simplified to a fixed segment here; wire to product category once
    // multi-channel (4W/2W/OBM) product tagging is finalized.
    private async Task<string> GenerateOrderNumberAsync(OrderSourceType source, string distributorCode, string? retailerCode, CancellationToken ct)
    {
        var year = (_dateTime.UtcNow.Year % 100).ToString("00");
        var channelFlag = source == OrderSourceType.RetailerOrder ? "R" : "D";
        var codeSegment = source == OrderSourceType.RetailerOrder ? $"{distributorCode}{retailerCode}" : distributorCode;
        var cycleNumber = (await _context.Orders.CountAsync(ct) + 1).ToString("00000");
        return $"PO4W{channelFlag}/{codeSegment}/{year}/{cycleNumber}";
    }
}
