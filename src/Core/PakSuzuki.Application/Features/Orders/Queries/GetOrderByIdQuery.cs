using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;

namespace PakSuzuki.Application.Features.Orders.Queries;

public record OrderLineItemDto(
    Guid Id, Guid ProductId, string ProductName, string ProductSku, string? ProductBio,
    string? PrimaryImageUrl, string? CategoryName,
    Guid? ProductVariantId, string? VariantTypeName,
    decimal RequestedQuantity, string RequestedUnit, decimal? ApprovedQuantity,
    decimal UnitPrice, decimal LineSubTotal, decimal LineGst, decimal LineFed);

public record OrderProofOfDeliveryDto(Guid Id, string StorageUrl, string FileName, string UploadedByRole, DateTime CreatedAtUtc);

public record OrderDetailDto(
    Guid Id, string OrderNumber, string Source, string Status,
    Guid? RetailerId, string? RetailerName, string? RetailerMobile, string? RetailerAddress,
    Guid DistributorId, string DistributorName, string DistributorMobile, string DistributorAddress,
    string? RegionName,
    string? DistributorRemarks, string? PakSuzukiRemarks,
    decimal SubTotal, decimal TotalGst, decimal TotalFed, decimal WhtAmount, decimal GrandTotal,
    decimal GstPercent,
    string? SapDocumentNumber, string? SapDeliveryNumber, string? SapGrnNumber, string? SapInvoiceNumber,
    bool IsPartialDelivery, bool ThresholdReached,
    Guid? OriginatingRetailerOrderId,
    DateTime? DistributorActionedAtUtc, DateTime? PakSuzukiActionedAtUtc,
    DateTime? InvoiceConfirmedAtUtc, DateTime CreatedAtUtc,
    List<OrderLineItemDto> Items, List<OrderProofOfDeliveryDto> ProofsOfDelivery);

// Scoping mirrors GetOrdersQuery: controller populates DistributorScope/RetailerScope
// from ICurrentUserService so a caller can never fetch another party's order by guessing its Id.
public record GetOrderByIdQuery(Guid Id, Guid? DistributorScope, Guid? RetailerScope) : IRequest<OrderDetailDto>;

public class GetOrderByIdQueryHandler : IRequestHandler<GetOrderByIdQuery, OrderDetailDto>
{
    private readonly IApplicationDbContext _context;
    public GetOrderByIdQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<OrderDetailDto> Handle(GetOrderByIdQuery request, CancellationToken ct)
    {
        var order = await _context.Orders
            .Include(o => o.Retailer)
            .Include(o => o.Distributor).ThenInclude(d => d.Region)
            .Include(o => o.Items).ThenInclude(i => i.Product)
            .Include(o => o.ProofsOfDelivery)
            .FirstOrDefaultAsync(o => o.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Order), request.Id);

        if (request.DistributorScope != null && order.DistributorId != request.DistributorScope)
            throw new ForbiddenAccessException("This order does not belong to your distributor account.");

        if (request.RetailerScope != null && order.RetailerId != request.RetailerScope)
            throw new ForbiddenAccessException("This order does not belong to your retailer account.");

        var items = order.Items.Select(i => new OrderLineItemDto(
            i.Id, i.ProductId, i.Product.Name, i.Product.Sku, i.Product.Bio,
            i.Product.PrimaryImageUrl, i.Product.CategoryName,
            i.ProductVariantId, i.VariantTypeName,
            i.RequestedQuantity, i.RequestedUnit.ToString(), i.ApprovedQuantity,
            i.UnitPrice, i.LineSubTotal, i.LineGst, i.LineFed)).ToList();

        var proofs = order.ProofsOfDelivery
            .OrderByDescending(p => p.CreatedAtUtc)
            .Select(p => new OrderProofOfDeliveryDto(
                p.Id, p.StorageUrl, p.FileName, p.UploadedByRole, p.CreatedAtUtc)).ToList();

        var gstPercent = order.SubTotal <= 0
            ? 0
            : Math.Round(order.TotalGst / order.SubTotal * 100, 2);

        return new OrderDetailDto(
            order.Id, order.OrderNumber, order.Source.ToString(), order.Status.ToString(),
            order.RetailerId, order.Retailer?.Name, order.Retailer?.MobileNumber, order.Retailer?.BusinessAddress,
            order.DistributorId, order.Distributor.Name, order.Distributor.MobileNumber, order.Distributor.BusinessAddress,
            order.Distributor.Region?.Name,
            order.DistributorRemarks, order.PakSuzukiRemarks,
            order.SubTotal, order.TotalGst, order.TotalFed, order.WhtAmount, order.GrandTotal,
            gstPercent,
            order.SapDocumentNumber, order.SapDeliveryNumber, order.SapGrnNumber, order.SapInvoiceNumber,
            order.IsPartialDelivery, order.Retailer?.IsEligibleForDirectShipToParty ?? false,
            order.OriginatingRetailerOrderId,
            order.DistributorActionedAtUtc, order.PakSuzukiActionedAtUtc,
            order.InvoiceConfirmedAtUtc, order.CreatedAtUtc, items, proofs);
    }
}
