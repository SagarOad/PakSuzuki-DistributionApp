using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Auth.Commands;
using PakSuzuki.Application.Features.Maps.Queries;
using PakSuzuki.Domain.Entities;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Retailers.Commands;

/// <summary>
/// Register retailer. Pass <paramref name="DistributorId"/> from Find nearest / nearest API,
/// or omit / empty Guid to auto-assign the nearest approved distributor from lat/long.
/// </summary>
public record RegisterRetailerCommand(
    string Name, string Cnic, string MobileNumber, string Email, string Password,
    string BusinessName, string Ntn, string Iban, string BusinessAddress,
    double Latitude, double Longitude, Guid? DistributorId = null, List<string>? BusinessImageUrls = null
) : IRequest<RegisterRetailerResult>;

public record RegisterRetailerResult(Guid Id, Guid DistributorId, string DistributorName, double? DistanceKm);

public class RegisterRetailerCommandValidator : AbstractValidator<RegisterRetailerCommand>
{
    public RegisterRetailerCommandValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("name is required.")
            .MaximumLength(200).WithMessage("name must be at most 200 characters.");

        RuleFor(x => x.Cnic)
            .NotEmpty().WithMessage("cnic is required.")
            .Must(PakContactNormalizer.IsValidCnic)
            .WithMessage("cnic must be 13 digits (with or without dashes), e.g. 12345-1234567-1 or 1234512345671.");

        RuleFor(x => x.MobileNumber)
            .NotEmpty().WithMessage("mobileNumber is required.")
            .Must(PakContactNormalizer.IsValidPkMobile)
            .WithMessage("mobileNumber must be a Pakistani mobile like 03001234567 (11 digits starting with 03).");

        RuleFor(x => x.Email)
            .NotEmpty().WithMessage("email is required.")
            .EmailAddress().WithMessage("email must be a valid address (e.g. sameer@gmail.com).");

        RuleFor(x => x.Password)
            .NotEmpty().WithMessage("password is required.")
            .MinimumLength(8).WithMessage("password must be at least 8 characters.");

        RuleFor(x => x.BusinessName).NotEmpty().WithMessage("businessName is required.");
        RuleFor(x => x.Ntn).NotEmpty().WithMessage("ntn is required.");
        RuleFor(x => x.Iban).NotEmpty().WithMessage("iban is required.");
        RuleFor(x => x.BusinessAddress).NotEmpty().WithMessage("businessAddress is required.");

        RuleFor(x => x.Latitude)
            .InclusiveBetween(-90, 90).WithMessage("latitude must be between -90 and 90.");
        RuleFor(x => x.Longitude)
            .InclusiveBetween(-180, 180).WithMessage("longitude must be between -180 and 180.");
        RuleFor(x => x)
            .Must(x => Math.Abs(x.Latitude) > 0.0001 || Math.Abs(x.Longitude) > 0.0001)
            .WithMessage("Set your shop location (latitude/longitude) so we can assign the nearest distributor.");
    }
}

public class RegisterRetailerCommandHandler : IRequestHandler<RegisterRetailerCommand, RegisterRetailerResult>
{
    private readonly IApplicationDbContext _context;
    private readonly IIdentityService _identityService;
    private readonly ISender _mediator;

    public RegisterRetailerCommandHandler(
        IApplicationDbContext context, IIdentityService identityService, ISender mediator)
    {
        _context = context;
        _identityService = identityService;
        _mediator = mediator;
    }

    public async Task<RegisterRetailerResult> Handle(RegisterRetailerCommand request, CancellationToken ct)
    {
        var cnic = PakContactNormalizer.NormalizeCnic(request.Cnic);
        var mobile = PakContactNormalizer.NormalizeMobile(request.MobileNumber);

        Guid distributorId;
        string distributorName;
        double? distanceKm = null;

        if (request.DistributorId is { } explicitId && explicitId != Guid.Empty)
        {
            var distributor = await _context.Distributors.FirstOrDefaultAsync(d => d.Id == explicitId, ct)
                ?? throw new NotFoundException(nameof(Distributor), explicitId);

            if (distributor.ApprovalStatus != ApprovalStatus.Approved || !distributor.IsActive)
                throw new ConflictException(
                    "Selected distributor is not approved/active. Use Find nearest or GET /api/distributors/nearest.");

            distributorId = distributor.Id;
            distributorName = distributor.BusinessName;
        }
        else
        {
            // Auto-assign nearest approved distributor from shop lat/long.
            var nearest = await _mediator.Send(
                new GetNearestDistributorsQuery(request.Latitude, request.Longitude, null, 1), ct);
            if (nearest.Count == 0)
                throw new ConflictException(
                    "No approved distributor found near your location. Try again later or contact support.");

            distributorId = nearest[0].Id;
            distributorName = nearest[0].BusinessName;
            distanceKm = nearest[0].DistanceKm;
        }

        if (await _context.Retailers.AnyAsync(r => r.Cnic == cnic, ct))
            throw new ConflictException("A retailer with this CNIC is already registered.");

        if (await _context.Retailers.AnyAsync(r => r.Email == request.Email, ct))
            throw new ConflictException("A retailer with this email is already registered.");

        var userId = await _identityService.CreateUserAsync(
            request.Email, request.Email, request.Password, Roles.Retailer, ct);

        var retailer = new Retailer
        {
            ApplicationUserId = userId,
            RetailerCode = $"R{DateTime.UtcNow:yy}{Random.Shared.Next(1000, 9999)}",
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
            DistributorId = distributorId,
            DistributorApprovalStatus = ApprovalStatus.PendingReview,
            SuperAdminApprovalStatus = ApprovalStatus.PendingReview,
            IsActive = false
        };

        foreach (var url in request.BusinessImageUrls ?? Enumerable.Empty<string>())
        {
            if (string.IsNullOrWhiteSpace(url) || url.Equals("string", StringComparison.OrdinalIgnoreCase))
                continue;
            retailer.BusinessImages.Add(new BusinessImage { StorageUrl = url, FileName = Path.GetFileName(url) });
        }

        _context.Retailers.Add(retailer);
        await _context.SaveChangesAsync(ct);
        return new RegisterRetailerResult(retailer.Id, distributorId, distributorName, distanceKm);
    }
}
