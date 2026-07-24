using PakSuzuki.Application.Features.Auth.Commands;

namespace PakSuzuki.Application.Features.Auth.Commands;

public interface IIdentityService
{
    Task<LoginResult> LoginAsync(string userName, string password, CancellationToken ct = default);
    Task<Guid> CreateUserAsync(string userName, string email, string password, string role, CancellationToken ct = default);
    Task SetUserActiveAsync(Guid userId, bool isActive, CancellationToken ct = default);
    Task<LoginResult> RefreshTokenAsync(string refreshToken, CancellationToken ct = default);
    Task ForgotPasswordAsync(string userNameOrEmail, CancellationToken ct = default);
    /// <summary>Sends reset OTP email. Returns the OTP when Otp:DevReturnOtpInResponse is true (dev only).</summary>
    Task<string?> ForgotPasswordAndGetDevOtpAsync(string userNameOrEmail, CancellationToken ct = default);
    Task ResetPasswordAsync(string userNameOrEmail, string token, string newPassword, CancellationToken ct = default);
    Task ResetPasswordWithOtpAsync(string userNameOrEmail, string otp, string newPassword, CancellationToken ct = default);
    Task<UserProfileDto> GetProfileAsync(Guid userId, CancellationToken ct = default);
    Task UpdateProfileAsync(Guid userId, string userName, string email, string? phoneNumber, string? newPassword, CancellationToken ct = default);
}

public record UserProfileDto(Guid Id, string UserName, string Email, string? PhoneNumber, string Role);
