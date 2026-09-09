using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Distributors.Commands;
using PakSuzuki.Application.Features.Distributors.Queries;
using PakSuzuki.Application.Features.Maps.Queries;
using PakSuzuki.Domain.Enums;
using PakSuzuki.WebApi.Common;

namespace PakSuzuki.WebApi.Controllers;

public class DistributorsController : BaseApiController
{
    private readonly ICurrentUserService _currentUser;
    public DistributorsController(ICurrentUserService currentUser) => _currentUser = currentUser;

    /// <summary>
    /// Distributor sign-up. Sent as multipart/form-data because the applicant uploads real photos:
    /// an optional profile photo (<c>profileImage</c>) and at least one shop photo (<c>businessImages</c>).
    /// </summary>
    [HttpPost("register")]
    [AllowAnonymous]
    [RequestSizeLimit(50_000_000)]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> Register([FromForm] RegisterDistributorRequest request)
    {
        var imageErrors = ImageUploadRules.Validate(
            request.ProfileImage, request.BusinessImages, businessImagesRequired: true);
        if (imageErrors.Count > 0) return ValidationProblem(imageErrors);

        var id = await Mediator.Send(new RegisterDistributorCommand(
            request.Name, request.Cnic, request.MobileNumber, request.Email, request.Password,
            request.BusinessName, request.Ntn, request.Iban, request.BusinessAddress,
            request.Latitude, request.Longitude, request.RegionId,
            ImageUploadRules.ToUploadedImage(request.ProfileImage),
            ImageUploadRules.ToUploadedImages(request.BusinessImages)));

        return CreatedAtAction(nameof(GetById), new { id }, new
        {
            id,
            message = "Registered with your photos. Pak Suzuki Super Admin will review the application."
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
            request.Ntn, request.Iban, request.BusinessAddress, request.Latitude, request.Longitude,
            request.SapDealerCode, request.SapShipToCode));
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

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "SuperAdminOnly")]
    public async Task<IActionResult> SoftDelete(Guid id)
    {
        await Mediator.Send(new SoftDeleteDistributorCommand(id));
        return NoContent();
    }

    /// <summary>Add more shop photos to an existing distributor (multipart field name: files).</summary>
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
        var urls = await Mediator.Send(new UploadDistributorBusinessImagesCommand(id, payloads));
        return Ok(new { urls, message = "Images uploaded." });
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
        var url = await Mediator.Send(new UploadDistributorProfileImageCommand(id, file.FileName, stream));
        return Ok(new { url });
    }
}

/// <summary>Distributor sign-up form (multipart/form-data: text fields + photo files).</summary>
public class RegisterDistributorRequest
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
    public Guid RegionId { get; set; }

    /// <summary>Optional profile / owner photo.</summary>
    public IFormFile? ProfileImage { get; set; }

    /// <summary>Shop / business photos — at least one is required.</summary>
    public List<IFormFile>? BusinessImages { get; set; }
}

public record ApproveDistributorRequest(ApprovalStatus Decision, string? Remarks);
public record UpdateDistributorRequest(
    string Name, string MobileNumber, string Email, string BusinessName,
    string Ntn, string Iban, string BusinessAddress, double Latitude, double Longitude,
    string? SapDealerCode = null, string? SapShipToCode = null);
