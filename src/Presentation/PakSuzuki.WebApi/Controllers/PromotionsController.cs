using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PakSuzuki.Application.Features.Promotions;

namespace PakSuzuki.WebApi.Controllers;

[Authorize(Policy = "AdminOrAbove")]
public class PromotionsController : BaseApiController
{
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? type,
        [FromQuery] string? search,
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 20) =>
        Ok(await Mediator.Send(new GetPromotionsQuery(type, search, pageNumber, pageSize)));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id) =>
        Ok(await Mediator.Send(new GetPromotionByIdQuery(id)));

    [HttpPost]
    [RequestSizeLimit(20_000_000)]
    public async Task<IActionResult> Create([FromForm] UpsertPromotionForm form)
    {
        Stream? stream = null;
        if (form.Image is { Length: > 0 })
            stream = form.Image.OpenReadStream();

        var id = await Mediator.Send(new UpsertPromotionCommand(
            null, form.Title, form.Type, null, form.RedirectUrl,
            form.TargetRoles, form.IsActive, form.StartDateUtc, form.EndDateUtc,
            stream, form.Image?.FileName));
        return CreatedAtAction(nameof(GetById), new { id }, new { id });
    }

    [HttpPut("{id:guid}")]
    [RequestSizeLimit(20_000_000)]
    public async Task<IActionResult> Update(Guid id, [FromForm] UpsertPromotionForm form)
    {
        Stream? stream = null;
        if (form.Image is { Length: > 0 })
            stream = form.Image.OpenReadStream();

        await Mediator.Send(new UpsertPromotionCommand(
            id, form.Title, form.Type, form.ExistingImageUrl, form.RedirectUrl,
            form.TargetRoles, form.IsActive, form.StartDateUtc, form.EndDateUtc,
            stream, form.Image?.FileName));
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await Mediator.Send(new DeletePromotionCommand(id));
        return NoContent();
    }
}

public class UpsertPromotionForm
{
    public string Title { get; set; } = string.Empty;
    public string Type { get; set; } = "PromotionBanner";
    public string? RedirectUrl { get; set; }
    public string TargetRoles { get; set; } = "Distributor,Retailer";
    public bool IsActive { get; set; } = true;
    public DateTime? StartDateUtc { get; set; }
    public DateTime? EndDateUtc { get; set; }
    public string? ExistingImageUrl { get; set; }
    public IFormFile? Image { get; set; }
}
