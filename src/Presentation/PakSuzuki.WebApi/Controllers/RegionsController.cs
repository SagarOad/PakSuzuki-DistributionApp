using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PakSuzuki.Application.Features.Regions.Queries;

namespace PakSuzuki.WebApi.Controllers;

public class RegionsController : BaseApiController
{
    /// <summary>
    /// List regions for distributor registration (mobile/Swagger).
    /// Pick a regionId from this list — do not use the empty Guid Swagger shows by default.
    /// </summary>
    [HttpGet]
    [AllowAnonymous]
    public async Task<IActionResult> GetAll() =>
        Ok(await Mediator.Send(new GetRegionsQuery()));
}
