using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Common.Models;
using PakSuzuki.Domain.Entities;
using PakSuzuki.Domain.Enums;
using PakSuzuki.Application.Features.Auth.Commands;

namespace PakSuzuki.Application.Features.Distributors.Commands;

// 3.1 registration fields, distributor sign-up step. Approval by SuperAdmin (PSMCL) is separate.
// Photos travel with the registration itself: the profile photo and the shop photos are stored and
// linked in the same unit of work, so a distributor is never persisted without its evidence images.
public record RegisterDistributorCommand(
    string Name, string Cnic, string MobileNumber, string Email, string Password,
    string BusinessName, string Ntn, string Iban, string BusinessAddress,
    double Latitude, double Longitude, Guid RegionId,
    UploadedImage? ProfileImage = null, List<UploadedImage>? BusinessImages = null
) : IRequest<Guid>;

public class RegisterDistributorCommandValidator : AbstractValidator<RegisterDistributorCommand>
{
    public RegisterDistributorCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("name is required.").MaximumLength(200);
        RuleFor(x => x.Cnic).NotEmpty().WithMessage("cnic is required.")
            .Must(PakContactNormalizer.IsValidCnic)
            .WithMessage("cnic must be 13 digits (with or without dashes), e.g. 12345-1234567-1.");
        RuleFor(x => x.MobileNumber).NotEmpty().WithMessage("mobileNumber is required.")
            .Must(PakContactNormalizer.IsValidPkMobile)
            .WithMessage("mobileNumber must be a Pakistani mobile like 03001234567.");
        RuleFor(x => x.Email).NotEmpty().WithMessage("email is required.")
            .EmailAddress().WithMessage("email must be a valid address, e.g. name@example.com.");
        RuleFor(x => x.Password).NotEmpty().WithMessage("password is required.")
            .MinimumLength(8).WithMessage("password must be at least 8 characters.");
        RuleFor(x => x.BusinessName).NotEmpty().WithMessage("businessName is required.");
        RuleFor(x => x.Ntn).NotEmpty().WithMessage("ntn is required.");
        RuleFor(x => x.Iban).NotEmpty().WithMessage("iban is required.");
        RuleFor(x => x.BusinessAddress).NotEmpty().WithMessage("businessAddress is required.");
        RuleFor(x => x.Latitude).InclusiveBetween(-90, 90).WithMessage("latitude must be between -90 and 90.");
        RuleFor(x => x.Longitude).InclusiveBetween(-180, 180).WithMessage("longitude must be between -180 and 180.");
        RuleFor(x => x)
            .Must(x => Math.Abs(x.Latitude) > 0.0001 || Math.Abs(x.Longitude) > 0.0001)
            .WithMessage("Set your shop location (latitude/longitude) on the map or via GPS.");
        RuleFor(x => x.RegionId).NotEmpty()
            .Must(id => id != Guid.Empty)
            .WithMessage("regionId is required. Call GET /api/regions and use a real id.");
        RuleFor(x => x.BusinessImages)
            .Must(images => images is { Count: > 0 })
            .WithMessage("At least one shop / business photo is required (form field: businessImages).");
    }
}

public class RegisterDistributorCommandHandler : IRequestHandler<RegisterDistributorCommand, Guid>
{
    private const string ProfileContainer = "distributor-profiles";
    private const string BusinessContainer = "distributor-images";

    private readonly IApplicationDbContext _context;
    private readonly IIdentityService _identityService;
    private readonly IFileStorageService _fileStorage;
    private readonly IAppNotificationService _notifications;

    public RegisterDistributorCommandHandler(
        IApplicationDbContext context,
        IIdentityService identityService,
        IFileStorageService fileStorage,
        IAppNotificationService notifications)
    {
        _context = context;
        _identityService = identityService;
        _fileStorage = fileStorage;
        _notifications = notifications;
    }

    public async Task<Guid> Handle(RegisterDistributorCommand request, CancellationToken ct)
    {
        if (!await _context.Regions.AnyAsync(r => r.Id == request.RegionId, ct))
            throw new NotFoundException(nameof(Region), request.RegionId);

        var cnic = PakContactNormalizer.NormalizeCnic(request.Cnic);
        var mobile = PakContactNormalizer.NormalizeMobile(request.MobileNumber);
        var email = request.Email.Trim();

        if (await _context.Distributors.AnyAsync(d => d.Cnic == cnic, ct))
            throw new ConflictException("A distributor with this CNIC is already registered.");

        if (await _context.Distributors.AnyAsync(d => d.Email == email, ct))
            throw new ConflictException("A distributor with this email is already registered.");

        if (await _context.Retailers.AnyAsync(r => r.Email == email, ct))
            throw new ConflictException("This email is already registered as a retailer. Use a different email.");

        if (await _context.Retailers.AnyAsync(r => r.Cnic == cnic, ct))
            throw new ConflictException("This CNIC is already registered as a retailer. Use a different CNIC.");

        var userId = await _identityService.CreateRegistrationUserAsync(
            email, request.Password, Roles.Distributor, ct);

        var images = new RegistrationImageStore(_fileStorage);

        try
        {
            var distributor = new Distributor
            {
                ApplicationUserId = userId,
                DistributorCode = $"D{DateTime.UtcNow:yy}{Random.Shared.Next(1000, 9999)}",
                Name = request.Name.Trim(),
                Cnic = cnic,
                MobileNumber = mobile,
                Email = email,
                BusinessName = request.BusinessName.Trim(),
                Ntn = request.Ntn.Trim(),
                Iban = request.Iban.Trim(),
                BusinessAddress = request.BusinessAddress.Trim(),
                Latitude = request.Latitude,
                Longitude = request.Longitude,
                RegionId = request.RegionId,
                ApprovalStatus = ApprovalStatus.PendingReview,
                IsActive = false,
                ProfileImageUrl = await images.SaveProfileImageAsync(request.ProfileImage, ProfileContainer, ct)
            };

            foreach (var image in await images.SaveBusinessImagesAsync(request.BusinessImages, BusinessContainer, ct))
                distributor.BusinessImages.Add(image);

            _context.Distributors.Add(distributor);
            await _context.SaveChangesAsync(ct);

            await _notifications.NotifyStaffAsync(
                "New distributor registration",
                $"{distributor.Name} registered and awaits Pak Suzuki approval.",
                NotificationCategories.Registration,
                $"/distributors/{distributor.Id}",
                distributor.Id,
                ct);

            return distributor.Id;
        }
        catch
        {
            // Don't leave an orphan AspNetUser or orphan image files behind a failed registration.
            await _identityService.DeleteUserAsync(userId, ct);
            await images.DiscardAsync(ct);
            throw;
        }
    }
}
