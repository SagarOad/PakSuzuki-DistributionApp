namespace PakSuzuki.Application.Common.Interfaces;

// Reads the authenticated user's claims (set by JWT middleware). Handlers use this
// instead of touching HttpContext directly, keeping Application free of ASP.NET deps.
public interface ICurrentUserService
{
    Guid? UserId { get; }
    string? Role { get; }
    Guid? DistributorId { get; } // populated when Role == Distributor
    Guid? RetailerId { get; }    // populated when Role == Retailer
    bool IsInRole(string role);
}
