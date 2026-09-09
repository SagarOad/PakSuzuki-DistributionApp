using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PakSuzuki.Application.Features.IncentiveSchemes;

namespace PakSuzuki.WebApi.Controllers;

[Authorize(Policy = "AdminOrAbove")]
[Route("api/incentive-schemes")]
public class IncentiveSchemesController : BaseApiController
{
    [HttpGet("product-groups")]
    public async Task<IActionResult> ListGroups([FromQuery] string? search, [FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 50) =>
        Ok(await Mediator.Send(new GetProductGroupsQuery(search, pageNumber, pageSize)));

    [HttpGet("product-groups/{id:guid}")]
    public async Task<IActionResult> GetGroup(Guid id) =>
        Ok(await Mediator.Send(new GetProductGroupByIdQuery(id)));

    [HttpPost("product-groups")]
    public async Task<IActionResult> CreateGroup([FromBody] UpsertProductGroupBody body)
    {
        var id = await Mediator.Send(new UpsertProductGroupCommand(
            null, body.Name, body.Description, body.IsActive, body.ProductIds));
        return CreatedAtAction(nameof(GetGroup), new { id }, new { id });
    }

    [HttpPut("product-groups/{id:guid}")]
    public async Task<IActionResult> UpdateGroup(Guid id, [FromBody] UpsertProductGroupBody body)
    {
        await Mediator.Send(new UpsertProductGroupCommand(
            id, body.Name, body.Description, body.IsActive, body.ProductIds));
        return NoContent();
    }

    [HttpDelete("product-groups/{id:guid}")]
    public async Task<IActionResult> DeleteGroup(Guid id)
    {
        await Mediator.Send(new DeleteProductGroupCommand(id));
        return NoContent();
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? search, [FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 50) =>
        Ok(await Mediator.Send(new GetIncentiveSchemesQuery(search, pageNumber, pageSize)));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id) =>
        Ok(await Mediator.Send(new GetIncentiveSchemeByIdQuery(id)));

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] UpsertSchemeBody body)
    {
        var id = await Mediator.Send(ToUpsert(null, body));
        return CreatedAtAction(nameof(GetById), new { id }, new { id });
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpsertSchemeBody body)
    {
        await Mediator.Send(ToUpsert(id, body));
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await Mediator.Send(new DeleteIncentiveSchemeCommand(id));
        return NoContent();
    }

    [HttpPost("preview-slab")]
    public async Task<IActionResult> PreviewSlab([FromBody] PreviewSlabBody body) =>
        Ok(await Mediator.Send(new PreviewSlabIncentiveQuery(
            body.TargetLiters, body.RatePerLiter, body.FixedBonusPkr, body.ProductGroupId)));

    [HttpGet("preview-period-stats")]
    public async Task<IActionResult> PreviewPeriodStats(
        [FromQuery] Guid productGroupId,
        [FromQuery] DateTime periodStartUtc,
        [FromQuery] DateTime periodEndUtc) =>
        Ok(await Mediator.Send(new PreviewPeriodPurchaseStatsQuery(productGroupId, periodStartUtc, periodEndUtc)));

    [HttpGet("{id:guid}/evaluate")]
    public async Task<IActionResult> Evaluate(Guid id, [FromQuery] Guid? distributorId) =>
        Ok(await Mediator.Send(new EvaluateIncentiveSchemeQuery(id, distributorId)));

    [HttpGet("{id:guid}/report/{distributorId:guid}.pdf")]
    public async Task<IActionResult> ReportPdf(
        Guid id,
        Guid distributorId,
        [FromServices] Application.Common.Interfaces.IIncentiveReportPdfService pdf)
    {
        var evaluation = await Mediator.Send(new EvaluateIncentiveSchemeQuery(id, distributorId));
        var row = evaluation.Distributors.FirstOrDefault()
            ?? throw new InvalidOperationException("Distributor not found in evaluation.");
        var signs = await Mediator.Send(new GetIncentiveSignatoriesQuery());
        var bytes = await pdf.BuildDistributorSchemePdfAsync(evaluation, row, signs);
        var fileName = $"Incentive_{evaluation.SchemeName}_{row.DistributorCode}.pdf"
            .Replace(' ', '_');
        return File(bytes, "application/pdf", fileName);
    }

    [HttpGet("signatories")]
    public async Task<IActionResult> GetSignatories() =>
        Ok(await Mediator.Send(new GetIncentiveSignatoriesQuery()));

    [HttpPut("signatories")]
    public async Task<IActionResult> UpdateSignatories([FromBody] SignatoriesBody body)
    {
        await Mediator.Send(new UpdateIncentiveSignatoriesCommand(body.PreparedBy, body.CheckedBy, body.ApprovedBy));
        return NoContent();
    }

    private static UpsertIncentiveSchemeCommand ToUpsert(Guid? id, UpsertSchemeBody body) =>
        new(
            id, body.Name, body.Description, body.ProductGroupId, body.SchemeType,
            body.CurrentPeriodStartUtc, body.CurrentPeriodEndUtc,
            body.PercentOfSalesRate, body.IsActive,
            body.DistributorIds ?? [],
            body.Slabs?.Select(s => new SchemeSlabInput(s.TargetLiters, s.RatePerLiter, s.FixedBonusPkr, s.SortOrder)).ToList());
}

public record UpsertProductGroupBody(string Name, string? Description, bool IsActive, List<Guid> ProductIds);
public record SchemeSlabBody(decimal TargetLiters, decimal RatePerLiter, decimal FixedBonusPkr, int SortOrder);
public record UpsertSchemeBody(
    string Name,
    string? Description,
    Guid ProductGroupId,
    string SchemeType,
    DateTime CurrentPeriodStartUtc,
    DateTime CurrentPeriodEndUtc,
    decimal? PercentOfSalesRate,
    bool IsActive,
    List<Guid>? DistributorIds,
    List<SchemeSlabBody>? Slabs);
public record PreviewSlabBody(decimal TargetLiters, decimal RatePerLiter, decimal FixedBonusPkr, Guid? ProductGroupId);
public record SignatoriesBody(string? PreparedBy, string? CheckedBy, string? ApprovedBy);
