using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PakSuzuki.Application.Features.Incentives;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.WebApi.Controllers;

[Authorize]
public class IncentivesController : BaseApiController
{
    /// <summary>List programs — SuperAdmin/Admin see all; Distributor can view programs they participate in (full list filtered client-side for now).</summary>
    [HttpGet]
    [Authorize(Roles = $"{Roles.SuperAdmin},{Roles.Admin},{Roles.Distributor}")]
    public async Task<IActionResult> List([FromQuery] string? search, [FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 20) =>
        Ok(await Mediator.Send(new GetIncentivesQuery(search, pageNumber, pageSize)));

    [HttpGet("{id:guid}")]
    [Authorize(Roles = $"{Roles.SuperAdmin},{Roles.Admin},{Roles.Distributor}")]
    public async Task<IActionResult> GetById(Guid id) =>
        Ok(await Mediator.Send(new GetIncentiveByIdQuery(id)));

    [HttpPost]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> Create([FromBody] CreateIncentiveBody body)
    {
        var id = await Mediator.Send(new CreateIncentiveCommand(
            body.Name, body.Description, body.CriteriaType,
            body.StartDateUtc, body.EndDateUtc, body.Slabs, body.Participants));
        return CreatedAtAction(nameof(GetById), new { id }, new { id });
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateIncentiveBody body)
    {
        await Mediator.Send(new UpdateIncentiveCommand(
            id, body.Name, body.Description, body.CriteriaType,
            body.StartDateUtc, body.EndDateUtc, body.IsActive, body.Slabs, body.Participants));
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await Mediator.Send(new DeleteIncentiveCommand(id));
        return NoContent();
    }

    [HttpPost("{id:guid}/participants/{participantId:guid}/send-for-approval")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> SendForApproval(Guid id, Guid participantId)
    {
        await Mediator.Send(new SendParticipantForApprovalCommand(id, participantId));
        return NoContent();
    }
}

public record CreateIncentiveBody(
    string Name, string? Description, string CriteriaType,
    DateTime StartDateUtc, DateTime EndDateUtc,
    List<IncentiveSlabDto> Slabs, List<IncentiveParticipantInputDto> Participants);

public record UpdateIncentiveBody(
    string Name, string? Description, string CriteriaType,
    DateTime StartDateUtc, DateTime EndDateUtc, bool IsActive,
    List<IncentiveSlabDto> Slabs, List<IncentiveParticipantInputDto> Participants);
