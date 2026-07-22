using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
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
        RuleFor(x => x.Name).NotEmpty().WithMessage("Name is required.").MaximumLength(200);
        RuleFor(x => x.Cnic).NotEmpty().WithMessage("CNIC is required.")
            .Matches(@"^\d{5}-\d{7}-\d{1}$").WithMessage("CNIC must be in format 00000-0000000-0.");
        RuleFor(x => x.MobileNumber).NotEmpty().WithMessage("Mobile number is required.")
            .Matches(@"^03\d{9}$").WithMessage("Mobile number must be a valid PK number, e.g. 03001234567.");
        RuleFor(x => x.Email).NotEmpty().WithMessage("Email is required.")
            .EmailAddress().WithMessage("Email must be a valid address, e.g. name@example.com.");
        RuleFor(x => x.Password).NotEmpty().WithMessage("Password is required.")
            .MinimumLength(8).WithMessage("Password must be at least 8 characters.");
        RuleFor(x => x.BusinessName).NotEmpty().WithMessage("Business name is required.");
        RuleFor(x => x.Ntn).NotEmpty().WithMessage("NTN is required.");
        RuleFor(x => x.Iban).NotEmpty().WithMessage("IBAN is required.");
        RuleFor(x => x.BusinessAddress).NotEmpty().WithMessage("Business address is required.");
        RuleFor(x => x.Latitude).InclusiveBetween(-90, 90).WithMessage("Latitude must be between -90 and 90.");
        RuleFor(x => x.Longitude).InclusiveBetween(-180, 180).WithMessage("Longitude must be between -180 and 180.");
        RuleFor(x => x.RegionId).NotEmpty()
            .Must(id => id != Guid.Empty)
            .WithMessage("RegionId is required. Call GET /api/regions and use a real id (not 00000000-...).");
        // businessImageUrls optional for now (doc requires min 6 later via upload endpoint)
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

        var userId = await _identityService.CreateUserAsync(
            request.Email, request.Email, request.Password, Roles.Distributor, ct);

        var distributor = new Distributor
        {
            ApplicationUserId = userId,
            DistributorCode = $"D{DateTime.UtcNow:yy}{Random.Shared.Next(1000, 9999)}",
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
