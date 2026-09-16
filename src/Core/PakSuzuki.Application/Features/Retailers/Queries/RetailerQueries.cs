using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Common.Models;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Retailers.Queries;

public record RetailerListDto(
    Guid Id, string RetailerCode, string Name, string BusinessName,
    string MobileNumber, string Email, string BusinessAddress, string DistributorName,
    string RegionName,
    string DistributorApprovalStatus, string SuperAdminApprovalStatus,
    bool IsActive, bool IsBlocked, DateTime CreatedAtUtc, string? ProfileImageUrl);

// DistributorScope, when set, restricts results to that distributor's own retailers
// (controller populates from ICurrentUserService, never trusts client-supplied scope).
public record GetRetailersQuery(
    Guid? DistributorScope, string? Search, int PageNumber = 1, int PageSize = 20
) : IRequest<PaginatedList<RetailerListDto>>;

public class GetRetailersQueryHandler : IRequestHandler<GetRetailersQuery, PaginatedList<RetailerListDto>>
{
    private readonly IApplicationDbContext _context;
    public GetRetailersQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<PaginatedList<RetailerListDto>> Handle(GetRetailersQuery request, CancellationToken ct)
    {
        // Join distributors with IgnoreQueryFilters so soft-deleted (“ghost”) assignees still appear
        // as "(removed)" instead of vanishing from the list.
        // Main list / "All" tab: anything still in the approval pipeline stays on /retailers/pending only.
        var query =
            from r in _context.Retailers.AsNoTracking()
            join d in _context.Distributors.IgnoreQueryFilters().AsNoTracking()
                on r.DistributorId equals d.Id
            where request.DistributorScope == null || r.DistributorId == request.DistributorScope
            where !(
                r.DistributorApprovalStatus == ApprovalStatus.PendingReview
                || r.DistributorApprovalStatus == ApprovalStatus.SentBackForCorrection
                || (r.DistributorApprovalStatus == ApprovalStatus.Approved
                    && (r.SuperAdminApprovalStatus == ApprovalStatus.PendingReview
                        || r.SuperAdminApprovalStatus == ApprovalStatus.SentBackForCorrection)))
            where request.Search == null
                || r.Name.Contains(request.Search)
                || r.BusinessName.Contains(request.Search)
                || r.RetailerCode.Contains(request.Search)
            orderby r.CreatedAtUtc descending
            select new RetailerListDto(
                r.Id, r.RetailerCode, r.Name, r.BusinessName,
                r.MobileNumber, r.Email, r.BusinessAddress,
                d.IsDeleted
                    ? (string.IsNullOrWhiteSpace(d.BusinessName) ? d.Name : d.BusinessName) + " (removed)"
                    : (string.IsNullOrWhiteSpace(d.BusinessName) ? d.Name : d.BusinessName),
                d.Region != null ? d.Region.Name : "—",
                r.DistributorApprovalStatus.ToString(), r.SuperAdminApprovalStatus.ToString(),
                r.IsActive, r.IsBlocked, r.CreatedAtUtc, r.ProfileImageUrl);

        return await PaginatedList<RetailerListDto>.CreateAsync(query, request.PageNumber, request.PageSize);
    }
}

// Shape matches what the client renders on both the Distributor and Super Admin
// pending-approval screens (3.1 two-step workflow).
public record RetailerPendingDto(
    Guid Id, string Name, string BusinessName, string MobileNumber, string Email,
    string BusinessAddress, string DistributorName,
    string DistributorApprovalStatus, string SuperAdminApprovalStatus, DateTime CreatedAtUtc,
    string? ProfileImageUrl, int PhotoCount);

// ForSuperAdmin=true -> retailers already approved by their distributor, awaiting PSMCL
// final approval. ForSuperAdmin=false -> retailers awaiting their own distributor's review
// (DistributorScope required in that case).
public record GetPendingRetailersQuery(
    Guid? DistributorScope, bool ForSuperAdmin, int PageNumber = 1, int PageSize = 20
) : IRequest<PaginatedList<RetailerPendingDto>>;

public class GetPendingRetailersQueryHandler : IRequestHandler<GetPendingRetailersQuery, PaginatedList<RetailerPendingDto>>
{
    private readonly IApplicationDbContext _context;
    public GetPendingRetailersQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<PaginatedList<RetailerPendingDto>> Handle(GetPendingRetailersQuery request, CancellationToken ct)
    {
        // SuperAdmin pipeline view: every retailer still in the approval chain
        // (awaiting distributor, sent back, or awaiting PSMCL final approval).
        // Distributor view: only their own retailers awaiting their review.
        var query = request.ForSuperAdmin
            ? _context.Retailers.Where(r =>
                r.DistributorApprovalStatus == ApprovalStatus.PendingReview
                || r.DistributorApprovalStatus == ApprovalStatus.SentBackForCorrection
                || (r.DistributorApprovalStatus == ApprovalStatus.Approved
                    && (r.SuperAdminApprovalStatus == ApprovalStatus.PendingReview
                        || r.SuperAdminApprovalStatus == ApprovalStatus.SentBackForCorrection)))
            : _context.Retailers.Where(r =>
                (r.DistributorApprovalStatus == ApprovalStatus.PendingReview
                    || r.DistributorApprovalStatus == ApprovalStatus.SentBackForCorrection)
                && r.DistributorId == request.DistributorScope);

        var projected = query
            .OrderBy(r => r.CreatedAtUtc)
            .Select(r => new RetailerPendingDto(
                r.Id, r.Name, r.BusinessName, r.MobileNumber, r.Email,
                r.BusinessAddress, r.Distributor.Name,
                r.DistributorApprovalStatus.ToString(), r.SuperAdminApprovalStatus.ToString(), r.CreatedAtUtc,
                r.ProfileImageUrl, r.BusinessImages.Count));

        return await PaginatedList<RetailerPendingDto>.CreateAsync(projected, request.PageNumber, request.PageSize);
    }
}

public record RetailerImageDto(Guid Id, string StorageUrl, string FileName);

public record RetailerDetailDto(
    Guid Id, string RetailerCode, string Name, string Cnic, string MobileNumber, string Email,
    string BusinessName, string Ntn, string Iban, string BusinessAddress, double Latitude, double Longitude,
    Guid DistributorId, string DistributorName, string DistributorEmail, string DistributorMobile,
    string DistributorBusinessAddress, string DistributorRegionName, double DistributorLatitude, double DistributorLongitude,
    string? DistributorProfileImageUrl,
    string DistributorApprovalStatus, string SuperAdminApprovalStatus,
    string? ApprovalRemarks, bool IsActive, bool IsBlocked, DateTime? BlockedAtUtc, DateTime? LastOrderAtUtc,
    bool IsEligibleForDirectShipToParty, string? SapBusinessPartnerCode, DateTime CreatedAtUtc,
    string? ProfileImageUrl, List<RetailerImageDto> Images);

public record GetRetailerByIdQuery(Guid Id, Guid? DistributorScope) : IRequest<RetailerDetailDto>;

public class GetRetailerByIdQueryHandler : IRequestHandler<GetRetailerByIdQuery, RetailerDetailDto>
{
    private readonly IApplicationDbContext _context;
    public GetRetailerByIdQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<RetailerDetailDto> Handle(GetRetailerByIdQuery request, CancellationToken ct)
    {
        var retailer = await _context.Retailers
            .Include(r => r.BusinessImages)
            .FirstOrDefaultAsync(r => r.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Retailer), request.Id);

        if (request.DistributorScope != null && retailer.DistributorId != request.DistributorScope)
            throw new ForbiddenAccessException("This retailer does not belong to your distributor account.");

        // Live retailers must keep a real distributor; soft-deleted links still render as ghosts for staff.
        var d = await _context.Distributors
            .IgnoreQueryFilters()
            .Include(x => x.Region)
            .FirstOrDefaultAsync(x => x.Id == retailer.DistributorId, ct)
            ?? throw new ConflictException(
                "This retailer has no linked distributor record. Contact support to repair the assignment.");

        return new RetailerDetailDto(
            retailer.Id, retailer.RetailerCode, retailer.Name, retailer.Cnic, retailer.MobileNumber,
            retailer.Email, retailer.BusinessName, retailer.Ntn, retailer.Iban, retailer.BusinessAddress,
            retailer.Latitude, retailer.Longitude, retailer.DistributorId,
            PartyDisplay.DistributorLabel(d),
            d.Email, d.MobileNumber, d.BusinessAddress, d.Region?.Name ?? "—", d.Latitude, d.Longitude,
            d.ProfileImageUrl,
            retailer.DistributorApprovalStatus.ToString(), retailer.SuperAdminApprovalStatus.ToString(),
            retailer.ApprovalRemarks, retailer.IsActive, retailer.IsBlocked, retailer.BlockedAtUtc,
            retailer.LastOrderAtUtc, retailer.IsEligibleForDirectShipToParty, retailer.SapBusinessPartnerCode,
            retailer.CreatedAtUtc, retailer.ProfileImageUrl,
            retailer.BusinessImages.Select(i => new RetailerImageDto(i.Id, i.StorageUrl, i.FileName)).ToList());
    }
}

// Surfaces the 45-day inactivity rule (2.3) so the UI can warn a retailer/distributor
// before the account actually gets auto-blocked.
public record BlockingStatusDto(
    bool IsBlocked, DateTime? BlockedAtUtc, DateTime? LastOrderAtUtc,
    int? DaysSinceLastOrder, int? DaysUntilBlock, int BlockThresholdDays);

public record GetRetailerBlockingStatusQuery(Guid Id) : IRequest<BlockingStatusDto>;

public class GetRetailerBlockingStatusQueryHandler : IRequestHandler<GetRetailerBlockingStatusQuery, BlockingStatusDto>
{
    private const int BlockThresholdDays = 45;

    private readonly IApplicationDbContext _context;
    private readonly IDateTimeService _dateTime;

    public GetRetailerBlockingStatusQueryHandler(IApplicationDbContext context, IDateTimeService dateTime)
    {
        _context = context;
        _dateTime = dateTime;
    }

    public async Task<BlockingStatusDto> Handle(GetRetailerBlockingStatusQuery request, CancellationToken ct)
    {
        var retailer = await _context.Retailers.FirstOrDefaultAsync(r => r.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Retailer), request.Id);

        int? daysSinceLastOrder = null;
        int? daysUntilBlock = null;

        if (retailer.LastOrderAtUtc.HasValue)
        {
            daysSinceLastOrder = (int)(_dateTime.UtcNow - retailer.LastOrderAtUtc.Value).TotalDays;
            daysUntilBlock = Math.Max(0, BlockThresholdDays - daysSinceLastOrder.Value);
        }

        return new BlockingStatusDto(
            retailer.IsBlocked, retailer.BlockedAtUtc, retailer.LastOrderAtUtc,
            daysSinceLastOrder, daysUntilBlock, BlockThresholdDays);
    }
}
