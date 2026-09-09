using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Common.Services;

public class PriceVisibilityService : IPriceVisibilityService
{
    private readonly IApplicationDbContext _context;
    public PriceVisibilityService(IApplicationDbContext context) => _context = context;

    public async Task<PriceVisibility> GetAsync(string? role, CancellationToken cancellationToken = default)
    {
        var key = string.IsNullOrWhiteSpace(role) ? "" : role.Trim();
        var aliases = AliasesFor(key);

        var rules = await _context.PriceVisibilityRules
            .AsNoTracking()
            .Where(r => r.IsActive)
            .ToListAsync(cancellationToken);

        var match = aliases
            .Select(alias => rules.FirstOrDefault(r => r.Role.Equals(alias, StringComparison.OrdinalIgnoreCase)))
            .FirstOrDefault(r => r is not null);

        if (match is not null)
            return new PriceVisibility(match.CanSeeCost, match.CanSeePurchase, match.CanSeeSale);

        return Fallback(key);
    }

    private static IReadOnlyList<string> AliasesFor(string role)
    {
        if (role.Equals(Roles.SuperAdmin, StringComparison.OrdinalIgnoreCase)
            || role.Equals(Roles.Admin, StringComparison.OrdinalIgnoreCase)
            || role.Equals(Roles.RegionalHead, StringComparison.OrdinalIgnoreCase)
            || role.Equals("PSMC", StringComparison.OrdinalIgnoreCase)
            || role.Equals("PSMCL", StringComparison.OrdinalIgnoreCase))
            return [role, "PSMC", Roles.SuperAdmin, Roles.Admin];

        if (role.Equals(Roles.Distributor, StringComparison.OrdinalIgnoreCase)
            || role.Equals("LubeDistributor", StringComparison.OrdinalIgnoreCase)
            || role.Equals("PartsDistributor", StringComparison.OrdinalIgnoreCase))
            return [role, Roles.Distributor, "LubeDistributor"];

        if (role.Equals(Roles.Retailer, StringComparison.OrdinalIgnoreCase))
            return [Roles.Retailer];

        return string.IsNullOrEmpty(role) ? [] : [role];
    }

    private static PriceVisibility Fallback(string role)
    {
        if (role is Roles.SuperAdmin or Roles.Admin or Roles.RegionalHead or "PSMC" or "PSMCL")
            return new PriceVisibility(true, true, true);
        if (role is Roles.Distributor or "LubeDistributor" or "PartsDistributor")
            return new PriceVisibility(false, true, true);
        return new PriceVisibility(false, false, true);
    }
}
