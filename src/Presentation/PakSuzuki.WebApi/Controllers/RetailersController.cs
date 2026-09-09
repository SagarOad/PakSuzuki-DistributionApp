using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Retailers.Commands;
using PakSuzuki.Application.Features.Retailers.Queries;
using PakSuzuki.Domain.Enums;
using PakSuzuki.WebApi.Common;

namespace PakSuzuki.WebApi.Controllers;

public class RetailersController : BaseApiController
{
    private readonly ICurrentUserService _currentUser;
    public RetailersController(ICurrentUserService currentUser) => _currentUser = currentUser;

    /// <summary>
    /// Retailer sign-up (mobile + web). Sent as multipart/form-data because the applicant uploads real
    /// photos: an optional profile photo (<c>profileImage</c>) and at least one shop photo (<c>businessImages</c>).
    /// Omit distributorId to auto-assign the nearest approved distributor from lat/long.
    /// </summary>
    [HttpPost("register")]
    [AllowAnonymous]
    [RequestSizeLimit(50_000_000)]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> Register([FromForm] RegisterRetailerRequest request)
    {
        var imageErrors = ImageUploadRules.Validate(
            request.ProfileImage, request.BusinessImages, businessImagesRequired: true);
        if (imageErrors.Count > 0) return ValidationProblem(imageErrors);

        var result = await Mediator.Send(new RegisterRetailerCommand(
            request.Name, request.Cnic, request.MobileNumber, request.Email, request.Password,
            request.BusinessName, request.Ntn, request.Iban, request.BusinessAddress,
            request.Latitude, request.Longitude, request.DistributorId,
            ImageUploadRules.ToUploadedImage(request.ProfileImage),
            ImageUploadRules.ToUploadedImages(request.BusinessImages)));

        return CreatedAtAction(nameof(GetById), new { id = result.Id }, new
        {
            id = result.Id,
            distributorId = result.DistributorId,
            distributorName = result.DistributorName,
            distanceKm = result.DistanceKm,
            message = "Registered with your photos and assigned to a distributor. " +
                      "Your distributor and Pak Suzuki Super Admin will review the application."
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

    /// <summary>Add more shop photos to an existing retailer (multipart field name: files).</summary>
    [HttpPost("business-images/{id:guid}")]
    [Authorize]
    [RequestSizeLimit(50_000_000)]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> UploadBusinessImages(Guid id, [FromForm] List<IFormFile> files)
    {
        var errors = ImageUploadRules.Validate(
            null, files, businessImagesRequired: true, businessField: "files");
        if (errors.Count > 0) return ValidationProblem(errors);

        var payloads = ImageUploadRules.ToUploadedImages(files)
            .Select(i => (i.FileName, i.Content)).ToList();
        var urls = await Mediator.Send(new UploadRetailerBusinessImagesCommand(id, payloads));
        return Ok(new { urls });
    }

    /// <summary>Replace the profile / avatar photo (multipart field name: file). Mobile + web.</summary>
    [HttpPost("profile-image/{id:guid}")]
    [Authorize]
    [RequestSizeLimit(20_000_000)]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> UploadProfileImage(Guid id, IFormFile file)
    {
        var errors = ImageUploadRules.ValidateSingle(file);
        if (errors.Count > 0) return ValidationProblem(errors);

        await using var stream = file.OpenReadStream();
        var url = await Mediator.Send(new UploadRetailerProfileImageCommand(id, file.FileName, stream));
        return Ok(new { url });
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

    [HttpPatch("activate/{id:guid}")]
    [Authorize(Policy = "SuperAdminOnly")]
    public async Task<IActionResult> Activate(Guid id)
    {
        await Mediator.Send(new SetRetailerActiveCommand(id, true));
        return NoContent();
    }

    [HttpPatch("deactivate/{id:guid}")]
    [Authorize(Policy = "SuperAdminOnly")]
    public async Task<IActionResult> Deactivate(Guid id)
    {
        await Mediator.Send(new SetRetailerActiveCommand(id, false));
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "SuperAdminOnly")]
    public async Task<IActionResult> SoftDelete(Guid id)
    {
        await Mediator.Send(new SoftDeleteRetailerCommand(id));
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

/// <summary>Retailer sign-up form (multipart/form-data: text fields + photo files).</summary>
public class RegisterRetailerRequest
{
    public string Name { get; set; } = "";
    public string Cnic { get; set; } = "";
    public string MobileNumber { get; set; } = "";
    public string Email { get; set; } = "";
    public string Password { get; set; } = "";
    public string BusinessName { get; set; } = "";
    public string Ntn { get; set; } = "";
    public string Iban { get; set; } = "";
    public string BusinessAddress { get; set; } = "";
    public double Latitude { get; set; }
    public double Longitude { get; set; }

    /// <summary>Leave empty to auto-assign the nearest approved distributor.</summary>
    public Guid? DistributorId { get; set; }

    /// <summary>Optional profile / owner photo.</summary>
    public IFormFile? ProfileImage { get; set; }

    /// <summary>Shop / business photos — at least one is required.</summary>
    public List<IFormFile>? BusinessImages { get; set; }
}

public record UpdateRetailerRequest(
    string Name, string MobileNumber, string Email, string BusinessName,
    string Ntn, string Iban, string BusinessAddress, double Latitude, double Longitude);
