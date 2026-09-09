using Microsoft.AspNetCore.Identity;

namespace PakSuzuki.Infrastructure.Identity;

// ASP.NET Core Identity user. Guid Id matches Domain entities' ApplicationUserId FK
// (Distributor.ApplicationUserId / Retailer.ApplicationUserId) for a 1:1 login link.
public class ApplicationUser : IdentityUser<Guid>
{
    public bool IsActive { get; set; } = true;
    public string? RefreshToken { get; set; }
    public DateTime? RefreshTokenExpiryUtc { get; set; }
    /// <summary>Updated on successful login. Used for 45-day inactivity deactivation.</summary>
    public DateTime? LastLoginAtUtc { get; set; }
}

public class ApplicationRole : IdentityRole<Guid>
{
}
