using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Auth.Commands;
using PakSuzuki.Domain.Entities;

namespace PakSuzuki.Application.Features.Distributors.Commands;

// Profile edits post-registration; approval status/region changes go through their
// own dedicated commands (ApproveDistributorCommand, etc.), not this general update.
public record UpdateDistributorCommand(
    Guid Id, string Name, string MobileNumber, string Email, string BusinessName,
    string Ntn, string Iban, string BusinessAddress, double Latitude, double Longitude,
    string? SapDealerCode = null, string? SapShipToCode = null
) : IRequest;

public class UpdateDistributorCommandValidator : AbstractValidator<UpdateDistributorCommand>
{
    public UpdateDistributorCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.MobileNumber).NotEmpty().Matches(@"^03\d{9}$").WithMessage("Mobile number must be a valid PK number, e.g. 03001234567");
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.BusinessName).NotEmpty();
        RuleFor(x => x.Ntn).NotEmpty();
        RuleFor(x => x.Iban).NotEmpty();
        RuleFor(x => x.BusinessAddress).NotEmpty();
    }
}

public class UpdateDistributorCommandHandler : IRequestHandler<UpdateDistributorCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;

    public UpdateDistributorCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    {
        _context = context;
        _currentUser = currentUser;
    }

    public async Task Handle(UpdateDistributorCommand request, CancellationToken ct)
    {
        var distributor = await _context.Distributors.FirstOrDefaultAsync(d => d.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Distributor), request.Id);

        var isStaff = _currentUser.IsInRole(Domain.Enums.Roles.SuperAdmin)
            || _currentUser.IsInRole(Domain.Enums.Roles.Admin);
        if (!isStaff && (_currentUser.DistributorId is null || _currentUser.DistributorId != distributor.Id))
            throw new ForbiddenAccessException("You can only update your own distributor profile.");

        distributor.Name = request.Name;
        distributor.MobileNumber = request.MobileNumber;
        distributor.Email = request.Email;
        distributor.BusinessName = request.BusinessName;
        distributor.Ntn = request.Ntn;
        distributor.Iban = request.Iban;
        distributor.BusinessAddress = request.BusinessAddress;
        distributor.Latitude = request.Latitude;
        distributor.Longitude = request.Longitude;

        if (isStaff)
        {
            if (request.SapDealerCode != null)
                distributor.SapDealerCode = string.IsNullOrWhiteSpace(request.SapDealerCode) ? null : request.SapDealerCode.Trim();
            if (request.SapShipToCode != null)
                distributor.SapShipToCode = string.IsNullOrWhiteSpace(request.SapShipToCode) ? null : request.SapShipToCode.Trim();
        }

        await _context.SaveChangesAsync(ct);
    }
}

/// <summary>
/// After SuperAdmin "Send Back", the distributor corrects data then resubmits.
/// This puts them back into the SuperAdmin pending queue.
/// </summary>
public record ResubmitDistributorCommand(Guid Id) : IRequest;

public class ResubmitDistributorCommandValidator : AbstractValidator<ResubmitDistributorCommand>
{
    public ResubmitDistributorCommandValidator() => RuleFor(x => x.Id).NotEmpty();
}

public class ResubmitDistributorCommandHandler : IRequestHandler<ResubmitDistributorCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    private readonly PakSuzuki.Application.Features.Auth.Commands.IIdentityService _identity;

    public ResubmitDistributorCommandHandler(
        IApplicationDbContext context,
        ICurrentUserService currentUser,
        PakSuzuki.Application.Features.Auth.Commands.IIdentityService identity)
    {
        _context = context;
        _currentUser = currentUser;
        _identity = identity;
    }

    public async Task Handle(ResubmitDistributorCommand request, CancellationToken ct)
    {
        var distributor = await _context.Distributors.FirstOrDefaultAsync(d => d.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Distributor), request.Id);

        // Distributor may only resubmit their own registration (unless SuperAdmin/Admin).
        var isStaff = _currentUser.IsInRole(Domain.Enums.Roles.SuperAdmin)
            || _currentUser.IsInRole(Domain.Enums.Roles.Admin);
        if (!isStaff && (_currentUser.DistributorId is null || _currentUser.DistributorId != distributor.Id))
            throw new ForbiddenAccessException("You can only resubmit your own distributor registration.");

        if (distributor.ApprovalStatus != Domain.Enums.ApprovalStatus.SentBackForCorrection)
            throw new ConflictException("Only registrations sent back for correction can be resubmitted.");

        distributor.ApprovalStatus = Domain.Enums.ApprovalStatus.PendingReview;
        distributor.ApprovalRemarks = null;
        distributor.IsActive = false;
        await _identity.SetUserActiveAsync(distributor.ApplicationUserId, false, ct);
        await _context.SaveChangesAsync(ct);
    }
}

// SuperAdmin can suspend/reactivate a distributor independently of the approval workflow.
public record SetDistributorActiveCommand(Guid Id, bool IsActive) : IRequest;

public class SetDistributorActiveCommandValidator : AbstractValidator<SetDistributorActiveCommand>
{
    public SetDistributorActiveCommandValidator() => RuleFor(x => x.Id).NotEmpty();
}

public class SetDistributorActiveCommandHandler : IRequestHandler<SetDistributorActiveCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly IIdentityService _identity;

    public SetDistributorActiveCommandHandler(IApplicationDbContext context, IIdentityService identity)
    {
        _context = context;
        _identity = identity;
    }

    public async Task Handle(SetDistributorActiveCommand request, CancellationToken ct)
    {
        var distributor = await _context.Distributors.FirstOrDefaultAsync(d => d.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Distributor), request.Id);

        distributor.IsActive = request.IsActive;
        await _identity.SetUserActiveAsync(distributor.ApplicationUserId, request.IsActive, ct);
        if (request.IsActive)
            await _identity.TouchLastLoginAsync(distributor.ApplicationUserId, ct);
        await _context.SaveChangesAsync(ct);
    }
}

/// <summary>Soft-delete distributor from Super Admin list (hidden + login disabled).</summary>
public record SoftDeleteDistributorCommand(Guid Id) : IRequest;

public class SoftDeleteDistributorCommandValidator : AbstractValidator<SoftDeleteDistributorCommand>
{
    public SoftDeleteDistributorCommandValidator() => RuleFor(x => x.Id).NotEmpty();
}

public class SoftDeleteDistributorCommandHandler : IRequestHandler<SoftDeleteDistributorCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly IIdentityService _identity;
    private readonly IDateTimeService _dateTime;

    public SoftDeleteDistributorCommandHandler(
        IApplicationDbContext context, IIdentityService identity, IDateTimeService dateTime)
    {
        _context = context;
        _identity = identity;
        _dateTime = dateTime;
    }

    public async Task Handle(SoftDeleteDistributorCommand request, CancellationToken ct)
    {
        var distributor = await _context.Distributors
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(d => d.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Distributor), request.Id);

        if (distributor.IsDeleted)
            throw new ConflictException("This distributor is already removed.");

        // Soft-deleted retailers still hold DistributorId — they must be moved first too.
        var retailerCount = await _context.Retailers
            .IgnoreQueryFilters()
            .CountAsync(r => r.DistributorId == request.Id, ct);
        if (retailerCount > 0)
            throw new ConflictException(
                $"This distributor has {retailerCount} retailer link(s). Reassign every retailer to a live distributor before deleting.");

        distributor.IsActive = false;
        distributor.IsDeleted = true;
        distributor.DeletedAtUtc = _dateTime.UtcNow;
        await _identity.SetUserActiveAsync(distributor.ApplicationUserId, false, ct);
        await _context.SaveChangesAsync(ct);
    }
}

// Lets a distributor add more business images after registration (doc requires a
// minimum of 6 at sign-up, but more can be added later - e.g. replacing a rejected shot).
public record UploadDistributorBusinessImagesCommand(Guid Id, List<(string FileName, Stream Content)> Files)
    : IRequest<List<string>>;

public class UploadDistributorBusinessImagesCommandValidator : AbstractValidator<UploadDistributorBusinessImagesCommand>
{
    public UploadDistributorBusinessImagesCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Files).NotEmpty().WithMessage("At least one image must be provided.");
    }
}

public class UploadDistributorBusinessImagesCommandHandler
    : IRequestHandler<UploadDistributorBusinessImagesCommand, List<string>>
{
    private const string ContainerName = "distributor-images";

    private readonly IApplicationDbContext _context;
    private readonly IFileStorageService _fileStorage;
    private readonly ICurrentUserService _currentUser;

    public UploadDistributorBusinessImagesCommandHandler(
        IApplicationDbContext context, IFileStorageService fileStorage, ICurrentUserService currentUser)
    {
        _context = context;
        _fileStorage = fileStorage;
        _currentUser = currentUser;
    }

    public async Task<List<string>> Handle(UploadDistributorBusinessImagesCommand request, CancellationToken ct)
    {
        var distributor = await _context.Distributors
            .FirstOrDefaultAsync(d => d.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Distributor), request.Id);

        var isStaff = _currentUser.IsInRole(Domain.Enums.Roles.SuperAdmin)
            || _currentUser.IsInRole(Domain.Enums.Roles.Admin);
        if (!isStaff && (_currentUser.DistributorId is null || _currentUser.DistributorId != distributor.Id))
            throw new ForbiddenAccessException("You can only upload images for your own distributorship.");

        var uploadedUrls = new List<string>();

        foreach (var file in request.Files)
        {
            var url = await _fileStorage.UploadAsync(file.Content, file.FileName, ContainerName, ct);
            // Added through the DbSet on purpose: Ids are assigned in the entity, so adding to the
            // parent's tracked collection would make EF treat the new row as an update.
            _context.BusinessImages.Add(new BusinessImage
            {
                DistributorId = distributor.Id,
                StorageUrl = url,
                FileName = file.FileName
            });
            uploadedUrls.Add(url);
        }

        await _context.SaveChangesAsync(ct);
        return uploadedUrls;
    }
}

public record UploadDistributorProfileImageCommand(Guid Id, string FileName, Stream Content) : IRequest<string>;

public class UploadDistributorProfileImageCommandValidator : AbstractValidator<UploadDistributorProfileImageCommand>
{
    public UploadDistributorProfileImageCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.FileName).NotEmpty();
        RuleFor(x => x.Content).NotNull();
    }
}

public class UploadDistributorProfileImageCommandHandler : IRequestHandler<UploadDistributorProfileImageCommand, string>
{
    private const string ContainerName = "distributor-profiles";
    private readonly IApplicationDbContext _context;
    private readonly IFileStorageService _fileStorage;
    private readonly ICurrentUserService _currentUser;

    public UploadDistributorProfileImageCommandHandler(
        IApplicationDbContext context, IFileStorageService fileStorage, ICurrentUserService currentUser)
    {
        _context = context;
        _fileStorage = fileStorage;
        _currentUser = currentUser;
    }

    public async Task<string> Handle(UploadDistributorProfileImageCommand request, CancellationToken ct)
    {
        var distributor = await _context.Distributors.FirstOrDefaultAsync(d => d.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Distributor), request.Id);

        var isStaff = _currentUser.IsInRole(Domain.Enums.Roles.SuperAdmin)
            || _currentUser.IsInRole(Domain.Enums.Roles.Admin);
        if (!isStaff && (_currentUser.DistributorId is null || _currentUser.DistributorId != distributor.Id))
            throw new ForbiddenAccessException("You can only upload your own profile image.");

        var url = await _fileStorage.UploadAsync(request.Content, request.FileName, ContainerName, ct);
        distributor.ProfileImageUrl = url;
        await _context.SaveChangesAsync(ct);
        return url;
    }
}
