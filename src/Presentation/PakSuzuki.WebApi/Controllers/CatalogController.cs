using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Catalog;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.WebApi.Controllers;

/// <summary>
/// Storefront catalog for Distributor web + Retailer mobile apps.
/// Returns published products/banners only.
/// </summary>
[Authorize]
public class CatalogController : BaseApiController
{
    private readonly ICurrentUserService _currentUser;
    public CatalogController(ICurrentUserService currentUser) => _currentUser = currentUser;

    [HttpGet("products")]
    public async Task<IActionResult> Products(
        [FromQuery] string? category,
        [FromQuery] string? search,
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 24) =>
        Ok(await Mediator.Send(new GetCatalogProductsQuery(
            _currentUser.Role ?? string.Empty, category, search, pageNumber, pageSize)));

    [HttpGet("products/{id:guid}")]
    public async Task<IActionResult> Product(Guid id) =>
        Ok(await Mediator.Send(new GetCatalogProductByIdQuery(id, _currentUser.Role ?? string.Empty)));

    [HttpGet("banners")]
    public async Task<IActionResult> Banners([FromQuery] ShopBannerType? type) =>
        Ok(await Mediator.Send(new GetCatalogBannersQuery(type)));
}
