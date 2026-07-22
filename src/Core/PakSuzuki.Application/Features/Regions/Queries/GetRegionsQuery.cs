using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Interfaces;

namespace PakSuzuki.Application.Features.Regions.Queries;

public record RegionDto(Guid Id, string Name, string Code, double CenterLatitude, double CenterLongitude);

public record GetRegionsQuery : IRequest<IReadOnlyList<RegionDto>>;

public class GetRegionsQueryHandler : IRequestHandler<GetRegionsQuery, IReadOnlyList<RegionDto>>
{
    private readonly IApplicationDbContext _context;
    public GetRegionsQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<IReadOnlyList<RegionDto>> Handle(GetRegionsQuery request, CancellationToken ct) =>
        await _context.Regions
            .OrderBy(r => r.Name)
            .Select(r => new RegionDto(r.Id, r.Name, r.Code, r.CenterLatitude, r.CenterLongitude))
            .ToListAsync(ct);
}
