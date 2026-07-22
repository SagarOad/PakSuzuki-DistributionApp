using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Orders.Commands;

// 3.3.2: distributor can Approve / amend / partially-approve / Reject / Send back.
// "ApprovedQuantities" lets the distributor amend line quantities on partial approval;
// null/omitted entries default to the originally requested quantity.
public record ApproveOrderItemDto(Guid OrderItemId, decimal ApprovedQuantity);

public record ApproveOrderCommand(
    Guid OrderId, OrderStatus Decision, string? Remarks, List<ApproveOrderItemDto>? AmendedItems
) : IRequest;

public class ApproveOrderCommandValidator : AbstractValidator<ApproveOrderCommand>
{
    private static readonly OrderStatus[] AllowedDecisions =
    {
        OrderStatus.ApprovedByDistributor, OrderStatus.PartiallyApprovedByDistributor,
        OrderStatus.RejectedByDistributor, OrderStatus.SentBackForModification,
        OrderStatus.ForwardedToPakSuzuki
    };

    public ApproveOrderCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty();
        RuleFor(x => x.Decision).Must(d => AllowedDecisions.Contains(d))
            .WithMessage("Decision must be one of: Approve, PartiallyApprove, Reject, SendBack, ForwardToPakSuzuki.");
    }
}

public class ApproveOrderCommandHandler : IRequestHandler<ApproveOrderCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly IDateTimeService _dateTime;
    private readonly ICurrentUserService _currentUser;

    public ApproveOrderCommandHandler(
        IApplicationDbContext context, IDateTimeService dateTime, ICurrentUserService currentUser)
    {
        _context = context;
        _dateTime = dateTime;
        _currentUser = currentUser;
    }

    public async Task Handle(ApproveOrderCommand request, CancellationToken ct)
    {
        var order = await _context.Orders.Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Order), request.OrderId);

        if (order.Status != OrderStatus.PendingDistributorApproval)
            throw new ConflictException($"Order is in status '{order.Status}' and cannot be actioned again.");

        if (_currentUser.DistributorId is null || order.DistributorId != _currentUser.DistributorId)
            throw new ForbiddenAccessException("You can only action orders for your own distributorship.");

        if (request.Decision == OrderStatus.PartiallyApprovedByDistributor && request.AmendedItems != null)
        {
            foreach (var amended in request.AmendedItems)
            {
                var line = order.Items.FirstOrDefault(i => i.Id == amended.OrderItemId);
                if (line != null) line.ApprovedQuantity = amended.ApprovedQuantity;
            }
        }
        else if (request.Decision is OrderStatus.ApprovedByDistributor or OrderStatus.ForwardedToPakSuzuki)
        {
            foreach (var line in order.Items) line.ApprovedQuantity = line.RequestedQuantity;
        }

        order.Status = request.Decision;
        order.DistributorRemarks = request.Remarks;
        order.DistributorActionedAtUtc = _dateTime.UtcNow;

        // If distributor can't fulfill, order moves onward to Pak Suzuki for review (3.3.2 business logic).
        if (request.Decision == OrderStatus.ForwardedToPakSuzuki)
            order.Status = OrderStatus.PendingPakSuzukiApproval;

        await _context.SaveChangesAsync(ct);
    }
}
