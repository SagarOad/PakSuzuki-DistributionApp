using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Domain.Entities;
using PakSuzuki.Domain.Enums;
using PakSuzuki.Application.Features.Auth.Commands;

namespace PakSuzuki.Application.Features.Distributors.Commands;

// 3.1 registration fields, distributor sign-up step. Approval by SuperAdmin (PSMCL) is separate.
public record RegisterDistributorCommand(
    string Name, string Cnic, string MobileNumber, string Email, string Password,
    string BusinessName, string Ntn, string Iban, string BusinessAddress,
    double Latitude, double Longitude, Guid RegionId, List<string>? BusinessImageUrls = null
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
        RuleFor(x => x.RegionId).NotEmpty()
            .Must(id => id != Guid.Empty)
            .WithMessage("regionId is required. Call GET /api/regions and use a real id.");
    }
}

public class RegisterDistributorCommandHandler : IRequestHandler<RegisterDistributorCommand, Guid>
{
    private readonly IApplicationDbContext _context;
    private readonly IIdentityService _identityService;

    public RegisterDistributorCommandHandler(IApplicationDbContext context, IIdentityService identityService)
    {
        _context = context;
        _identityService = identityService;
    }

    public async Task<Guid> Handle(RegisterDistributorCommand request, CancellationToken ct)
    {
        if (!await _context.Regions.AnyAsync(r => r.Id == request.RegionId, ct))
            throw new NotFoundException(nameof(Region), request.RegionId);

        var cnic = PakContactNormalizer.NormalizeCnic(request.Cnic);
        var mobile = PakContactNormalizer.NormalizeMobile(request.MobileNumber);

        var userId = await _identityService.CreateUserAsync(
            request.Email, request.Email, request.Password, Roles.Distributor, ct);

        var distributor = new Distributor
        {
            ApplicationUserId = userId,
            DistributorCode = $"D{DateTime.UtcNow:yy}{Random.Shared.Next(1000, 9999)}",
            Name = request.Name.Trim(),
            Cnic = cnic,
            MobileNumber = mobile,
            Email = request.Email.Trim(),
            BusinessName = request.BusinessName.Trim(),
            Ntn = request.Ntn.Trim(),
            Iban = request.Iban.Trim(),
            BusinessAddress = request.BusinessAddress.Trim(),
            Latitude = request.Latitude,
            Longitude = request.Longitude,
            RegionId = request.RegionId,
            ApprovalStatus = ApprovalStatus.PendingReview,
            IsActive = false
        };

        foreach (var url in request.BusinessImageUrls ?? Enumerable.Empty<string>())
            distributor.BusinessImages.Add(new BusinessImage { StorageUrl = url, FileName = Path.GetFileName(url) });

        _context.Distributors.Add(distributor);
        await _context.SaveChangesAsync(ct);
        return distributor.Id;
    }
}
