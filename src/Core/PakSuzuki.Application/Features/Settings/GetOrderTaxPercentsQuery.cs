using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Interfaces;

namespace PakSuzuki.Application.Features.Settings;

/// <summary>Active GST/FED % from tax rules (Rate is stored as fraction, e.g. 0.18 → 18).</summary>
public record OrderTaxPercentsDto(decimal GstPercent, decimal FedPercent);

public record GetOrderTaxPercentsQuery : IRequest<OrderTaxPercentsDto>;

public class GetOrderTaxPercentsQueryHandler : IRequestHandler<GetOrderTaxPercentsQuery, OrderTaxPercentsDto>
{
    private readonly IApplicationDbContext _context;
    public GetOrderTaxPercentsQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<OrderTaxPercentsDto> Handle(GetOrderTaxPercentsQuery request, CancellationToken ct)
    {
        var rules = await _context.TaxRules.AsNoTracking()
            .Where(t => t.IsActive)
            .ToListAsync(ct);

        static decimal ToPercent(decimal? rate) =>
            rate is null ? 0 : Math.Round(rate.Value * 100, 2);

        var gst = ToPercent(rules.FirstOrDefault(t => t.Code == "GST")?.Rate);
        var fed = ToPercent(rules.FirstOrDefault(t => t.Code == "FED")?.Rate);
        return new OrderTaxPercentsDto(gst, fed);
    }
}
