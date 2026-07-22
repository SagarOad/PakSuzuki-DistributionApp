using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Domain.Entities;

namespace PakSuzuki.Application.Features.Distributors.Commands;

// Profile edits post-registration; approval status/region changes go through their
// own dedicated commands (ApproveDistributorCommand, etc.), not this general update.
public record UpdateDistributorCommand(
    Guid Id, string Name, string MobileNumber, string Email, string BusinessName,
    string Ntn, string Iban, string BusinessAddress, double Latitude, double Longitude
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
    public SetDistributorActiveCommandHandler(IApplicationDbContext context) => _context = context;

    public async Task Handle(SetDistributorActiveCommand request, CancellationToken ct)
    {
        var distributor = await _context.Distributors.FirstOrDefaultAsync(d => d.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Distributor), request.Id);

        distributor.IsActive = request.IsActive;
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

    public UploadDistributorBusinessImagesCommandHandler(IApplicationDbContext context, IFileStorageService fileStorage)
    {
        _context = context;
        _fileStorage = fileStorage;
    }

    public async Task<List<string>> Handle(UploadDistributorBusinessImagesCommand request, CancellationToken ct)
    {
        var distributor = await _context.Distributors.Include(d => d.BusinessImages)
            .FirstOrDefaultAsync(d => d.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Distributor), request.Id);

        var uploadedUrls = new List<string>();

        foreach (var file in request.Files)
        {
            var url = await _fileStorage.UploadAsync(file.Content, file.FileName, ContainerName, ct);
            distributor.BusinessImages.Add(new BusinessImage
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
