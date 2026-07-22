using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Maps.Queries;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.WebApi.Controllers;

[Authorize]
public class MapsController : BaseApiController
{
    private readonly ICurrentUserService _currentUser;
    public MapsController(ICurrentUserService currentUser) => _currentUser = currentUser;

    /// <summary>Markers for Map View (approved distributors + retailers with coordinates).</summary>
    [HttpGet("markers")]
    public async Task<IActionResult> GetMarkers(
        [FromQuery] string? kind,
        [FromQuery] string? search,
        [FromQuery] Guid? regionId)
    {
        Guid? scopeDistributorId = null;
        if (_currentUser.Role == Roles.Distributor)
            scopeDistributorId = _currentUser.DistributorId;

        if (_currentUser.Role is not (Roles.SuperAdmin or Roles.Admin or Roles.Distributor or Roles.RegionalHead))
            return Forbid();

        return Ok(await Mediator.Send(new GetMapMarkersQuery(kind, search, regionId, scopeDistributorId)));
    }
}
