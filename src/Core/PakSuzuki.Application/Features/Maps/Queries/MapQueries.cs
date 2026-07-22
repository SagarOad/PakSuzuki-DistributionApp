using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Maps.Queries;

public record MapMarkerDto(
    Guid Id,
    string Kind,
    string Name,
    string? Email,
    string? MobileNumber,
    string LocationLabel,
    double Latitude,
    double Longitude,
    Guid? DistributorId,
    string? DistributorName,
    int? RetailerCount);

public record GetMapMarkersQuery(
    string? Kind = null,
    string? Search = null,
    Guid? RegionId = null,
    Guid? ScopeDistributorId = null
) : IRequest<IReadOnlyList<MapMarkerDto>>;

public class GetMapMarkersQueryHandler : IRequestHandler<GetMapMarkersQuery, IReadOnlyList<MapMarkerDto>>
{
    private readonly IApplicationDbContext _context;
    public GetMapMarkersQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<IReadOnlyList<MapMarkerDto>> Handle(GetMapMarkersQuery request, CancellationToken ct)
    {
        var kind = request.Kind?.Trim().ToLowerInvariant();
        var includeDistributors = kind is null or "" or "all" or "distributor";
        var includeRetailers = kind is null or "" or "all" or "retailer";
        var search = request.Search?.Trim();

        var markers = new List<MapMarkerDto>();

        if (includeDistributors)
        {
            var distributors = await _context.Distributors
                .Where(d => d.ApprovalStatus == ApprovalStatus.Approved && d.IsActive)
                .Where(d => request.RegionId == null || d.RegionId == request.RegionId)
                .Where(d => request.ScopeDistributorId == null || d.Id == request.ScopeDistributorId)
                .Where(d => search == null
                    || d.Name.Contains(search)
                    || d.BusinessName.Contains(search)
                    || d.BusinessAddress.Contains(search)
                    || d.Region.Name.Contains(search))
                .Select(d => new
                {
                    d.Id, d.Name, d.Email, d.MobileNumber, d.BusinessAddress, d.Latitude, d.Longitude,
                    RegionName = d.Region.Name,
                    RetailerCount = d.Retailers.Count(r =>
                        r.IsActive
                        && r.DistributorApprovalStatus == ApprovalStatus.Approved
                        && r.SuperAdminApprovalStatus == ApprovalStatus.Approved)
                })
                .ToListAsync(ct);

            markers.AddRange(distributors.Select(d => new MapMarkerDto(
                d.Id, "Distributor", d.Name, d.Email, d.MobileNumber,
                string.IsNullOrWhiteSpace(d.BusinessAddress) ? d.RegionName : $"{d.RegionName}, {d.BusinessAddress}",
                d.Latitude, d.Longitude, null, null, d.RetailerCount)));
        }

        if (includeRetailers)
        {
            var retailers = await _context.Retailers
                .Where(r => r.IsActive
                    && r.DistributorApprovalStatus == ApprovalStatus.Approved
                    && r.SuperAdminApprovalStatus == ApprovalStatus.Approved)
                .Where(r => request.RegionId == null || r.Distributor.RegionId == request.RegionId)
                .Where(r => request.ScopeDistributorId == null || r.DistributorId == request.ScopeDistributorId)
                .Where(r => search == null
                    || r.Name.Contains(search)
                    || r.BusinessName.Contains(search)
                    || r.BusinessAddress.Contains(search)
                    || r.Distributor.Name.Contains(search)
                    || r.Distributor.Region.Name.Contains(search))
                .Select(r => new
                {
                    r.Id, r.Name, r.Email, r.MobileNumber, r.BusinessAddress, r.Latitude, r.Longitude,
                    r.DistributorId,
                    DistributorName = r.Distributor.Name,
                    RegionName = r.Distributor.Region.Name
                })
                .ToListAsync(ct);

            markers.AddRange(retailers.Select(r => new MapMarkerDto(
                r.Id, "Retailer", r.Name, r.Email, r.MobileNumber,
                string.IsNullOrWhiteSpace(r.BusinessAddress) ? r.RegionName : $"{r.RegionName}, {r.BusinessAddress}",
                r.Latitude, r.Longitude, r.DistributorId, r.DistributorName, null)));
        }

        return markers
            .Where(m => m.Latitude != 0 || m.Longitude != 0)
            .OrderBy(m => m.Kind).ThenBy(m => m.Name)
            .ToList();
    }
}

public record NearestDistributorDto(
    Guid Id, string DistributorCode, string Name, string BusinessName, string RegionName,
    string BusinessAddress, double Latitude, double Longitude, double DistanceKm, int Rank);

public record GetNearestDistributorsQuery(
    double Latitude, double Longitude, Guid? RegionId = null, int Take = 5
) : IRequest<IReadOnlyList<NearestDistributorDto>>;

public class GetNearestDistributorsQueryHandler : IRequestHandler<GetNearestDistributorsQuery, IReadOnlyList<NearestDistributorDto>>
{
    private readonly IApplicationDbContext _context;
    public GetNearestDistributorsQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<IReadOnlyList<NearestDistributorDto>> Handle(GetNearestDistributorsQuery request, CancellationToken ct)
    {
        var take = Math.Clamp(request.Take, 1, 20);

        var distributors = await _context.Distributors
            .Where(d => d.ApprovalStatus == ApprovalStatus.Approved && d.IsActive)
            .Where(d => request.RegionId == null || d.RegionId == request.RegionId)
                .Where(d => d.Latitude != 0 || d.Longitude != 0)
            .Select(d => new
            {
                d.Id, d.DistributorCode, d.Name, d.BusinessName, RegionName = d.Region.Name,
                d.BusinessAddress, d.Latitude, d.Longitude
            })
            .ToListAsync(ct);

        return distributors
            .Select(d => new
            {
                d.Id, d.DistributorCode, d.Name, d.BusinessName, d.RegionName,
                d.BusinessAddress, d.Latitude, d.Longitude,
                DistanceKm = GeoDistance.HaversineKm(request.Latitude, request.Longitude, d.Latitude, d.Longitude)
            })
            .OrderBy(d => d.DistanceKm)
            .Take(take)
            .Select((d, i) => new NearestDistributorDto(
                d.Id, d.DistributorCode, d.Name, d.BusinessName, d.RegionName,
                d.BusinessAddress, d.Latitude, d.Longitude, Math.Round(d.DistanceKm, 2), i + 1))
            .ToList();
    }
}

internal static class GeoDistance
{
    public static double HaversineKm(double lat1, double lon1, double lat2, double lon2)
    {
        const double R = 6371;
        static double ToRad(double deg) => deg * Math.PI / 180;
        var dLat = ToRad(lat2 - lat1);
        var dLon = ToRad(lon2 - lon1);
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2)
            + Math.Cos(ToRad(lat1)) * Math.Cos(ToRad(lat2))
              * Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
        var c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
        return R * c;
    }
}
