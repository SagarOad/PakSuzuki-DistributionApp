using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Orders.Commands;

// 3.3.2/3.3.3: Pak Suzuki's own review step for orders forwarded by the distributor
// (or placed directly by the distributor). Approve keeps the order at
// ApprovedByPakSuzuki (ready for SAP submission); Cancelled rejects it outright;
// PendingDistributorApproval sends it back to the distributor for correction.
public record PakSuzukiActionCommand(Guid OrderId, OrderStatus Decision, string? Remarks) : IRequest;

public class PakSuzukiActionCommandValidator : AbstractValidator<PakSuzukiActionCommand>
{
    private static readonly OrderStatus[] AllowedDecisions =
    {
        OrderStatus.ApprovedByPakSuzuki, OrderStatus.Cancelled, OrderStatus.PendingDistributorApproval
    };

    public PakSuzukiActionCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty();
        RuleFor(x => x.Decision).Must(d => AllowedDecisions.Contains(d))
            .WithMessage("Decision must be one of: Approve, Reject (Cancelled), or SendBack (PendingDistributorApproval).");
    }
}

public class PakSuzukiActionCommandHandler : IRequestHandler<PakSuzukiActionCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly IDateTimeService _dateTime;

    public PakSuzukiActionCommandHandler(IApplicationDbContext context, IDateTimeService dateTime)
    {
        _context = context;
        _dateTime = dateTime;
    }

    public async Task Handle(PakSuzukiActionCommand request, CancellationToken ct)
    {
        var order = await _context.Orders.FirstOrDefaultAsync(o => o.Id == request.OrderId, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Order), request.OrderId);

        if (order.Status != OrderStatus.PendingPakSuzukiApproval)
            throw new ConflictException($"Order is in status '{order.Status}' and cannot be actioned by Pak Suzuki right now.");

        order.Status = request.Decision;
        order.PakSuzukiRemarks = request.Remarks;
        order.PakSuzukiActionedAtUtc = _dateTime.UtcNow;

        await _context.SaveChangesAsync(ct);
    }
}

// 3.3.3: hands the order off to SAP once Pak Suzuki has approved it.
public record SubmitOrderToSapCommand(Guid OrderId) : IRequest;

public class SubmitOrderToSapCommandValidator : AbstractValidator<SubmitOrderToSapCommand>
{
    public SubmitOrderToSapCommandValidator() => RuleFor(x => x.OrderId).NotEmpty();
}

public class SubmitOrderToSapCommandHandler : IRequestHandler<SubmitOrderToSapCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly ISapIntegrationService _sapIntegration;

    public SubmitOrderToSapCommandHandler(IApplicationDbContext context, ISapIntegrationService sapIntegration)
    {
        _context = context;
        _sapIntegration = sapIntegration;
    }

    public async Task Handle(SubmitOrderToSapCommand request, CancellationToken ct)
    {
        var order = await _context.Orders.FirstOrDefaultAsync(o => o.Id == request.OrderId, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Order), request.OrderId);

        if (order.Status != OrderStatus.ApprovedByPakSuzuki)
            throw new ConflictException($"Order is in status '{order.Status}' and must be approved by Pak Suzuki before it can be submitted to SAP.");

        var result = await _sapIntegration.SubmitOrderAsync(order.Id, ct);
        if (!result.Success)
            throw new ConflictException(result.ErrorMessage ?? "SAP queue rejected the order submission.");

        // Document number is filled later by middleware when SAP confirms.
        if (!string.IsNullOrWhiteSpace(result.SapDocumentNumber))
            order.SapDocumentNumber = result.SapDocumentNumber;

        order.Status = OrderStatus.SubmittedToSap;

        await _context.SaveChangesAsync(ct);
    }
}

// Polls SAP for delivery/GRN/invoice progress on an already-submitted order (3.3.3).
public record SapStatusDto(string? SapDocumentNumber, string? DeliveryNumber, string? GrnNumber, string? InvoiceNumber, bool IsInvoiced, string OrderStatus);

public record RefreshSapStatusCommand(Guid OrderId) : IRequest<SapStatusDto>;

public class RefreshSapStatusCommandValidator : AbstractValidator<RefreshSapStatusCommand>
{
    public RefreshSapStatusCommandValidator() => RuleFor(x => x.OrderId).NotEmpty();
}

public class RefreshSapStatusCommandHandler : IRequestHandler<RefreshSapStatusCommand, SapStatusDto>
{
    private readonly IApplicationDbContext _context;
    private readonly ISapIntegrationService _sapIntegration;
    private readonly IDateTimeService _dateTime;

    public RefreshSapStatusCommandHandler(IApplicationDbContext context, ISapIntegrationService sapIntegration, IDateTimeService dateTime)
    {
        _context = context;
        _sapIntegration = sapIntegration;
        _dateTime = dateTime;
    }

    public async Task<SapStatusDto> Handle(RefreshSapStatusCommand request, CancellationToken ct)
    {
        var order = await _context.Orders.FirstOrDefaultAsync(o => o.Id == request.OrderId, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Order), request.OrderId);

        if (string.IsNullOrEmpty(order.SapDocumentNumber))
            throw new ConflictException("This order has not been submitted to SAP yet.");

        var status = await _sapIntegration.GetOrderStatusAsync(order.SapDocumentNumber, ct);

        order.SapDeliveryNumber = status.DeliveryNumber ?? order.SapDeliveryNumber;
        order.SapGrnNumber = status.GrnNumber ?? order.SapGrnNumber;
        order.SapInvoiceNumber = status.InvoiceNumber ?? order.SapInvoiceNumber;

        if (status.IsInvoiced)
        {
            order.InvoiceConfirmedAtUtc = _dateTime.UtcNow;
            order.Status = OrderStatus.InvoiceConfirmed;
        }
        else if (!string.IsNullOrEmpty(status.DeliveryNumber) && order.Status == OrderStatus.SubmittedToSap)
        {
            order.Status = order.IsPartialDelivery ? OrderStatus.PartiallyDelivered : OrderStatus.Delivered;
        }

        await _context.SaveChangesAsync(ct);

        return new SapStatusDto(
            order.SapDocumentNumber, order.SapDeliveryNumber, order.SapGrnNumber, order.SapInvoiceNumber,
            status.IsInvoiced, order.Status.ToString());
    }
}

// Internal profitability view (cost vs. selling) - not shown to Retailer/Distributor
// roles; controller should restrict this to SuperAdmin/Admin.
public record OrderProfitLineDto(string ProductName, decimal Quantity, decimal UnitCost, decimal UnitSell, decimal LineProfit);

public record OrderProfitDto(
    Guid OrderId, decimal CostTotal, decimal SellingTotal, decimal ProfitTotal, decimal MarginPercent,
    List<OrderProfitLineDto> Lines);

public record GetOrderProfitQuery(Guid OrderId) : IRequest<OrderProfitDto>;

public class GetOrderProfitQueryHandler : IRequestHandler<GetOrderProfitQuery, OrderProfitDto>
{
    private readonly IApplicationDbContext _context;
    public GetOrderProfitQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<OrderProfitDto> Handle(GetOrderProfitQuery request, CancellationToken ct)
    {
        var order = await _context.Orders
            .Include(o => o.Items).ThenInclude(i => i.Product).ThenInclude(p => p.PriceHistory)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Order), request.OrderId);

        var lines = new List<OrderProfitLineDto>();
        decimal costTotal = 0, sellingTotal = 0;

        foreach (var item in order.Items)
        {
            var quantity = item.ApprovedQuantity ?? item.RequestedQuantity;
            var currentPrice = item.Product.PriceHistory.FirstOrDefault(pp => pp.IsCurrent);
            var unitCost = currentPrice?.CostPrice ?? 0;
            var unitSell = item.UnitPrice;

            var lineCost = unitCost * quantity;
            var lineSell = unitSell * quantity;

            lines.Add(new OrderProfitLineDto(item.Product.Name, quantity, unitCost, unitSell, lineSell - lineCost));

            costTotal += lineCost;
            sellingTotal += lineSell;
        }

        var profitTotal = sellingTotal - costTotal;
        var marginPercent = costTotal == 0 ? 0 : Math.Round(profitTotal / costTotal * 100, 2);

        return new OrderProfitDto(order.Id, costTotal, sellingTotal, profitTotal, marginPercent, lines);
    }
}
