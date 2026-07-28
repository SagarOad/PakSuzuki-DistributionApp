using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Settings;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Retailers.Commands;

// 3.4: quantity-based Ship-to-Party eligibility. When cumulative approved qty
// crosses the threshold, retailer can receive direct Pak Suzuki delivery (BP in SAP).
public record ShipToPartyEligibilityDto(
    bool IsEligible, decimal CurrentQuantity, decimal Threshold,
    bool HasSapBpCode, string? SapBusinessPartnerCode);

public record GetShipToPartyEligibilityQuery(Guid RetailerId) : IRequest<ShipToPartyEligibilityDto>;

public class GetShipToPartyEligibilityQueryHandler : IRequestHandler<GetShipToPartyEligibilityQuery, ShipToPartyEligibilityDto>
{
    private const decimal DefaultQuantityThreshold = 1000m;

    private static readonly OrderStatus[] ExcludedStatuses =
    {
        OrderStatus.RejectedByDistributor, OrderStatus.Cancelled, OrderStatus.SentBackForModification
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

        var threshold = await ResolveQuantityThresholdAsync(ct);

        var currentQuantity = await _context.OrderItems
            .Where(i => i.Order.RetailerId == request.RetailerId)
            .Where(i => (int)i.Order.Status >= (int)OrderStatus.ApprovedByDistributor)
            .Where(i => !ExcludedStatuses.Contains(i.Order.Status))
            .SumAsync(i => (decimal?)(i.ApprovedQuantity ?? i.RequestedQuantity), ct) ?? 0m;

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

    private async Task<decimal> ResolveQuantityThresholdAsync(CancellationToken ct)
    {
        var qtySetting = await _context.SystemSettings
            .FirstOrDefaultAsync(s => s.Key == SettingKeys.ShipToPartyQuantityThreshold, ct);
        if (qtySetting != null && decimal.TryParse(qtySetting.Value, out var fromQtyDb))
            return fromQtyDb;

        // Legacy amount key still accepted as numeric threshold until Settings UI migrates.
        var amountSetting = await _context.SystemSettings
            .FirstOrDefaultAsync(s => s.Key == SettingKeys.ShipToPartyAmountThreshold, ct);
        if (amountSetting != null && decimal.TryParse(amountSetting.Value, out var fromAmountDb)
            && fromAmountDb < 100_000m)
            return fromAmountDb;

        if (decimal.TryParse(_configuration["ShipToParty:QuantityThreshold"], out var fromConfig))
            return fromConfig;

        return DefaultQuantityThreshold;
    }
}

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

        // Queue BP creation for middleware/SAP (payload schema TBD).
        _context.SapOutboundQueues.Add(new Domain.Entities.SapOutboundQueue
        {
            QueueType = "BpCreate",
            Status = "Pending",
            CorrelationKey = retailer.RetailerCode,
            PayloadJson = System.Text.Json.JsonSerializer.Serialize(new
            {
                retailerId = retailer.Id,
                retailerCode = retailer.RetailerCode,
                sapBusinessPartnerCode = retailer.SapBusinessPartnerCode
            })
        });

        await _context.SaveChangesAsync(ct);
        return retailer.SapBusinessPartnerCode;
    }
}
