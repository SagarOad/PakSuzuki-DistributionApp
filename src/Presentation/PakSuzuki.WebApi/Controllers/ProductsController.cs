using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Products.Commands;
using PakSuzuki.Application.Features.Products.Queries;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.WebApi.Controllers;

[Authorize]
public class ProductsController : BaseApiController
{
    private readonly ICurrentUserService _currentUser;
    public ProductsController(ICurrentUserService currentUser) => _currentUser = currentUser;

    [HttpGet]
    public async Task<IActionResult> GetProducts(
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? search = null) =>
        Ok(await Mediator.Send(new GetProductsQuery(_currentUser.Role ?? string.Empty, pageNumber, pageSize, search)));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id) =>
        Ok(await Mediator.Send(new GetProductByIdQuery(id, _currentUser.Role ?? string.Empty)));

    [HttpPost]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> Create(CreateProductCommand command)
    {
        var id = await Mediator.Send(command);
        return CreatedAtAction(nameof(GetById), new { id }, new { id });
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> Update(Guid id, UpdateProductRequest request)
    {
        await Mediator.Send(new UpdateProductCommand(
            id, request.Name, request.Description, request.Category, request.BaseUnit, request.ConversionFactorToBaseUnit));
        return NoContent();
    }

    [HttpPatch("deactivate/{id:guid}")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> Deactivate(Guid id)
    {
        await Mediator.Send(new DeactivateProductCommand(id));
        return NoContent();
    }

    [HttpPost("bulk-upload")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> BulkUpload(List<BulkProductRow> rows) =>
        Ok(await Mediator.Send(new BulkUploadProductsCommand(rows)));

    [HttpPost("prices/{id:guid}")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> AddPrice(Guid id, AddProductPriceRequest request)
    {
        var priceId = await Mediator.Send(new AddProductPriceCommand(
            id, request.CostPrice, request.SellingPrice, request.RetailPrice,
            request.GstPercent, request.FedPercent, request.WhtPercent));
        return Ok(new { id = priceId });
    }

    [HttpGet("price-history/{id:guid}")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> PriceHistory(Guid id) =>
        Ok(await Mediator.Send(new GetProductPriceHistoryQuery(id)));

    [HttpGet("units/convert")]
    public async Task<IActionResult> ConvertUnits(
        [FromQuery] Guid productId,
        [FromQuery] decimal quantity,
        [FromQuery] UnitOfMeasure fromUnit,
        [FromQuery] UnitOfMeasure toUnit) =>
        Ok(await Mediator.Send(new ConvertUnitsQuery(productId, quantity, fromUnit, toUnit)));
}

public record UpdateProductRequest(
    string Name, string? Description, ProductCategory Category, UnitOfMeasure BaseUnit, decimal ConversionFactorToBaseUnit);

public record AddProductPriceRequest(
    decimal CostPrice, decimal SellingPrice, decimal RetailPrice,
    decimal GstPercent, decimal FedPercent, decimal WhtPercent);
