using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Common.Models;
using PakSuzuki.Domain.Entities;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Claims;

public record ClaimListDto(
    Guid Id, DateTime CreatedAtUtc, string? OrderNumber, string DistributorName, string Status);

public record ClaimImageDto(Guid Id, string StorageUrl, string FileName);

public record ClaimDetailDto(
    Guid Id, string Status, DateTime CreatedAtUtc,
    Guid? OrderId, string? OrderNumber,
    Guid DistributorId, string DistributorName, string DistributorMobile,
    string DistributorAddress, string? RegionName,
    Guid? RetailerId, string? RetailerName,
    string Reason, string? StaffRemarks,
    List<ClaimImageDto> Images);

public record ClaimStatsDto(int Total, int InProcess, int Completed, int Cancelled);

public record GetClaimsQuery(
    string? Status, string? Search, DateTime? FromUtc, DateTime? ToUtc,
    Guid? DistributorScope, int PageNumber = 1, int PageSize = 20
) : IRequest<PaginatedList<ClaimListDto>>;

public record GetClaimByIdQuery(Guid Id, Guid? DistributorScope) : IRequest<ClaimDetailDto>;

public record GetClaimStatsQuery(Guid? DistributorScope) : IRequest<ClaimStatsDto>;

public record CreateClaimCommand(
    Guid? OrderId, Guid DistributorId, Guid? RetailerId, string Reason,
    List<(string FileName, Stream Content)> Images
) : IRequest<Guid>;

public record ActionClaimCommand(Guid Id, ClaimStatus Decision, string? Remarks) : IRequest;

public class CreateClaimCommandValidator : AbstractValidator<CreateClaimCommand>
{
    public CreateClaimCommandValidator()
    {
        RuleFor(x => x.DistributorId).NotEmpty();
        RuleFor(x => x.Reason).NotEmpty().MaximumLength(4000);
    }
}

public class ActionClaimCommandValidator : AbstractValidator<ActionClaimCommand>
{
    public ActionClaimCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Decision).Must(d => d is ClaimStatus.Completed or ClaimStatus.Cancelled)
            .WithMessage("Decision must be Completed or Cancelled.");
    }
}

public class GetClaimsQueryHandler : IRequestHandler<GetClaimsQuery, PaginatedList<ClaimListDto>>
{
    private readonly IApplicationDbContext _context;
    public GetClaimsQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<PaginatedList<ClaimListDto>> Handle(GetClaimsQuery request, CancellationToken ct)
    {
        var query = _context.OrderClaims
            .Include(c => c.Order)
            .Include(c => c.Distributor)
            .AsQueryable();

        if (request.DistributorScope is Guid distId)
            query = query.Where(c => c.DistributorId == distId);

        if (!string.IsNullOrWhiteSpace(request.Status) && Enum.TryParse<ClaimStatus>(request.Status, true, out var status))
            query = query.Where(c => c.Status == status);

        if (request.FromUtc is DateTime from)
            query = query.Where(c => c.CreatedAtUtc >= from);

        if (request.ToUtc is DateTime to)
            query = query.Where(c => c.CreatedAtUtc <= to);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.Trim();
            query = query.Where(c =>
                c.Distributor.Name.Contains(s)
                || (c.Order != null && c.Order.OrderNumber.Contains(s))
                || c.Reason.Contains(s));
        }

        var projected = query
            .OrderByDescending(c => c.CreatedAtUtc)
            .Select(c => new ClaimListDto(
                c.Id, c.CreatedAtUtc, c.Order != null ? c.Order.OrderNumber : null,
                c.Distributor.Name, c.Status.ToString()));

        return await PaginatedList<ClaimListDto>.CreateAsync(projected, request.PageNumber, request.PageSize);
    }
}

public class GetClaimStatsQueryHandler : IRequestHandler<GetClaimStatsQuery, ClaimStatsDto>
{
    private readonly IApplicationDbContext _context;
    public GetClaimStatsQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<ClaimStatsDto> Handle(GetClaimStatsQuery request, CancellationToken ct)
    {
        var query = _context.OrderClaims.AsQueryable();
        if (request.DistributorScope is Guid distId)
            query = query.Where(c => c.DistributorId == distId);

        var total = await query.CountAsync(ct);
        var inProcess = await query.CountAsync(c => c.Status == ClaimStatus.InProcess, ct);
        var completed = await query.CountAsync(c => c.Status == ClaimStatus.Completed, ct);
        var cancelled = await query.CountAsync(c => c.Status == ClaimStatus.Cancelled, ct);
        return new ClaimStatsDto(total, inProcess, completed, cancelled);
    }
}

public class GetClaimByIdQueryHandler : IRequestHandler<GetClaimByIdQuery, ClaimDetailDto>
{
    private readonly IApplicationDbContext _context;
    public GetClaimByIdQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<ClaimDetailDto> Handle(GetClaimByIdQuery request, CancellationToken ct)
    {
        var claim = await _context.OrderClaims
            .Include(c => c.Order)
            .Include(c => c.Distributor).ThenInclude(d => d.Region)
            .Include(c => c.Retailer)
            .Include(c => c.Images)
            .FirstOrDefaultAsync(c => c.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(OrderClaim), request.Id);

        if (request.DistributorScope is Guid distId && claim.DistributorId != distId)
            throw new ForbiddenAccessException("This claim does not belong to your distributor account.");

        var images = claim.Images.OrderBy(i => i.SortOrder)
            .Select(i => new ClaimImageDto(i.Id, i.StorageUrl, i.FileName)).ToList();

        return new ClaimDetailDto(
            claim.Id, claim.Status.ToString(), claim.CreatedAtUtc,
            claim.OrderId, claim.Order?.OrderNumber,
            claim.DistributorId, claim.Distributor.Name, claim.Distributor.MobileNumber,
            claim.Distributor.BusinessAddress, claim.Distributor.Region?.Name,
            claim.RetailerId, claim.Retailer?.Name,
            claim.Reason, claim.StaffRemarks, images);
    }
}

public class CreateClaimCommandHandler : IRequestHandler<CreateClaimCommand, Guid>
{
    private readonly IApplicationDbContext _context;
    private readonly IFileStorageService _files;
    private const string Container = "claim-images";

    public CreateClaimCommandHandler(IApplicationDbContext context, IFileStorageService files)
    {
        _context = context;
        _files = files;
    }

    public async Task<Guid> Handle(CreateClaimCommand request, CancellationToken ct)
    {
        var distributor = await _context.Distributors.FirstOrDefaultAsync(d => d.Id == request.DistributorId, ct)
            ?? throw new NotFoundException(nameof(Distributor), request.DistributorId);

        if (request.OrderId is Guid orderId)
        {
            var order = await _context.Orders.FirstOrDefaultAsync(o => o.Id == orderId, ct)
                ?? throw new NotFoundException(nameof(Order), orderId);
            if (order.DistributorId != distributor.Id)
                throw new ConflictException("Order does not belong to the selected distributor.");
        }

        if (request.RetailerId is Guid retailerId)
        {
            var retailer = await _context.Retailers.FirstOrDefaultAsync(r => r.Id == retailerId, ct)
                ?? throw new NotFoundException(nameof(Retailer), retailerId);
            if (retailer.DistributorId != distributor.Id)
                throw new ConflictException("Retailer is not under the selected distributor.");
        }

        var claim = new OrderClaim
        {
            OrderId = request.OrderId,
            DistributorId = request.DistributorId,
            RetailerId = request.RetailerId,
            Reason = request.Reason.Trim(),
            Status = ClaimStatus.InProcess
        };

        var sort = 0;
        foreach (var file in request.Images)
        {
            var url = await _files.UploadAsync(file.Content, file.FileName, Container, ct);
            claim.Images.Add(new ClaimImage
            {
                StorageUrl = url,
                FileName = file.FileName,
                SortOrder = sort++
            });
        }

        _context.OrderClaims.Add(claim);
        await _context.SaveChangesAsync(ct);
        return claim.Id;
    }
}

public class ActionClaimCommandHandler : IRequestHandler<ActionClaimCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly IDateTimeService _dateTime;

    public ActionClaimCommandHandler(IApplicationDbContext context, IDateTimeService dateTime)
    {
        _context = context;
        _dateTime = dateTime;
    }

    public async Task Handle(ActionClaimCommand request, CancellationToken ct)
    {
        var claim = await _context.OrderClaims.FirstOrDefaultAsync(c => c.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(OrderClaim), request.Id);

        if (claim.Status != ClaimStatus.InProcess)
            throw new ConflictException($"Claim is already '{claim.Status}' and cannot be actioned again.");

        claim.Status = request.Decision;
        claim.StaffRemarks = request.Remarks;
        claim.ActionedAtUtc = _dateTime.UtcNow;
        await _context.SaveChangesAsync(ct);
    }
}
