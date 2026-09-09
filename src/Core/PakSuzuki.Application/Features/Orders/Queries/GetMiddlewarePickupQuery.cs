using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Orders.Queries;

public record MiddlewarePickupRowDto(
    string OrderNumber,
    string? DistributorCode,
    string? RetailerCode,
    string? ShipToCode,
    string? BillToCode,
    string MaterialCode,
    decimal ApprovedQuantity,
    string Uom,
    string? ApprovalDetails,
    string? MiddlewareStatus,
    string? SapStatus,
    string? ErrorDetails,
    int TransferFlag,
    int SapTransferStatus,
    string PoRef,
    Guid OrderId);

public record GetMiddlewarePickupQuery(bool PendingOnly = true) : IRequest<List<MiddlewarePickupRowDto>>;

public class GetMiddlewarePickupQueryHandler : IRequestHandler<GetMiddlewarePickupQuery, List<MiddlewarePickupRowDto>>
{
    private readonly IApplicationDbContext _context;
    public GetMiddlewarePickupQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<List<MiddlewarePickupRowDto>> Handle(GetMiddlewarePickupQuery request, CancellationToken ct)
    {
        var query = _context.PartsOrderLines
            .AsNoTracking()
            .Include(l => l.PartsOrder).ThenInclude(p => p.Order)
            .AsQueryable();

        if (request.PendingOnly)
            query = query.Where(l => l.PartsOrder.TransferFlag == SapTransferFlags.ReadyToTransfer
                && l.PartsOrder.MiddlewareStatus == SapMiddlewareStatuses.PendingMiddlewarePickup);

        return await query
            .OrderByDescending(l => l.PartsOrder.CreatedAtUtc)
            .Select(l => new MiddlewarePickupRowDto(
                l.PartsOrder.Order.OrderNumber,
                l.PartsOrder.DistributorCode,
                l.PartsOrder.RetailerCode,
                l.PartsOrder.ShipToCode,
                l.PartsOrder.BillToCode,
                l.MaterialCode,
                l.ApprovedQuantity,
                l.Uom,
                l.PartsOrder.ApprovalDetails,
                l.PartsOrder.MiddlewareStatus,
                l.PartsOrder.SapStatus,
                l.PartsOrder.ErrorDetails ?? l.PartsOrder.SapMessage,
                l.PartsOrder.TransferFlag,
                l.PartsOrder.SapTransferStatus,
                l.PartsOrder.PoRef,
                l.PartsOrder.OrderId))
            .ToListAsync(ct);
    }
}
