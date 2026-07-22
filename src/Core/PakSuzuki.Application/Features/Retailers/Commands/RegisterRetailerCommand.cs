using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Auth.Commands;
using PakSuzuki.Domain.Entities;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Retailers.Commands;

public record RegisterRetailerCommand(
    string Name, string Cnic, string MobileNumber, string Email, string Password,
    string BusinessName, string Ntn, string Iban, string BusinessAddress,
    double Latitude, double Longitude, Guid DistributorId, List<string>? BusinessImageUrls = null
) : IRequest<Guid>;

public class RegisterRetailerCommandValidator : AbstractValidator<RegisterRetailerCommand>
{
    public RegisterRetailerCommandValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Name is required.")
            .MaximumLength(200).WithMessage("Name must be at most 200 characters.");

        RuleFor(x => x.Cnic)
            .NotEmpty().WithMessage("CNIC is required.")
            .Matches(@"^\d{5}-\d{7}-\d{1}$")
            .WithMessage("CNIC must be in format 12345-1234567-1 (5 digits - 7 digits - 1 digit).");

        RuleFor(x => x.MobileNumber)
            .NotEmpty().WithMessage("Mobile number is required.")
            .Matches(@"^03\d{9}$")
            .WithMessage("Mobile number must be a Pakistani number like 03001234567 (11 digits, starts with 03).");

        RuleFor(x => x.Email)
            .NotEmpty().WithMessage("Email is required.")
            .EmailAddress().WithMessage("Email must be a valid address (e.g. name@gmail.com).");

        RuleFor(x => x.Password)
            .NotEmpty().WithMessage("Password is required.")
            .MinimumLength(8).WithMessage("Password must be at least 8 characters.");

        RuleFor(x => x.BusinessName).NotEmpty().WithMessage("Business name is required.");
        RuleFor(x => x.Ntn).NotEmpty().WithMessage("NTN is required.");
        RuleFor(x => x.Iban).NotEmpty().WithMessage("IBAN is required.");
        RuleFor(x => x.BusinessAddress).NotEmpty().WithMessage("Business address is required.");

        RuleFor(x => x.Latitude)
            .InclusiveBetween(-90, 90).WithMessage("Latitude must be between -90 and 90 (Pakistan is roughly 24 to 37).");
        RuleFor(x => x.Longitude)
            .InclusiveBetween(-180, 180).WithMessage("Longitude must be between -180 and 180 (Pakistan is roughly 60 to 77).");

        RuleFor(x => x.DistributorId)
            .NotEmpty()
            .Must(id => id != Guid.Empty)
            .WithMessage("distributorId is required. Use an approved distributor id from GET /api/distributors/approved (this assigns the retailer to that distributor).");
    }
}

public class RegisterRetailerCommandHandler : IRequestHandler<RegisterRetailerCommand, Guid>
{
    private readonly IApplicationDbContext _context;
    private readonly IIdentityService _identityService;

    public RegisterRetailerCommandHandler(IApplicationDbContext context, IIdentityService identityService)
    {
        _context = context;
        _identityService = identityService;
    }

    public async Task<Guid> Handle(RegisterRetailerCommand request, CancellationToken ct)
    {
        // Retailer may only register under an approved, active distributor (no cross-distributor signup).
        var distributor = await _context.Distributors.FirstOrDefaultAsync(d => d.Id == request.DistributorId, ct)
            ?? throw new NotFoundException(nameof(Distributor), request.DistributorId);

        if (distributor.ApprovalStatus != ApprovalStatus.Approved || !distributor.IsActive)
            throw new ConflictException("Selected distributor is not approved/active. Choose an approved distributor from GET /api/distributors/approved.");

        var userId = await _identityService.CreateUserAsync(
            request.Email, request.Email, request.Password, Roles.Retailer, ct);

        var retailer = new Retailer
        {
            ApplicationUserId = userId,
            RetailerCode = $"R{DateTime.UtcNow:yy}{Random.Shared.Next(1000, 9999)}",
            Name = request.Name,
            Cnic = request.Cnic,
            MobileNumber = request.MobileNumber,
            Email = request.Email,
            BusinessName = request.BusinessName,
            Ntn = request.Ntn,
            Iban = request.Iban,
            BusinessAddress = request.BusinessAddress,
            Latitude = request.Latitude,
            Longitude = request.Longitude,
            DistributorId = request.DistributorId,
            DistributorApprovalStatus = ApprovalStatus.PendingReview,
            SuperAdminApprovalStatus = ApprovalStatus.PendingReview,
            IsActive = false
        };

        foreach (var url in request.BusinessImageUrls ?? Enumerable.Empty<string>())
        {
            // Ignore Swagger placeholders like "string"
            if (string.IsNullOrWhiteSpace(url) || url.Equals("string", StringComparison.OrdinalIgnoreCase))
                continue;
            retailer.BusinessImages.Add(new BusinessImage { StorageUrl = url, FileName = Path.GetFileName(url) });
        }

        _context.Retailers.Add(retailer);
        await _context.SaveChangesAsync(ct);
        return retailer.Id;
    }
}
