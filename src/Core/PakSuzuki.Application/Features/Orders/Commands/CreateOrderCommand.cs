using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Domain.Entities;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Orders.Commands;

// Covers both 3.3.1 (retailer order) and 3.3.3 (distributor direct order to Pak Suzuki):
// RetailerId is null + Source=DistributorDirectOrder for the latter.
public record CreateOrderItemDto(Guid ProductId, decimal Quantity, UnitOfMeasure Unit);

public record CreateOrderCommand(
    OrderSourceType Source, Guid? RetailerId, Guid DistributorId, List<CreateOrderItemDto> Items
) : IRequest<Guid>;

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
    }
}

public class CreateOrderCommandHandler : IRequestHandler<CreateOrderCommand, Guid>
{
    private readonly IApplicationDbContext _context;
    private readonly IDateTimeService _dateTime;

    public CreateOrderCommandHandler(IApplicationDbContext context, IDateTimeService dateTime)
    {
        _context = context;
        _dateTime = dateTime;
    }

    public async Task<Guid> Handle(CreateOrderCommand request, CancellationToken ct)
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

        var order = new Order
        {
            Source = request.Source,
            RetailerId = retailer?.Id,
            DistributorId = distributor.Id,
            Status = initialStatus,
            OrderNumber = await GenerateOrderNumberAsync(request.Source, distributor.DistributorCode, retailer?.RetailerCode, ct)
        };

        decimal subTotal = 0, totalGst = 0, totalFed = 0;

        foreach (var item in request.Items)
        {
            var product = await _context.Products.Include(p => p.PriceHistory)
                .FirstOrDefaultAsync(p => p.Id == item.ProductId, ct)
                ?? throw new NotFoundException(nameof(Domain.Entities.Product), item.ProductId);

            var currentPrice = product.PriceHistory.FirstOrDefault(pp => pp.IsCurrent)
                ?? throw new ConflictException($"Product {product.Name} has no active price.");

            // Retailer orders are billed at SellingPrice (distributor's cost from PakSuzuki's
            // perspective when forwarded) - simplified here as SellingPrice for both flows;
            // adjust once finance confirms which tier applies to distributor-direct orders.
            var unitPrice = currentPrice.SellingPrice;
            var lineSubTotal = unitPrice * item.Quantity;
            var lineGst = lineSubTotal * currentPrice.GstPercent / 100;
            var lineFed = lineSubTotal * currentPrice.FedPercent / 100;

            order.Items.Add(new OrderItem
            {
                ProductId = product.Id,
                RequestedQuantity = item.Quantity,
                RequestedUnit = item.Unit,
                UnitPrice = unitPrice,
                LineSubTotal = lineSubTotal,
                LineGst = lineGst,
                LineFed = lineFed
            });

            subTotal += lineSubTotal;
            totalGst += lineGst;
            totalFed += lineFed;

            // WHT is applied at the order-summary level (not per-product), using the
            // highest configured WHT% among the order's products as a simple starting rule.
        }

        var whtPercent = 0m; // resolved below to avoid re-querying per item
        var firstPrice = await _context.Products.Include(p => p.PriceHistory)
            .Where(p => order.Items.Select(i => i.ProductId).Contains(p.Id))
            .SelectMany(p => p.PriceHistory.Where(pp => pp.IsCurrent))
            .MaxAsync(pp => (decimal?)pp.WhtPercent, ct) ?? 0m;
        whtPercent = firstPrice;

        order.SubTotal = subTotal;
        order.TotalGst = totalGst;
        order.TotalFed = totalFed;
        order.WhtAmount = subTotal * whtPercent / 100;
        order.GrandTotal = subTotal + totalGst + totalFed + order.WhtAmount;

        if (retailer != null) retailer.LastOrderAtUtc = _dateTime.UtcNow;

        _context.Orders.Add(order);
        await _context.SaveChangesAsync(ct);
        return order.Id;
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
