using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Settings;

namespace PakSuzuki.Application.Features.Orders.Commands;

/// <summary>
/// WHT (Advance Income Tax) is an order-summary charge — one system rate × order subtotal —
/// not a per-product line tax (doc §3.2).
/// </summary>
public static class OrderWhtCalculator
{
    public const string SettingKey = SettingKeys.TaxWhtPercent;

    /// <summary>Reads the configured system WHT %, or 0 when unset / invalid.</summary>
    public static async Task<decimal> GetSystemPercentAsync(
        IApplicationDbContext context, CancellationToken ct)
    {
        var raw = await context.SystemSettings
            .Where(s => s.Key == SettingKey)
            .Select(s => s.Value)
            .FirstOrDefaultAsync(ct);

        if (decimal.TryParse(raw, System.Globalization.NumberStyles.Number,
                System.Globalization.CultureInfo.InvariantCulture, out var percent)
            && percent >= 0 && percent <= 100)
            return percent;

        return 0m;
    }

    public static decimal AmountFromSubTotal(decimal subTotal, decimal whtPercent) =>
        Math.Round(subTotal * whtPercent / 100m, 2, MidpointRounding.AwayFromZero);

    /// <summary>
    /// Prefer the rate locked into an existing order (WhtAmount ÷ SubTotal) so amendments
    /// don't silently change tax when the system setting later changes.
    /// </summary>
    public static decimal PercentFromOrder(decimal subTotal, decimal whtAmount) =>
        subTotal > 0
            ? Math.Round(whtAmount / subTotal * 100m, 4, MidpointRounding.AwayFromZero)
            : 0m;
}
