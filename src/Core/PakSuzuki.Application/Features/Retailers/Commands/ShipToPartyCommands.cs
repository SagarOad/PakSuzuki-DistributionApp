using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Settings;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Retailers.Commands;

// 3.4: once a retailer's cumulative order quantity/amount crosses a configurable threshold,
// they become eligible for direct Ship-to-Party delivery from Pak Suzuki (bypassing
// their distributor) and get their own SAP Business Partner code.
public record ShipToPartyEligibilityDto(
    bool IsEligible, decimal CurrentQuantity, decimal Threshold,
    bool HasSapBpCode, string? SapBusinessPartnerCode);

public record GetShipToPartyEligibilityQuery(Guid RetailerId) : IRequest<ShipToPartyEligibilityDto>;

public class GetShipToPartyEligibilityQueryHandler : IRequestHandler<GetShipToPartyEligibilityQuery, ShipToPartyEligibilityDto>
{
    private const decimal DefaultThreshold = 10_000_000m;

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

        var threshold = await ResolveThresholdAsync(ct);

        // Prefer order grand totals (amount threshold from Settings UI).
        var currentAmount = await _context.Orders
            .Where(o => o.RetailerId == request.RetailerId)
            .Where(o => (int)o.Status >= (int)OrderStatus.ApprovedByDistributor)
            .Where(o => !ExcludedStatuses.Contains(o.Status))
            .SumAsync(o => (decimal?)o.GrandTotal, ct) ?? 0m;

        var isEligible = currentAmount >= threshold;

        if (isEligible != retailer.IsEligibleForDirectShipToParty)
        {
            retailer.IsEligibleForDirectShipToParty = isEligible;
            await _context.SaveChangesAsync(ct);
        }

        return new ShipToPartyEligibilityDto(
            isEligible, currentAmount, threshold,
            !string.IsNullOrEmpty(retailer.SapBusinessPartnerCode), retailer.SapBusinessPartnerCode);
    }

    private async Task<decimal> ResolveThresholdAsync(CancellationToken ct)
    {
        var setting = await _context.SystemSettings
            .FirstOrDefaultAsync(s => s.Key == SettingKeys.ShipToPartyAmountThreshold, ct);
        if (setting != null && decimal.TryParse(setting.Value, out var fromDb))
            return fromDb;

        if (decimal.TryParse(_configuration["ShipToParty:AmountThreshold"], out var fromConfig))
            return fromConfig;
        if (decimal.TryParse(_configuration["ShipToParty:QuantityThreshold"], out var legacy))
            return legacy;

        return DefaultThreshold;
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
