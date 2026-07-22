using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PakSuzuki.Application.Features.Shop.Banners;
using PakSuzuki.Application.Features.Shop.Products;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.WebApi.Controllers;

[Authorize]
public class ShopBannersController : BaseApiController
{
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] ShopBannerType? type,
        [FromQuery] string? search,
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 50) =>
        Ok(await Mediator.Send(new GetShopBannersQuery(type, search, pageNumber, pageSize)));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id) =>
        Ok(await Mediator.Send(new GetShopBannerByIdQuery(id)));

    [HttpPost]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> Create(UpsertShopBannerRequest request)
    {
        var id = await Mediator.Send(new UpsertShopBannerCommand(
            null, request.Type, request.ProductCode, request.BannerName, request.CategoryName,
            request.ImageUrl, request.ProductId, request.IsActive, request.SortOrder));
        return CreatedAtAction(nameof(GetById), new { id }, new { id });
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> Update(Guid id, UpsertShopBannerRequest request)
    {
        await Mediator.Send(new UpsertShopBannerCommand(
            id, request.Type, request.ProductCode, request.BannerName, request.CategoryName,
            request.ImageUrl, request.ProductId, request.IsActive, request.SortOrder));
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await Mediator.Send(new DeleteShopBannerCommand(id));
        return NoContent();
    }

    [HttpPost("{id:guid}/image")]
    [Authorize(Policy = "AdminOrAbove")]
    [RequestSizeLimit(20_000_000)]
    public async Task<IActionResult> UploadImage(Guid id, IFormFile file)
    {
        await using var stream = file.OpenReadStream();
        var url = await Mediator.Send(new UploadShopBannerImageCommand(id, file.FileName, stream));
        return Ok(new { url });
    }
}

[Authorize]
public class ShopController : BaseApiController
{
    [HttpPost("media")]
    [Authorize(Policy = "AdminOrAbove")]
    [RequestSizeLimit(20_000_000)]
    public async Task<IActionResult> UploadMedia(IFormFile file, [FromQuery] string folder = "shop-media")
    {
        await using var stream = file.OpenReadStream();
        var url = await Mediator.Send(new UploadShopMediaCommand(file.FileName, stream, folder));
        return Ok(new { url });
    }

    [HttpGet("products/{id:guid}")]
    public async Task<IActionResult> GetProduct(Guid id) =>
        Ok(await Mediator.Send(new GetShopProductByIdQuery(id)));

    [HttpPost("products")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> CreateProduct(UpsertShopProductRequest request)
    {
        var id = await Mediator.Send(ToCommand(null, request));
        return CreatedAtAction(nameof(GetProduct), new { id }, new { id });
    }

    [HttpPut("products/{id:guid}")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> UpdateProduct(Guid id, UpsertShopProductRequest request)
    {
        await Mediator.Send(ToCommand(id, request));
        return NoContent();
    }

    [HttpDelete("products/{id:guid}")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> DeleteProduct(Guid id)
    {
        await Mediator.Send(new DeleteShopProductCommand(id));
        return NoContent();
    }

    [HttpPost("products/{id:guid}/image")]
    [Authorize(Policy = "AdminOrAbove")]
    [RequestSizeLimit(20_000_000)]
    public async Task<IActionResult> UploadPrimaryImage(Guid id, IFormFile file)
    {
        await using var stream = file.OpenReadStream();
        var url = await Mediator.Send(new UploadProductPrimaryImageCommand(id, file.FileName, stream));
        return Ok(new { url });
    }

    [HttpPost("products/{id:guid}/section-images")]
    [Authorize(Policy = "AdminOrAbove")]
    [RequestSizeLimit(50_000_000)]
    public async Task<IActionResult> UploadSectionImages(Guid id, [FromForm] List<IFormFile> files)
    {
        var payloads = files.Select(f => (f.FileName, (Stream)f.OpenReadStream())).ToList();
        var urls = await Mediator.Send(new UploadProductSectionImagesCommand(id, payloads));
        return Ok(new { urls });
    }

    private static UpsertShopProductCommand ToCommand(Guid? id, UpsertShopProductRequest request) =>
        new(
            id, request.Sku, request.Name, request.Description, request.Bio, request.CategoryName,
            request.PrimaryImageUrl, request.IsPublished, request.InStock,
            request.Variants ?? new List<ProductVariantInput>(),
            request.SectionImageUrls);
}

public record UpsertShopBannerRequest(
    ShopBannerType Type,
    string ProductCode,
    string? BannerName,
    string CategoryName,
    string? ImageUrl,
    Guid? ProductId,
    bool IsActive = true,
    int SortOrder = 0);

public record UpsertShopProductRequest(
    string Sku,
    string Name,
    string? Description,
    string? Bio,
    string CategoryName,
    string? PrimaryImageUrl,
    bool IsPublished,
    bool InStock,
    List<ProductVariantInput>? Variants,
    List<string>? SectionImageUrls);
