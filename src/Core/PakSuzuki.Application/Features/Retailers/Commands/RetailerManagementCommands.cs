using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Auth.Commands;
using PakSuzuki.Domain.Entities;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Retailers.Commands;

// Profile edits post-registration; approval status changes go through
// ApproveRetailerCommand, blocking/unblocking through their own dedicated commands.
public record UpdateRetailerCommand(
    Guid Id, string Name, string MobileNumber, string Email, string BusinessName,
    string Ntn, string Iban, string BusinessAddress, double Latitude, double Longitude,
    string? SapBusinessPartnerCode = null
) : IRequest;

public class UpdateRetailerCommandValidator : AbstractValidator<UpdateRetailerCommand>
{
    public UpdateRetailerCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.MobileNumber).NotEmpty().Matches(@"^03\d{9}$").WithMessage("Mobile number must be a valid PK number, e.g. 03001234567");
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.BusinessName).NotEmpty();
        RuleFor(x => x.Ntn).NotEmpty();
        RuleFor(x => x.Iban).NotEmpty();
        RuleFor(x => x.BusinessAddress).NotEmpty();
        RuleFor(x => x.Latitude).InclusiveBetween(-90, 90);
        RuleFor(x => x.Longitude).InclusiveBetween(-180, 180);
    }
}

public class UpdateRetailerCommandHandler : IRequestHandler<UpdateRetailerCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;

    public UpdateRetailerCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    {
        _context = context;
        _currentUser = currentUser;
    }

    public async Task Handle(UpdateRetailerCommand request, CancellationToken ct)
    {
        var retailer = await _context.Retailers.FirstOrDefaultAsync(r => r.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Retailer), request.Id);

        var isStaff = _currentUser.IsInRole(Roles.SuperAdmin) || _currentUser.IsInRole(Roles.Admin);
        if (!isStaff && _currentUser.Role == Roles.Retailer && _currentUser.RetailerId != retailer.Id)
            throw new ForbiddenAccessException("You can only update your own retailer profile.");
        if (!isStaff && _currentUser.Role == Roles.Distributor && _currentUser.DistributorId != retailer.DistributorId)
            throw new ForbiddenAccessException("You can only update retailers under your distributorship.");

        retailer.Name = request.Name;
        retailer.MobileNumber = request.MobileNumber;
        retailer.Email = request.Email;
        retailer.BusinessName = request.BusinessName;
        retailer.Ntn = request.Ntn;
        retailer.Iban = request.Iban;
        retailer.BusinessAddress = request.BusinessAddress;
        retailer.Latitude = request.Latitude;
        retailer.Longitude = request.Longitude;

        if (isStaff && request.SapBusinessPartnerCode != null)
        {
            retailer.SapBusinessPartnerCode = string.IsNullOrWhiteSpace(request.SapBusinessPartnerCode)
                ? null
                : request.SapBusinessPartnerCode.Trim();
        }

        await _context.SaveChangesAsync(ct);
    }
}

/// <summary>
/// After distributor/SuperAdmin "Send Back", retailer corrects data then resubmits.
/// Puts them back into the pending approval queue and disables login until approved.
/// </summary>
public record ResubmitRetailerCommand(Guid Id) : IRequest;

public class ResubmitRetailerCommandValidator : AbstractValidator<ResubmitRetailerCommand>
{
    public ResubmitRetailerCommandValidator() => RuleFor(x => x.Id).NotEmpty();
}

public class ResubmitRetailerCommandHandler : IRequestHandler<ResubmitRetailerCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    private readonly IIdentityService _identity;

    public ResubmitRetailerCommandHandler(
        IApplicationDbContext context,
        ICurrentUserService currentUser,
        IIdentityService identity)
    {
        _context = context;
        _currentUser = currentUser;
        _identity = identity;
    }

    public async Task Handle(ResubmitRetailerCommand request, CancellationToken ct)
    {
        var retailer = await _context.Retailers.FirstOrDefaultAsync(r => r.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Retailer), request.Id);

        var isStaff = _currentUser.IsInRole(Roles.SuperAdmin) || _currentUser.IsInRole(Roles.Admin);
        if (!isStaff && (_currentUser.RetailerId is null || _currentUser.RetailerId != retailer.Id))
            throw new ForbiddenAccessException("You can only resubmit your own retailer registration.");

        var sentBackByDistributor = retailer.DistributorApprovalStatus == ApprovalStatus.SentBackForCorrection;
        var sentBackBySuperAdmin = retailer.DistributorApprovalStatus == ApprovalStatus.Approved
            && retailer.SuperAdminApprovalStatus == ApprovalStatus.SentBackForCorrection;

        if (!sentBackByDistributor && !sentBackBySuperAdmin)
            throw new ConflictException("Only registrations sent back for correction can be resubmitted.");

        if (sentBackByDistributor)
        {
            retailer.DistributorApprovalStatus = ApprovalStatus.PendingReview;
            retailer.SuperAdminApprovalStatus = ApprovalStatus.PendingReview;
        }
        else
        {
            retailer.SuperAdminApprovalStatus = ApprovalStatus.PendingReview;
        }

        retailer.ApprovalRemarks = null;
        retailer.IsActive = false;
        await _identity.SetUserActiveAsync(retailer.ApplicationUserId, false, ct);
        await _context.SaveChangesAsync(ct);
    }
}

public record UploadRetailerBusinessImagesCommand(Guid Id, List<(string FileName, Stream Content)> Files)
    : IRequest<List<string>>;

public class UploadRetailerBusinessImagesCommandValidator : AbstractValidator<UploadRetailerBusinessImagesCommand>
{
    public UploadRetailerBusinessImagesCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Files).NotEmpty().WithMessage("At least one image must be provided.");
    }
}

public class UploadRetailerBusinessImagesCommandHandler
    : IRequestHandler<UploadRetailerBusinessImagesCommand, List<string>>
{
    private const string ContainerName = "retailer-images";

    private readonly IApplicationDbContext _context;
    private readonly IFileStorageService _fileStorage;
    private readonly ICurrentUserService _currentUser;

    public UploadRetailerBusinessImagesCommandHandler(
        IApplicationDbContext context, IFileStorageService fileStorage, ICurrentUserService currentUser)
    {
        _context = context;
        _fileStorage = fileStorage;
        _currentUser = currentUser;
    }

    public async Task<List<string>> Handle(UploadRetailerBusinessImagesCommand request, CancellationToken ct)
    {
        var retailer = await _context.Retailers
            .FirstOrDefaultAsync(r => r.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Retailer), request.Id);

        var isStaff = _currentUser.IsInRole(Roles.SuperAdmin) || _currentUser.IsInRole(Roles.Admin);
        var isSelf = _currentUser.RetailerId == retailer.Id;
        var isOwningDistributor = _currentUser.DistributorId == retailer.DistributorId;
        if (!isStaff && !isSelf && !isOwningDistributor)
            throw new ForbiddenAccessException("You can only upload images for your own shop.");

        var uploadedUrls = new List<string>();

        foreach (var file in request.Files)
        {
            var url = await _fileStorage.UploadAsync(file.Content, file.FileName, ContainerName, ct);
            // Added through the DbSet on purpose: Ids are assigned in the entity, so adding to the
            // parent's tracked collection would make EF treat the new row as an update.
            _context.BusinessImages.Add(new BusinessImage
            {
                RetailerId = retailer.Id,
                StorageUrl = url,
                FileName = file.FileName
            });
            uploadedUrls.Add(url);
        }

        await _context.SaveChangesAsync(ct);
        return uploadedUrls;
    }
}

public record UploadRetailerProfileImageCommand(Guid Id, string FileName, Stream Content) : IRequest<string>;

public class UploadRetailerProfileImageCommandValidator : AbstractValidator<UploadRetailerProfileImageCommand>
{
    public UploadRetailerProfileImageCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.FileName).NotEmpty();
        RuleFor(x => x.Content).NotNull();
    }
}

public class UploadRetailerProfileImageCommandHandler : IRequestHandler<UploadRetailerProfileImageCommand, string>
{
    private const string ContainerName = "retailer-profiles";
    private readonly IApplicationDbContext _context;
    private readonly IFileStorageService _fileStorage;
    private readonly ICurrentUserService _currentUser;

    public UploadRetailerProfileImageCommandHandler(
        IApplicationDbContext context, IFileStorageService fileStorage, ICurrentUserService currentUser)
    {
        _context = context;
        _fileStorage = fileStorage;
        _currentUser = currentUser;
    }

    public async Task<string> Handle(UploadRetailerProfileImageCommand request, CancellationToken ct)
    {
        var retailer = await _context.Retailers.FirstOrDefaultAsync(r => r.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Retailer), request.Id);

        var isStaff = _currentUser.IsInRole(Roles.SuperAdmin) || _currentUser.IsInRole(Roles.Admin);
        var isSelf = _currentUser.RetailerId == retailer.Id;
        var isOwningDistributor = _currentUser.DistributorId == retailer.DistributorId;
        if (!isStaff && !isSelf && !isOwningDistributor)
            throw new ForbiddenAccessException("You can only upload your own retailer profile image.");

        var url = await _fileStorage.UploadAsync(request.Content, request.FileName, ContainerName, ct);
        retailer.ProfileImageUrl = url;
        await _context.SaveChangesAsync(ct);
        return url;
    }
}

public record UnblockRetailerCommand(Guid Id) : IRequest;

public class UnblockRetailerCommandValidator : AbstractValidator<UnblockRetailerCommand>
{
    public UnblockRetailerCommandValidator() => RuleFor(x => x.Id).NotEmpty();
}

public class UnblockRetailerCommandHandler : IRequestHandler<UnblockRetailerCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly IIdentityService _identity;

    public UnblockRetailerCommandHandler(IApplicationDbContext context, IIdentityService identity)
    {
        _context = context;
        _identity = identity;
    }

    public async Task Handle(UnblockRetailerCommand request, CancellationToken ct)
    {
        var retailer = await _context.Retailers.FirstOrDefaultAsync(r => r.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Retailer), request.Id);

        retailer.IsBlocked = false;
        retailer.BlockedAtUtc = null;
        retailer.IsActive = true;
        await _identity.SetUserActiveAsync(retailer.ApplicationUserId, true, ct);
        await _identity.TouchLastLoginAsync(retailer.ApplicationUserId, ct);
        await _context.SaveChangesAsync(ct);
    }
}

/// <summary>SuperAdmin suspend / reactivate retailer (also clears inactivity block).</summary>
public record SetRetailerActiveCommand(Guid Id, bool IsActive) : IRequest;

public class SetRetailerActiveCommandValidator : AbstractValidator<SetRetailerActiveCommand>
{
    public SetRetailerActiveCommandValidator() => RuleFor(x => x.Id).NotEmpty();
}

public class SetRetailerActiveCommandHandler : IRequestHandler<SetRetailerActiveCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly IIdentityService _identity;

    public SetRetailerActiveCommandHandler(IApplicationDbContext context, IIdentityService identity)
    {
        _context = context;
        _identity = identity;
    }

    public async Task Handle(SetRetailerActiveCommand request, CancellationToken ct)
    {
        var retailer = await _context.Retailers.FirstOrDefaultAsync(r => r.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Retailer), request.Id);

        retailer.IsActive = request.IsActive;
        if (request.IsActive)
        {
            retailer.IsBlocked = false;
            retailer.BlockedAtUtc = null;
            await _identity.SetUserActiveAsync(retailer.ApplicationUserId, true, ct);
            await _identity.TouchLastLoginAsync(retailer.ApplicationUserId, ct);
        }
        else
        {
            await _identity.SetUserActiveAsync(retailer.ApplicationUserId, false, ct);
        }

        await _context.SaveChangesAsync(ct);
    }
}

/// <summary>Soft-delete retailer from Super Admin list (hidden + login disabled).</summary>
public record SoftDeleteRetailerCommand(Guid Id) : IRequest;

public class SoftDeleteRetailerCommandValidator : AbstractValidator<SoftDeleteRetailerCommand>
{
    public SoftDeleteRetailerCommandValidator() => RuleFor(x => x.Id).NotEmpty();
}

public class SoftDeleteRetailerCommandHandler : IRequestHandler<SoftDeleteRetailerCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly IIdentityService _identity;
    private readonly IDateTimeService _dateTime;

    public SoftDeleteRetailerCommandHandler(
        IApplicationDbContext context, IIdentityService identity, IDateTimeService dateTime)
    {
        _context = context;
        _identity = identity;
        _dateTime = dateTime;
    }

    public async Task Handle(SoftDeleteRetailerCommand request, CancellationToken ct)
    {
        var retailer = await _context.Retailers.FirstOrDefaultAsync(r => r.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Retailer), request.Id);

        retailer.IsActive = false;
        retailer.IsDeleted = true;
        retailer.DeletedAtUtc = _dateTime.UtcNow;
        await _identity.SetUserActiveAsync(retailer.ApplicationUserId, false, ct);
        await _context.SaveChangesAsync(ct);
    }
}
