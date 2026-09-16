using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PakSuzuki.Application.Features.RegionalHeads;

namespace PakSuzuki.WebApi.Controllers;

/// <summary>
/// Super Admin / Admin: manage Regional Head logins and their region assignments.
/// Additive APIs — does not change registration or existing role contracts.
/// </summary>
[Authorize(Policy = "AdminOrAbove")]
[Route("api/regional-heads")]
public class RegionalHeadsController : BaseApiController
{
    [HttpGet]
    public async Task<IActionResult> List() =>
        Ok(await Mediator.Send(new GetRegionalHeadsQuery()));

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateRegionalHeadBody body)
    {
        var created = await Mediator.Send(new CreateRegionalHeadCommand(
            body.Email,
            body.Password,
            body.RegionIds ?? [],
            body.DisplayName));
        return CreatedAtAction(nameof(List), new { id = created.UserId }, created);
    }

    [HttpPut("{userId:guid}")]
    public async Task<IActionResult> Update(Guid userId, [FromBody] UpdateRegionalHeadBody body) =>
        Ok(await Mediator.Send(new UpdateRegionalHeadCommand(
            userId,
            body.RegionIds ?? [],
            body.IsActive,
            body.NewPassword)));
}

public record CreateRegionalHeadBody(
    string Email,
    string Password,
    List<Guid>? RegionIds,
    string? DisplayName = null);

public record UpdateRegionalHeadBody(
    List<Guid>? RegionIds,
    bool? IsActive = null,
    string? NewPassword = null);
