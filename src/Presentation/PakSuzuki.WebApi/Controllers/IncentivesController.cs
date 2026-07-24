using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PakSuzuki.Application.Features.Incentives;

namespace PakSuzuki.WebApi.Controllers;

[Authorize(Policy = "AdminOrAbove")]
public class IncentivesController : BaseApiController
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? search, [FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 20) =>
        Ok(await Mediator.Send(new GetIncentivesQuery(search, pageNumber, pageSize)));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id) =>
        Ok(await Mediator.Send(new GetIncentiveByIdQuery(id)));

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateIncentiveBody body)
    {
        var id = await Mediator.Send(new CreateIncentiveCommand(
            body.Name, body.Description, body.CriteriaType,
            body.StartDateUtc, body.EndDateUtc, body.Slabs, body.Participants));
        return CreatedAtAction(nameof(GetById), new { id }, new { id });
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateIncentiveBody body)
    {
        await Mediator.Send(new UpdateIncentiveCommand(
            id, body.Name, body.Description, body.CriteriaType,
            body.StartDateUtc, body.EndDateUtc, body.IsActive, body.Slabs, body.Participants));
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await Mediator.Send(new DeleteIncentiveCommand(id));
        return NoContent();
    }

    [HttpPost("{id:guid}/participants/{participantId:guid}/send-for-approval")]
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
