using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Common.Models;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Distributors.Queries;

public record DistributorListDto(
    Guid Id, string DistributorCode, string Name, string BusinessName, string RegionName,
    string ApprovalStatus, bool IsActive, string Email, string MobileNumber, DateTime CreatedAtUtc,
    string? ProfileImageUrl);

public record GetDistributorsQuery(
    Guid? RegionId, string? Status, string? Search, int PageNumber = 1, int PageSize = 20
) : IRequest<PaginatedList<DistributorListDto>>;

public class GetDistributorsQueryHandler : IRequestHandler<GetDistributorsQuery, PaginatedList<DistributorListDto>>
{
    private readonly IApplicationDbContext _context;
    public GetDistributorsQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<PaginatedList<DistributorListDto>> Handle(GetDistributorsQuery request, CancellationToken ct)
    {
        var query = _context.Distributors
            .Where(d => request.RegionId == null || d.RegionId == request.RegionId)
            .Where(d => request.Status == null || d.ApprovalStatus.ToString() == request.Status)
            .Where(d => request.Search == null
                || d.Name.Contains(request.Search)
                || d.BusinessName.Contains(request.Search)
                || d.DistributorCode.Contains(request.Search))
            .OrderByDescending(d => d.CreatedAtUtc)
            .Select(d => new DistributorListDto(
                d.Id, d.DistributorCode, d.Name, d.BusinessName, d.Region.Name,
                d.ApprovalStatus.ToString(), d.IsActive, d.Email, d.MobileNumber, d.CreatedAtUtc,
                d.ProfileImageUrl));

        return await PaginatedList<DistributorListDto>.CreateAsync(query, request.PageNumber, request.PageSize);
    }
}

/// <summary>Public list of approved distributors for retailer mobile registration.</summary>
public record GetApprovedDistributorsQuery(Guid? RegionId = null)
    : IRequest<IReadOnlyList<ApprovedDistributorDto>>;

public record ApprovedDistributorDto(
    Guid Id, string DistributorCode, string Name, string BusinessName, string RegionName,
    Guid RegionId, string BusinessAddress, double Latitude, double Longitude);

public class GetApprovedDistributorsQueryHandler : IRequestHandler<GetApprovedDistributorsQuery, IReadOnlyList<ApprovedDistributorDto>>
{
    private readonly IApplicationDbContext _context;
    public GetApprovedDistributorsQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<IReadOnlyList<ApprovedDistributorDto>> Handle(GetApprovedDistributorsQuery request, CancellationToken ct) =>
        await _context.Distributors
            .Where(d => d.ApprovalStatus == ApprovalStatus.Approved && d.IsActive)
            .Where(d => request.RegionId == null || d.RegionId == request.RegionId)
            .OrderBy(d => d.BusinessName)
            .Select(d => new ApprovedDistributorDto(
                d.Id, d.DistributorCode, d.Name, d.BusinessName, d.Region.Name,
                d.RegionId, d.BusinessAddress, d.Latitude, d.Longitude))
            .ToListAsync(ct);
}

// Distributors awaiting Super Admin (PSMCL) final approval (3.1 registration workflow).
public record GetPendingDistributorsQuery(int PageNumber = 1, int PageSize = 20)
    : IRequest<PaginatedList<DistributorListDto>>;

public class GetPendingDistributorsQueryHandler : IRequestHandler<GetPendingDistributorsQuery, PaginatedList<DistributorListDto>>
{
    private readonly IApplicationDbContext _context;
    public GetPendingDistributorsQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<PaginatedList<DistributorListDto>> Handle(GetPendingDistributorsQuery request, CancellationToken ct)
    {
        var query = _context.Distributors
            .Where(d => d.ApprovalStatus == ApprovalStatus.PendingReview
                || d.ApprovalStatus == ApprovalStatus.SentBackForCorrection)
            .OrderBy(d => d.CreatedAtUtc)
            .Select(d => new DistributorListDto(
                d.Id, d.DistributorCode, d.Name, d.BusinessName, d.Region.Name,
                d.ApprovalStatus.ToString(), d.IsActive, d.Email, d.MobileNumber, d.CreatedAtUtc,
                d.ProfileImageUrl));

        return await PaginatedList<DistributorListDto>.CreateAsync(query, request.PageNumber, request.PageSize);
    }
}

public record DistributorImageDto(Guid Id, string StorageUrl, string FileName);

public record DistributorDetailDto(
    Guid Id, string DistributorCode, string Name, string Cnic, string MobileNumber, string Email,
    string BusinessName, string Ntn, string Iban, string BusinessAddress, double Latitude, double Longitude,
    Guid RegionId, string RegionName, string ApprovalStatus, string? ApprovalRemarks, DateTime? ApprovedAtUtc,
    bool IsActive, DateTime CreatedAtUtc, string? ProfileImageUrl, List<DistributorImageDto> Images,
    string? SapDealerCode, string? SapShipToCode);

public record GetDistributorByIdQuery(Guid Id) : IRequest<DistributorDetailDto>;

public class GetDistributorByIdQueryHandler : IRequestHandler<GetDistributorByIdQuery, DistributorDetailDto>
{
    private readonly IApplicationDbContext _context;
    public GetDistributorByIdQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<DistributorDetailDto> Handle(GetDistributorByIdQuery request, CancellationToken ct)
    {
        var distributor = await _context.Distributors
            .Include(d => d.Region)
            .Include(d => d.BusinessImages)
            .FirstOrDefaultAsync(d => d.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Distributor), request.Id);

        return new DistributorDetailDto(
            distributor.Id, distributor.DistributorCode, distributor.Name, distributor.Cnic,
            distributor.MobileNumber, distributor.Email, distributor.BusinessName, distributor.Ntn,
            distributor.Iban, distributor.BusinessAddress, distributor.Latitude, distributor.Longitude,
            distributor.RegionId, distributor.Region.Name, distributor.ApprovalStatus.ToString(),
            distributor.ApprovalRemarks, distributor.ApprovedAtUtc, distributor.IsActive, distributor.CreatedAtUtc,
            distributor.ProfileImageUrl,
            distributor.BusinessImages.Select(i => new DistributorImageDto(i.Id, i.StorageUrl, i.FileName)).ToList(),
            distributor.SapDealerCode, distributor.SapShipToCode);
    }
}
