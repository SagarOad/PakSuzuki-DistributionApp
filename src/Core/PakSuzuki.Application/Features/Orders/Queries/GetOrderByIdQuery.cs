using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Orders;

namespace PakSuzuki.Application.Features.Orders.Queries;

public record OrderLineItemDto(
    Guid Id, Guid ProductId, string ProductName, string ProductSku, string? ProductBio,
    string? PrimaryImageUrl, string? CategoryName,
    Guid? ProductVariantId, string? VariantTypeName,
    decimal RequestedQuantity, string RequestedUnit, decimal? ApprovedQuantity,
    decimal UnitPrice, decimal LineSubTotal, decimal LineGst, decimal LineFed,
    /// <summary>Staff-only: current cost per pack for margin display.</summary>
    decimal? CostPrice = null,
    /// <summary>Staff-only: current purchase/distributor price per pack.</summary>
    decimal? PurchasePrice = null,
    /// <summary>Staff-only: current sale/retail price per pack.</summary>
    decimal? SalePrice = null,
    /// <summary>Bottles/units per pack (carton).</summary>
    int? PackQuantity = null,
    /// <summary>Size of one bottle/unit (e.g. liters).</summary>
    decimal? UnitValue = null,
    string? UnitType = null,
    /// <summary>Line volume in liters for lubricant rows; 0 when not applicable.</summary>
    decimal LineLiters = 0);

public record OrderProofOfDeliveryDto(Guid Id, string StorageUrl, string FileName, string UploadedByRole, DateTime CreatedAtUtc);

public record OrderDetailDto(
    Guid Id, string OrderNumber, string Source, string Status, string StatusLabel, string? StatusCode,
    Guid? RetailerId, string? RetailerName, string? RetailerMobile, string? RetailerAddress,
    Guid DistributorId, string DistributorName, string DistributorMobile, string DistributorAddress,
    string? RegionName,
    string? DistributorRemarks, string? PakSuzukiRemarks, string? RetailerRemarks,
    decimal SubTotal, decimal TotalGst, decimal TotalFed, decimal WhtAmount, decimal GrandTotal,
    decimal GstPercent, decimal WhtPercent,
    string? SapDocumentNumber, string? SapDeliveryNumber, string? SapGrnNumber, string? SapInvoiceNumber,
    bool IsPartialDelivery, bool ThresholdReached, bool AllowsPartialDelivery,
    Guid? OriginatingRetailerOrderId,
    DateTime? DistributorActionedAtUtc, DateTime? PakSuzukiActionedAtUtc,
    DateTime? InvoiceConfirmedAtUtc, DateTime CreatedAtUtc,
    List<OrderLineItemDto> Items, List<OrderProofOfDeliveryDto> ProofsOfDelivery,
    string StatusColor, string? MiddlewareStatus, int? SapTransferStatus, string? SapMessage,
    string? PoRef, string? DealerCode, int RetryCount,
    string? VendorCode, string? MaterialSourceCode, string? DeliveryTypeCode, string? DeliveryTypeName, string? SupplierCode,
    bool ThresholdMet, string? FulfillmentChoice, string? PakSuzukiShipTo,
    string? SnapshotDistributorCode, string? SnapshotRetailerCode, string? ShipToCode, string? BillToCode,
    /// <summary>Total lubricant volume in liters for the order (0 if none).</summary>
    decimal TotalLiters = 0);

// Scoping mirrors GetOrdersQuery: controller populates DistributorScope/RetailerScope
// from ICurrentUserService so a caller can never fetch another party's order by guessing its Id.
public record GetOrderByIdQuery(
    Guid Id,
    Guid? DistributorScope,
    Guid? RetailerScope,
    bool IncludeProductMargins = false) : IRequest<OrderDetailDto>;

public class GetOrderByIdQueryHandler : IRequestHandler<GetOrderByIdQuery, OrderDetailDto>
{
    private readonly IApplicationDbContext _context;
    public GetOrderByIdQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<OrderDetailDto> Handle(GetOrderByIdQuery request, CancellationToken ct)
    {
        var orderQuery = _context.Orders
            .Include(o => o.Retailer)
            .Include(o => o.Distributor).ThenInclude(d => d.Region)
            .Include(o => o.Items).ThenInclude(i => i.Product).ThenInclude(p => p!.CatalogProfile)
            .Include(o => o.ProofsOfDelivery)
            .AsQueryable();

        if (request.IncludeProductMargins)
        {
            orderQuery = orderQuery
                .Include(o => o.Items).ThenInclude(i => i.Product).ThenInclude(p => p!.PriceHistory)
                .Include(o => o.Items).ThenInclude(i => i.Product).ThenInclude(p => p!.Variants);
        }

        var order = await orderQuery.FirstOrDefaultAsync(o => o.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Order), request.Id);

        // Soft-deleted parties are filtered out of Includes — reload ghosts for historical display.
        var distributor = order.Distributor
            ?? await _context.Distributors
                .IgnoreQueryFilters()
                .Include(d => d.Region)
                .FirstOrDefaultAsync(d => d.Id == order.DistributorId, ct);

        Domain.Entities.Retailer? retailer = order.Retailer;
        if (order.RetailerId is Guid retailerId && retailer is null)
        {
            retailer = await _context.Retailers
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(r => r.Id == retailerId, ct);
        }

        if (request.DistributorScope != null && order.DistributorId != request.DistributorScope)
            throw new ForbiddenAccessException("This order does not belong to your distributor account.");

        if (request.RetailerScope != null && order.RetailerId != request.RetailerScope)
            throw new ForbiddenAccessException("This order does not belong to your retailer account.");

        var items = order.Items.Select(i =>
        {
            decimal? cost = null, purchase = null, sale = null;
            if (request.IncludeProductMargins && i.Product != null)
            {
                if (i.ProductVariantId is Guid variantId)
                {
                    var variant = i.Product.Variants.FirstOrDefault(v => v.Id == variantId);
                    if (variant != null)
                    {
                        cost = variant.CostPrice;
                        purchase = variant.DistributorPrice;
                        sale = variant.RetailPrice;
                    }
                }

                if (cost is null && purchase is null && sale is null)
                {
                    var price = i.Product.PriceHistory.FirstOrDefault(pp => pp.IsCurrent);
                    if (price != null)
                    {
                        cost = price.CostPrice;
                        purchase = price.SellingPrice;
                        sale = price.RetailPrice;
                    }
                }
            }

            return new OrderLineItemDto(
                i.Id, i.ProductId,
                i.Product?.Name ?? "(removed product)", i.Product?.Sku ?? "", i.Product?.Bio,
                i.Product?.PrimaryImageUrl, i.Product?.CategoryName,
                i.ProductVariantId, i.VariantTypeName,
                i.RequestedQuantity, i.RequestedUnit.ToString(), i.ApprovedQuantity,
                i.UnitPrice, i.LineSubTotal, i.LineGst, i.LineFed,
                cost, purchase, sale,
                i.Product?.CatalogProfile?.PackQuantity,
                i.Product?.CatalogProfile?.UnitValue,
                i.Product?.CatalogProfile?.UnitType,
                OrderLiterTotals.LineLiters(
                    i.ApprovedQuantity ?? i.RequestedQuantity,
                    i.Product?.CatalogProfile?.PackQuantity,
                    i.Product?.CatalogProfile?.UnitValue,
                    i.Product?.CatalogProfile?.UnitType));
        }).ToList();

        var proofs = order.ProofsOfDelivery
            .OrderByDescending(p => p.CreatedAtUtc)
            .Select(p => new OrderProofOfDeliveryDto(
                p.Id, p.StorageUrl, p.FileName, p.UploadedByRole, p.CreatedAtUtc)).ToList();

        var gstPercent = order.SubTotal <= 0
            ? 0
            : Math.Round(order.TotalGst / order.SubTotal * 100, 2);
        var whtPercent = order.SubTotal <= 0
            ? 0
            : Math.Round(order.WhtAmount / order.SubTotal * 100, 2);

        var sap = await _context.PartsOrders.AsNoTracking()
            .FirstOrDefaultAsync(q => q.OrderId == order.Id, ct);

        var sapInvoice = order.SapInvoiceNumber;
        var sapDelivery = order.SapDeliveryNumber;
        if (sap != null)
        {
            sapInvoice = order.SapInvoiceNumber;
            var header = await _context.PartsDeliveryHeaders.AsNoTracking()
                .Where(h => h.PoRef == sap.PoRef)
                .OrderByDescending(h => h.Id)
                .FirstOrDefaultAsync(ct);
            if (header != null)
            {
                sapDelivery = header.SapDeliveryNumber ?? sapDelivery;
                if (!string.IsNullOrWhiteSpace(header.InvoiceNumber))
                    sapInvoice = header.InvoiceNumber;
            }
        }

        var retailerViewer = request.RetailerScope is not null;
        var viewer = OrderStatusDisplay.ResolveViewer(request.RetailerScope, request.DistributorScope);
        var statusCode = order.Status.ToString();
        var sentBackByPakSuzuki = order.Status == Domain.Enums.OrderStatus.PendingDistributorApproval
            && order.PakSuzukiActionedAtUtc is not null;
        var statusLabel = OrderStatusDisplay.Contextual(
            order.Status, viewer, order.ThresholdMet, sentBackByPakSuzuki, order.Source);
        var status = retailerViewer ? statusLabel : statusCode;

        return new OrderDetailDto(
            order.Id, order.OrderNumber, order.Source.ToString(), status, statusLabel, statusCode,
            order.RetailerId,
            retailer is null
                ? (order.RetailerCode is null ? null : PartyDisplay.RetailerLabel(null, order.RetailerCode))
                : PartyDisplay.RetailerLabel(retailer),
            retailer?.MobileNumber, retailer?.BusinessAddress,
            order.DistributorId,
            PartyDisplay.DistributorLabel(distributor, order.DistributorCode),
            distributor?.MobileNumber ?? "",
            distributor?.BusinessAddress ?? "",
            distributor?.Region?.Name,
            order.DistributorRemarks, order.PakSuzukiRemarks, order.RetailerRemarks,
            order.SubTotal, order.TotalGst, order.TotalFed, order.WhtAmount, order.GrandTotal,
            gstPercent, whtPercent,
            retailerViewer ? null : (sap?.SapSalesOrderNumber ?? order.SapDocumentNumber),
            retailerViewer ? null : sapDelivery,
            retailerViewer ? null : order.SapGrnNumber,
            retailerViewer ? null : sapInvoice,
            order.IsPartialDelivery, order.ThresholdMet,
            OrderFulfillmentRules.AllowsPartialDelivery(order),
            order.OriginatingRetailerOrderId,
            order.DistributorActionedAtUtc, order.PakSuzukiActionedAtUtc,
            order.InvoiceConfirmedAtUtc, order.CreatedAtUtc, items, proofs,
            SapOrderDisplay.StatusColor(order.Status, sapInvoice, sapDelivery, sap?.SapMessage, sap?.SapTransferStatus),
            retailerViewer ? null : sap?.MiddlewareStatus,
            retailerViewer ? null : sap?.SapTransferStatus,
            retailerViewer ? null : sap?.SapMessage,
            retailerViewer ? null : sap?.PoRef,
            retailerViewer ? null : sap?.DealerCode,
            retailerViewer ? 0 : (sap?.RetryCount ?? 0),
            order.VendorCode, order.MaterialSourceCode, order.DeliveryTypeCode, order.DeliveryTypeName, order.SupplierCode,
            order.ThresholdMet,
            order.FulfillmentChoice?.ToString(),
            order.PakSuzukiShipTo?.ToString(),
            order.DistributorCode, order.RetailerCode, order.ShipToCode, order.BillToCode,
            OrderLiterTotals.ForItems(order.Items));
    }
}
