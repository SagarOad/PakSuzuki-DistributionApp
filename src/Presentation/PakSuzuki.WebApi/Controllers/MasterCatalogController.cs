using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.CatalogMaster;

namespace PakSuzuki.WebApi.Controllers;

[Authorize]
[Route("api/master-catalog")]
public class MasterCatalogController : BaseApiController
{
    private readonly ICurrentUserService _currentUser;
    public MasterCatalogController(ICurrentUserService currentUser) => _currentUser = currentUser;

    [HttpGet("lookups")]
    public async Task<IActionResult> Lookups() =>
        Ok(await Mediator.Send(new GetMasterCatalogLookupsQuery(_currentUser.Role ?? string.Empty)));

    [HttpGet("wizard-defaults")]
    public async Task<IActionResult> WizardDefaults(
        [FromQuery] Guid categoryId,
        [FromQuery] Guid? pTypeId,
        [FromQuery] string? sourceCode,
        [FromQuery] string? modelCode) =>
        Ok(await Mediator.Send(new GetWizardDefaultsQuery(categoryId, pTypeId, sourceCode, modelCode)));

    [HttpGet("products")]
    public async Task<IActionResult> List(
        [FromQuery] string? search,
        [FromQuery] Guid? categoryId,
        [FromQuery] Guid? productTypeId,
        [FromQuery] Guid? pTypeId,
        [FromQuery] string? sourceCode,
        [FromQuery] string? supplierCode,
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 50) =>
        Ok(await Mediator.Send(new GetMasterProductsQuery(
            _currentUser.Role ?? string.Empty,
            search,
            categoryId,
            productTypeId,
            pTypeId,
            sourceCode,
            supplierCode,
            pageNumber,
            pageSize)));

    [HttpGet("products/{id:guid}")]
    public async Task<IActionResult> GetById(Guid id) =>
        Ok(await Mediator.Send(new GetMasterProductByIdQuery(id, _currentUser.Role ?? string.Empty)));

    [HttpPost("products")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> Create([FromBody] UpsertMasterProductRequest request)
    {
        var id = await Mediator.Send(new UpsertMasterProductCommand(null, request));
        return CreatedAtAction(nameof(GetById), new { id }, new { id });
    }

    [HttpGet("products/bulk-template")]
    [Authorize(Policy = "AdminOrAbove")]
    public IActionResult DownloadLubricantBulkTemplate(
        [FromServices] PakSuzuki.Application.Common.Interfaces.ILubricantProductBulkExcelService excel)
    {
        var bytes = excel.BuildSampleTemplate();
        var fileName = $"PSMC_Lubricants_Chemicals_Bulk_Upload_{DateTime.UtcNow:yyyyMMdd}.xlsx";
        return File(
            bytes,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            fileName);
    }

    [HttpPost("products/bulk-upload")]
    [Authorize(Policy = "AdminOrAbove")]
    [RequestSizeLimit(30_000_000)]
    [RequestFormLimits(MultipartBodyLengthLimit = 30_000_000)]
    public async Task<IActionResult> BulkUploadLubricants(IFormFile? file)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { title = "Please choose an .xlsx file." });

        var ext = Path.GetExtension(file.FileName);
        if (!string.Equals(ext, ".xlsx", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { title = "Only .xlsx Excel files are accepted." });

        await using var stream = file.OpenReadStream();
        var result = await Mediator.Send(new BulkImportLubricantProductsCommand(stream));
        return Ok(result);
    }

    [HttpPut("products/{id:guid}")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpsertMasterProductRequest request)
    {
        await Mediator.Send(new UpsertMasterProductCommand(id, request));
        return NoContent();
    }

    [HttpDelete("products/{id:guid}")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await Mediator.Send(new DeleteMasterProductCommand(id));
        return NoContent();
    }

    [HttpPut("tax-rules/{id:guid}")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> UpdateTaxRule(Guid id, [FromBody] UpdateTaxRuleBody body)
    {
        await Mediator.Send(new UpdateTaxRuleCommand(id, body.Rate, body.AppliesTo, body.IsActive));
        return NoContent();
    }

    [HttpPost("thresholds")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> UpsertThreshold([FromBody] UpsertThresholdBody body)
    {
        var id = await Mediator.Send(new UpsertDeliveryThresholdCommand(
            body.Id, body.CategoryId, body.DistributorId, body.Unit, body.QuantityThreshold,
            body.ApproverRoles, body.IsActive));
        return Ok(new { id });
    }
}

public record UpdateTaxRuleBody(decimal Rate, string AppliesTo, bool IsActive);

public record UpsertThresholdBody(
    Guid? Id,
    Guid CategoryId,
    Guid? DistributorId,
    string Unit,
    decimal QuantityThreshold,
    IReadOnlyList<string> ApproverRoles,
    bool IsActive = true);
