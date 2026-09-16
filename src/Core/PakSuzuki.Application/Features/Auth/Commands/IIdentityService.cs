using PakSuzuki.Application.Features.Auth.Commands;

namespace PakSuzuki.Application.Features.Auth.Commands;

public interface IIdentityService
{
    Task<LoginResult> LoginAsync(string userName, string password, CancellationToken ct = default);
    Task<Guid> CreateUserAsync(string userName, string email, string password, string role, CancellationToken ct = default);

    /// <summary>
    /// Creates a login for distributor/retailer registration.
    /// Removes orphan AspNetUsers (email exists but not linked to a distributor/retailer)
    /// left by a failed prior attempt. Throws ConflictException if the email is already in use.
    /// </summary>
    Task<Guid> CreateRegistrationUserAsync(string email, string password, string role, CancellationToken ct = default);

    Task DeleteUserAsync(Guid userId, CancellationToken ct = default);
    Task SetUserActiveAsync(Guid userId, bool isActive, CancellationToken ct = default);
    /// <summary>Sets LastLoginAtUtc to now (approval / reactivate so the 45-day clock resets).</summary>
    Task TouchLastLoginAsync(Guid userId, CancellationToken ct = default);
    Task<LoginResult> RefreshTokenAsync(string refreshToken, CancellationToken ct = default);
    Task ForgotPasswordAsync(string userNameOrEmail, CancellationToken ct = default);
    /// <summary>Sends reset OTP email. Returns the OTP when Otp:DevReturnOtpInResponse is true (dev only).</summary>
    Task<string?> ForgotPasswordAndGetDevOtpAsync(string userNameOrEmail, CancellationToken ct = default);
    Task ResetPasswordAsync(string userNameOrEmail, string token, string newPassword, CancellationToken ct = default);
    Task ResetPasswordWithOtpAsync(string userNameOrEmail, string otp, string newPassword, CancellationToken ct = default);
    Task<UserProfileDto> GetProfileAsync(Guid userId, CancellationToken ct = default);
    Task UpdateProfileAsync(Guid userId, string userName, string email, string? phoneNumber, string? newPassword, CancellationToken ct = default);
    Task<IReadOnlyList<Guid>> GetUserIdsInRolesAsync(IEnumerable<string> roles, CancellationToken ct = default);
    /// <summary>All users in a role (active + inactive) for admin management screens.</summary>
    Task<IReadOnlyList<IdentityUserSummaryDto>> ListUsersInRoleAsync(string role, CancellationToken ct = default);
}

public record UserProfileDto(Guid Id, string UserName, string Email, string? PhoneNumber, string Role);

public record IdentityUserSummaryDto(Guid Id, string UserName, string Email, bool IsActive);
