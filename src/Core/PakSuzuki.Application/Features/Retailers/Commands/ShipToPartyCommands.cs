using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Retailers.Commands;

// 3.4: once a retailer's cumulative order quantity crosses a configurable threshold,
// they become eligible for direct Ship-to-Party delivery from Pak Suzuki (bypassing
// their distributor) and get their own SAP Business Partner code.
public record ShipToPartyEligibilityDto(
    bool IsEligible, decimal CurrentQuantity, decimal Threshold,
    bool HasSapBpCode, string? SapBusinessPartnerCode);

public record GetShipToPartyEligibilityQuery(Guid RetailerId) : IRequest<ShipToPartyEligibilityDto>;

public class GetShipToPartyEligibilityQueryHandler : IRequestHandler<GetShipToPartyEligibilityQuery, ShipToPartyEligibilityDto>
{
    private const decimal DefaultThreshold = 500m;

    // Orders below ApprovedByDistributor haven't been confirmed yet; Rejected/Cancelled
    // orders never fulfilled, so both are excluded even though their enum values are
    // numerically higher than ApprovedByDistributor.
    private static readonly OrderStatus[] ExcludedStatuses =
    {
        OrderStatus.RejectedByDistributor, OrderStatus.Cancelled
    };

    private readonly IApplicationDbContext _context;
    private readonly IConfiguration _configuration;

    public GetShipToPartyEligibilityQueryHandler(IApplicationDbContext context, IConfiguration configuration)
    {
        _context = context;
        _configuration = configuration;
    }

    public async Task<ShipToPartyEligibilityDto> Handle(GetShipToPartyEligibilityQuery request, CancellationToken ct)
    {
        var retailer = await _context.Retailers.FirstOrDefaultAsync(r => r.Id == request.RetailerId, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Retailer), request.RetailerId);

        var threshold = decimal.TryParse(_configuration["ShipToParty:QuantityThreshold"], out var configured)
            ? configured
            : DefaultThreshold;

        var currentQuantity = await _context.OrderItems
            .Where(i => i.Order.RetailerId == request.RetailerId)
            .Where(i => (int)i.Order.Status >= (int)OrderStatus.ApprovedByDistributor)
            .Where(i => !ExcludedStatuses.Contains(i.Order.Status))
            .SumAsync(i => i.ApprovedQuantity ?? i.RequestedQuantity, ct);

        var isEligible = currentQuantity >= threshold;

        if (isEligible != retailer.IsEligibleForDirectShipToParty)
        {
            retailer.IsEligibleForDirectShipToParty = isEligible;
            await _context.SaveChangesAsync(ct);
        }

        return new ShipToPartyEligibilityDto(
            isEligible, currentQuantity, threshold,
            !string.IsNullOrEmpty(retailer.SapBusinessPartnerCode), retailer.SapBusinessPartnerCode);
    }
}

// Creates the SAP Business Partner record for a Ship-to-Party-eligible retailer.
// Stubbed as a deterministic code here; replace with a real ISapIntegrationService
// call once Pak Suzuki shares the BP-creation SAP endpoint spec.
public record CreateShipToPartyBpCommand(Guid RetailerId) : IRequest<string>;

public class CreateShipToPartyBpCommandHandler : IRequestHandler<CreateShipToPartyBpCommand, string>
{
    private readonly IApplicationDbContext _context;
    public CreateShipToPartyBpCommandHandler(IApplicationDbContext context) => _context = context;

    public async Task<string> Handle(CreateShipToPartyBpCommand request, CancellationToken ct)
    {
        var retailer = await _context.Retailers.FirstOrDefaultAsync(r => r.Id == request.RetailerId, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Retailer), request.RetailerId);

        if (!retailer.IsEligibleForDirectShipToParty)
            throw new ConflictException("Retailer has not met the Ship-to-Party quantity threshold and is not eligible for a SAP Business Partner code.");

        if (string.IsNullOrEmpty(retailer.SapBusinessPartnerCode))
            retailer.SapBusinessPartnerCode = $"BP{retailer.RetailerCode}";

        retailer.IsEligibleForDirectShipToParty = true;

        await _context.SaveChangesAsync(ct);
        return retailer.SapBusinessPartnerCode;
    }
}
