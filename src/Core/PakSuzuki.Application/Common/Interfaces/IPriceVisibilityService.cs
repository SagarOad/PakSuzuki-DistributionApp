namespace PakSuzuki.Application.Common.Interfaces;

public record PriceVisibility(bool CanSeeCost, bool CanSeePurchase, bool CanSeeSale);

public interface IPriceVisibilityService
{
    Task<PriceVisibility> GetAsync(string? role, CancellationToken cancellationToken = default);
}
