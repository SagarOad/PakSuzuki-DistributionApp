using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Distributors.Commands;
using PakSuzuki.Application.Features.Distributors.Queries;
using PakSuzuki.Application.Features.Maps.Queries;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.WebApi.Controllers;

public class DistributorsController : BaseApiController
{
    private readonly ICurrentUserService _currentUser;
    public DistributorsController(ICurrentUserService currentUser) => _currentUser = currentUser;

    [HttpPost("register")]
    [AllowAnonymous]
    [Consumes("application/json")]
    public async Task<IActionResult> Register([FromBody] RegisterDistributorRequest request)
    {
        var id = await Mediator.Send(new RegisterDistributorCommand(
            request.Name, request.Cnic, request.MobileNumber, request.Email, request.Password,
            request.BusinessName, request.Ntn, request.Iban, request.BusinessAddress,
            request.Latitude, request.Longitude, request.RegionId, request.BusinessImageUrls));
        return CreatedAtAction(nameof(GetById), new { id }, new
        {
            id,
            message = "Registered. Upload images via POST /api/distributors/business-images/{id}.",
            nextStep = $"POST /api/distributors/business-images/{id}"
        });
    }

    /// <summary>Approved distributors for retailer signup (mobile). No auth required.</summary>
    [HttpGet("approved")]
    [AllowAnonymous]
    public async Task<IActionResult> GetApproved([FromQuery] Guid? regionId) =>
        Ok(await Mediator.Send(new GetApprovedDistributorsQuery(regionId)));

    /// <summary>
    /// Suggest closest approved distributors for retailer registration (GPS / map pin).
    /// Optional regionId narrows to that city after the retailer/distributor picks a region.
    /// </summary>
    [HttpGet("nearest")]
    [AllowAnonymous]
    public async Task<IActionResult> GetNearest(
        [FromQuery] double latitude,
        [FromQuery] double longitude,
        [FromQuery] Guid? regionId = null,
        [FromQuery] int take = 5) =>
        Ok(await Mediator.Send(new GetNearestDistributorsQuery(latitude, longitude, regionId, take)));

    [HttpGet]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> GetAll(
        [FromQuery] Guid? regionId,
        [FromQuery] string? status,
        [FromQuery] string? search,
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 20) =>
        Ok(await Mediator.Send(new GetDistributorsQuery(regionId, status, search, pageNumber, pageSize)));

    [HttpGet("pending")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> GetPending([FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 20) =>
        Ok(await Mediator.Send(new GetPendingDistributorsQuery(pageNumber, pageSize)));

    [HttpGet("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> GetById(Guid id)
    {
        if (_currentUser.Role == Roles.Distributor && _currentUser.DistributorId != id)
            return Forbid();
        if (_currentUser.Role is not (Roles.SuperAdmin or Roles.Admin or Roles.Distributor or Roles.RegionalHead))
            return Forbid();

        return Ok(await Mediator.Send(new GetDistributorByIdQuery(id)));
    }

    [HttpPost("approve/{distributorId:guid}")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> Approve(Guid distributorId, ApproveDistributorRequest request)
    {
        await Mediator.Send(new ApproveDistributorCommand(distributorId, request.Decision, request.Remarks));
        return NoContent();
    }

    /// <summary>
    /// Distributor calls this after fixing data that SuperAdmin sent back.
    /// Moves status SentBackForCorrection → PendingReview so SuperAdmin sees it again.
    /// </summary>
    [HttpPost("resubmit/{id:guid}")]
    [Authorize(Policy = "DistributorOnly")]
    public async Task<IActionResult> Resubmit(Guid id)
    {
        await Mediator.Send(new ResubmitDistributorCommand(id));
        return NoContent();
    }

    [HttpPut("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> Update(Guid id, UpdateDistributorRequest request)
    {
        await Mediator.Send(new UpdateDistributorCommand(
            id, request.Name, request.MobileNumber, request.Email, request.BusinessName,
            request.Ntn, request.Iban, request.BusinessAddress, request.Latitude, request.Longitude));
        return NoContent();
    }

    [HttpPatch("activate/{id:guid}")]
    [Authorize(Policy = "SuperAdminOnly")]
    public async Task<IActionResult> Activate(Guid id)
    {
        await Mediator.Send(new SetDistributorActiveCommand(id, true));
        return NoContent();
    }

    [HttpPatch("deactivate/{id:guid}")]
    [Authorize(Policy = "SuperAdminOnly")]
    public async Task<IActionResult> Deactivate(Guid id)
    {
        await Mediator.Send(new SetDistributorActiveCommand(id, false));
        return NoContent();
    }

    [HttpPost("business-images/{id:guid}")]
    [AllowAnonymous]
    [RequestSizeLimit(50_000_000)]
    public async Task<IActionResult> UploadBusinessImages(Guid id, [FromForm] List<IFormFile> files)
    {
        if (files is null || files.Count == 0)
            return BadRequest(new { title = "Validation failed", errors = new { files = new[] { "At least one image file is required (form field name: files)." } } });

        var payloads = files.Where(f => f.Length > 0).Select(f => (f.FileName, (Stream)f.OpenReadStream())).ToList();
        if (payloads.Count == 0)
            return BadRequest(new { title = "Validation failed", errors = new { files = new[] { "Uploaded files were empty." } } });

        var urls = await Mediator.Send(new UploadDistributorBusinessImagesCommand(id, payloads));
        return Ok(new { urls, message = "Images uploaded. Await Super Admin approval." });
    }
}

public record RegisterDistributorRequest(
    string Name, string Cnic, string MobileNumber, string Email, string Password,
    string BusinessName, string Ntn, string Iban, string BusinessAddress,
    double Latitude, double Longitude, Guid RegionId, List<string>? BusinessImageUrls = null);

public record ApproveDistributorRequest(ApprovalStatus Decision, string? Remarks);
public record UpdateDistributorRequest(
    string Name, string MobileNumber, string Email, string BusinessName,
    string Ntn, string Iban, string BusinessAddress, double Latitude, double Longitude);
