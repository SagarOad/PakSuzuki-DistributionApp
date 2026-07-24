using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Claims;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.WebApi.Controllers;

[Authorize]
public class ClaimsController : BaseApiController
{
    private readonly ICurrentUserService _currentUser;
    public ClaimsController(ICurrentUserService currentUser) => _currentUser = currentUser;

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? status,
        [FromQuery] string? search,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 20)
    {
        Guid? distributorScope = _currentUser.Role == Roles.Distributor ? _currentUser.DistributorId : null;
        return Ok(await Mediator.Send(new GetClaimsQuery(
            status, search, from, to, distributorScope, pageNumber, pageSize)));
    }

    [HttpGet("stats")]
    public async Task<IActionResult> Stats()
    {
        Guid? distributorScope = _currentUser.Role == Roles.Distributor ? _currentUser.DistributorId : null;
        return Ok(await Mediator.Send(new GetClaimStatsQuery(distributorScope)));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        Guid? distributorScope = _currentUser.Role == Roles.Distributor ? _currentUser.DistributorId : null;
        return Ok(await Mediator.Send(new GetClaimByIdQuery(id, distributorScope)));
    }

    [HttpPost]
    [RequestSizeLimit(50_000_000)]
    public async Task<IActionResult> Create([FromForm] CreateClaimForm form)
    {
        var distributorId = form.DistributorId
            ?? _currentUser.DistributorId
            ?? throw new UnauthorizedAccessException("DistributorId is required.");

        if (_currentUser.Role == Roles.Distributor && _currentUser.DistributorId != distributorId)
            return Forbid();

        var images = new List<(string FileName, Stream Content)>();
        if (form.Images is { Count: > 0 })
        {
            foreach (var file in form.Images)
            {
                if (file.Length <= 0) continue;
                images.Add((file.FileName, file.OpenReadStream()));
            }
        }

        var id = await Mediator.Send(new CreateClaimCommand(
            form.OrderId, distributorId, form.RetailerId, form.Reason, images));
        return CreatedAtAction(nameof(GetById), new { id }, new { id });
    }

    [HttpPost("{id:guid}/confirm")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> Confirm(Guid id, [FromBody] ClaimActionBody? body)
    {
        await Mediator.Send(new ActionClaimCommand(id, ClaimStatus.Completed, body?.Remarks));
        return NoContent();
    }

    [HttpPost("{id:guid}/cancel")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> Cancel(Guid id, [FromBody] ClaimActionBody? body)
    {
        await Mediator.Send(new ActionClaimCommand(id, ClaimStatus.Cancelled, body?.Remarks));
        return NoContent();
    }
}

public class CreateClaimForm
{
    public Guid? OrderId { get; set; }
    public Guid? DistributorId { get; set; }
    public Guid? RetailerId { get; set; }
    public string Reason { get; set; } = string.Empty;
    public List<IFormFile>? Images { get; set; }
}

public record ClaimActionBody(string? Remarks);
