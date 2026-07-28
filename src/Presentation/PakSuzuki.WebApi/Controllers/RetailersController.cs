using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Retailers.Commands;
using PakSuzuki.Application.Features.Retailers.Queries;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.WebApi.Controllers;

public class RetailersController : BaseApiController
{
    private readonly ICurrentUserService _currentUser;
    public RetailersController(ICurrentUserService currentUser) => _currentUser = currentUser;

    [HttpPost("register")]
    [AllowAnonymous]
    [Consumes("application/json")]
    public async Task<IActionResult> Register([FromBody] RegisterRetailerRequest request)
    {
        var result = await Mediator.Send(new RegisterRetailerCommand(
            request.Name, request.Cnic, request.MobileNumber, request.Email, request.Password,
            request.BusinessName, request.Ntn, request.Iban, request.BusinessAddress,
            request.Latitude, request.Longitude, request.DistributorId, request.BusinessImageUrls));
        return CreatedAtAction(nameof(GetById), new { id = result.Id }, new
        {
            id = result.Id,
            distributorId = result.DistributorId,
            distributorName = result.DistributorName,
            distanceKm = result.DistanceKm,
            message = "Registered and assigned to nearest/selected distributor. Upload business images via POST /api/retailers/business-images/{id}, then wait for distributor + Super Admin approval.",
            nextStep = $"POST /api/retailers/business-images/{result.Id}"
        });
    }

    /// <summary>
    /// Register retailer with business images in one multipart request (mobile-friendly).
    /// Form fields match JSON register; files field name: files.
    /// Omit distributorId to auto-assign the nearest approved distributor from lat/long.
    /// </summary>
    [HttpPost("register-with-images")]
    [AllowAnonymous]
    [RequestSizeLimit(50_000_000)]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> RegisterWithImages(
        [FromForm] RegisterRetailerRequest request,
        [FromForm] List<IFormFile>? files)
    {
        var result = await Mediator.Send(new RegisterRetailerCommand(
            request.Name, request.Cnic, request.MobileNumber, request.Email, request.Password,
            request.BusinessName, request.Ntn, request.Iban, request.BusinessAddress,
            request.Latitude, request.Longitude, request.DistributorId, null));

        if (files is { Count: > 0 })
        {
            var payloads = files.Where(f => f.Length > 0)
                .Select(f => (f.FileName, (Stream)f.OpenReadStream())).ToList();
            if (payloads.Count > 0)
                await Mediator.Send(new UploadRetailerBusinessImagesCommand(result.Id, payloads));
        }

        return CreatedAtAction(nameof(GetById), new { id = result.Id }, new
        {
            id = result.Id,
            distributorId = result.DistributorId,
            distributorName = result.DistributorName,
            distanceKm = result.DistanceKm
        });
    }

    [HttpGet]
    [Authorize]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? search,
        [FromQuery] Guid? distributorId,
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 20)
    {
        Guid? distributorScope;
        if (_currentUser.Role == Roles.Distributor)
        {
            distributorScope = _currentUser.DistributorId;
            if (distributorId is not null && distributorId != distributorScope)
                return Forbid();
        }
        else
        {
            distributorScope = distributorId;
        }

        return Ok(await Mediator.Send(new GetRetailersQuery(distributorScope, search, pageNumber, pageSize)));
    }

    [HttpGet("pending")]
    [Authorize]
    public async Task<IActionResult> GetPending([FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 20)
    {
        var forSuperAdmin = _currentUser.Role is Roles.SuperAdmin or Roles.Admin;
        Guid? distributorScope = _currentUser.Role == Roles.Distributor ? _currentUser.DistributorId : null;
        return Ok(await Mediator.Send(new GetPendingRetailersQuery(distributorScope, forSuperAdmin, pageNumber, pageSize)));
    }

    [HttpGet("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> GetById(Guid id)
    {
        Guid? distributorScope = _currentUser.Role == Roles.Distributor ? _currentUser.DistributorId : null;
        return Ok(await Mediator.Send(new GetRetailerByIdQuery(id, distributorScope)));
    }

    [HttpPost("distributor-review/{retailerId:guid}")]
    [Authorize(Policy = "DistributorOnly")]
    public async Task<IActionResult> DistributorReview(Guid retailerId, RetailerApprovalRequest request)
    {
        await Mediator.Send(new ApproveRetailerCommand(retailerId, Roles.Distributor, request.Decision, request.Remarks));
        return NoContent();
    }

    [HttpPost("superadmin-approve/{retailerId:guid}")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> SuperAdminApprove(Guid retailerId, RetailerApprovalRequest request)
    {
        await Mediator.Send(new ApproveRetailerCommand(retailerId, Roles.SuperAdmin, request.Decision, request.Remarks));
        return NoContent();
    }

    [HttpPut("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> Update(Guid id, UpdateRetailerRequest request)
    {
        await Mediator.Send(new UpdateRetailerCommand(
            id, request.Name, request.MobileNumber, request.Email, request.BusinessName,
            request.Ntn, request.Iban, request.BusinessAddress, request.Latitude, request.Longitude));
        return NoContent();
    }

    /// <summary>
    /// Retailer calls this after fixing data that was sent back for correction.
    /// Moves SentBackForCorrection → PendingReview so distributor/SuperAdmin sees it again.
    /// </summary>
    [HttpPost("resubmit/{id:guid}")]
    [Authorize(Policy = "RetailerOnly")]
    public async Task<IActionResult> Resubmit(Guid id)
    {
        await Mediator.Send(new ResubmitRetailerCommand(id));
        return NoContent();
    }

    [HttpPost("business-images/{id:guid}")]
    [AllowAnonymous]
    [RequestSizeLimit(50_000_000)]
    public async Task<IActionResult> UploadBusinessImages(Guid id, [FromForm] List<IFormFile> files)
    {
        if (files is null || files.Count == 0)
            return BadRequest(new
            {
                title = "Validation failed",
                status = 400,
                errors = new { files = new[] { "At least one image file is required (form field name: files)." } }
            });

        var payloads = files.Where(f => f.Length > 0)
            .Select(f => (f.FileName, (Stream)f.OpenReadStream())).ToList();
        if (payloads.Count == 0)
            return BadRequest(new
            {
                title = "Validation failed",
                status = 400,
                errors = new { files = new[] { "Uploaded files were empty." } }
            });

        var urls = await Mediator.Send(new UploadRetailerBusinessImagesCommand(id, payloads));
        return Ok(new { urls });
    }

    [HttpGet("blocking-status/{id:guid}")]
    [Authorize]
    public async Task<IActionResult> BlockingStatus(Guid id) =>
        Ok(await Mediator.Send(new GetRetailerBlockingStatusQuery(id)));

    [HttpPost("unblock/{id:guid}")]
    [Authorize(Roles = $"{Roles.SuperAdmin},{Roles.Admin},{Roles.Distributor}")]
    public async Task<IActionResult> Unblock(Guid id)
    {
        await Mediator.Send(new UnblockRetailerCommand(id));
        return NoContent();
    }

    [HttpGet("ship-to-party-eligibility/{id:guid}")]
    [Authorize]
    public async Task<IActionResult> ShipToPartyEligibility(Guid id) =>
        Ok(await Mediator.Send(new GetShipToPartyEligibilityQuery(id)));

    [HttpPost("ship-to-party/create-bp/{id:guid}")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> CreateShipToPartyBp(Guid id)
    {
        await Mediator.Send(new CreateShipToPartyBpCommand(id));
        return NoContent();
    }
}

public record RetailerApprovalRequest(ApprovalStatus Decision, string? Remarks);
public record RegisterRetailerRequest(
    string Name, string Cnic, string MobileNumber, string Email, string Password,
    string BusinessName, string Ntn, string Iban, string BusinessAddress,
    double Latitude, double Longitude, Guid? DistributorId = null, List<string>? BusinessImageUrls = null);
public record UpdateRetailerRequest(
    string Name, string MobileNumber, string Email, string BusinessName,
    string Ntn, string Iban, string BusinessAddress, double Latitude, double Longitude);
