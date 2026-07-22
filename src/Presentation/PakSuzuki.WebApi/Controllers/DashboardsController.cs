using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Dashboards.Queries;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.WebApi.Controllers;

[Authorize]
public class DashboardsController : BaseApiController
{
    private readonly ICurrentUserService _currentUser;
    public DashboardsController(ICurrentUserService currentUser) => _currentUser = currentUser;

    [HttpGet("superadmin")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> SuperAdmin() =>
        Ok(await Mediator.Send(new GetSuperAdminDashboardQuery()));

    [HttpGet("distributor")]
    [Authorize(Policy = "DistributorOnly")]
    public async Task<IActionResult> Distributor()
    {
        var id = _currentUser.DistributorId ?? throw new UnauthorizedAccessException();
        return Ok(await Mediator.Send(new GetDistributorDashboardQuery(id)));
    }

    /// <summary>Order/sales stats for a specific distributor (profile page).</summary>
    [HttpGet("distributor/{distributorId:guid}")]
    [Authorize]
    public async Task<IActionResult> DistributorById(Guid distributorId, [FromQuery] string period = "Month")
    {
        if (_currentUser.Role == Roles.Distributor && _currentUser.DistributorId != distributorId)
            return Forbid();
        if (_currentUser.Role is not (Roles.SuperAdmin or Roles.Admin or Roles.Distributor or Roles.RegionalHead))
            return Forbid();

        return Ok(await Mediator.Send(new GetDistributorProfileStatsQuery(distributorId, period)));
    }

    [HttpGet("retailer")]
    [Authorize(Policy = "RetailerOnly")]
    public async Task<IActionResult> Retailer()
    {
        var id = _currentUser.RetailerId ?? throw new UnauthorizedAccessException();
        return Ok(await Mediator.Send(new GetRetailerDashboardQuery(id)));
    }

    /// <summary>Order stats for a specific retailer (profile page).</summary>
    [HttpGet("retailer/{retailerId:guid}")]
    [Authorize]
    public async Task<IActionResult> RetailerById(Guid retailerId, [FromQuery] string period = "Month")
    {
        if (_currentUser.Role == Roles.Retailer && _currentUser.RetailerId != retailerId)
            return Forbid();
        if (_currentUser.Role == Roles.Distributor)
        {
            // Scope check happens via retailer detail ownership when needed;
            // stats query is still limited to that retailer's orders.
        }
        if (_currentUser.Role is not (Roles.SuperAdmin or Roles.Admin or Roles.Distributor or Roles.Retailer or Roles.RegionalHead))
            return Forbid();

        return Ok(await Mediator.Send(new GetRetailerProfileStatsQuery(retailerId, period)));
    }

    [HttpGet("regional-head")]
    [Authorize(Roles = Roles.RegionalHead)]
    public async Task<IActionResult> RegionalHead()
    {
        var userId = _currentUser.UserId ?? throw new UnauthorizedAccessException();
        return Ok(await Mediator.Send(new GetRegionalHeadDashboardQuery(userId)));
    }
}
