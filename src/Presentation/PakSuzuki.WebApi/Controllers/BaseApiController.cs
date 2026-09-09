using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace PakSuzuki.WebApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public abstract class BaseApiController : ControllerBase
{
    private ISender? _mediator;
    protected ISender Mediator => _mediator ??= HttpContext.RequestServices.GetRequiredService<ISender>();

    /// <summary>Same 400 shape the validation pipeline returns, so clients parse one format only.</summary>
    protected IActionResult ValidationProblem(Dictionary<string, string[]> errors) =>
        BadRequest(new { title = "Validation failed", status = 400, errors });
}
