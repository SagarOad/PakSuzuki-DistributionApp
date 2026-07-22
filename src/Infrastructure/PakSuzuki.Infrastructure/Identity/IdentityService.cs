using System.Security.Cryptography;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Auth.Commands;
using PakSuzuki.Domain.Enums;
using PakSuzuki.Infrastructure.Persistence;

namespace PakSuzuki.Infrastructure.Identity;

public class IdentityService : IIdentityService
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IJwtTokenGenerator _jwtTokenGenerator;
    private readonly ApplicationDbContext _dbContext;
    private readonly IConfiguration _configuration;
    private readonly IOtpService _otp;
    private readonly IEmailNotificationService _email;
    private readonly ILogger<IdentityService> _logger;

    public IdentityService(
        UserManager<ApplicationUser> userManager,
        IJwtTokenGenerator jwtTokenGenerator,
        ApplicationDbContext dbContext,
        IConfiguration configuration,
        IOtpService otp,
        IEmailNotificationService email,
        ILogger<IdentityService> logger)
    {
        _userManager = userManager;
        _jwtTokenGenerator = jwtTokenGenerator;
        _dbContext = dbContext;
        _configuration = configuration;
        _otp = otp;
        _email = email;
        _logger = logger;
    }

    public async Task<LoginResult> LoginAsync(string userName, string password, CancellationToken ct = default)
    {
        var user = await _userManager.FindByNameAsync(userName)
            ?? throw new UnauthorizedAccessException("Invalid credentials.");

        if (!await _userManager.CheckPasswordAsync(user, password))
            throw new UnauthorizedAccessException("Invalid credentials.");

        // Sent-back accounts may be inactive for normal use but must still sign in to correct + resubmit.
        var sentBack = await IsSentBackForCorrectionAsync(user, ct);
        if (!user.IsActive && !sentBack)
            throw new ConflictException("This account has been deactivated or is not yet activated.");

        await EnsureRegistrationAllowsLoginAsync(user, ct);
        return await IssueTokensAsync(user, ct);
    }

    public async Task<Guid> CreateUserAsync(string userName, string email, string password, string role, CancellationToken ct = default)
    {
        // Distributor/Retailer accounts stay inactive until the approval pipeline finishes
        // (except when temporarily re-activated for a "sent back" correction login).
        var requiresApproval = role is Roles.Distributor or Roles.Retailer;
        var user = new ApplicationUser
        {
            UserName = userName,
            Email = email,
            EmailConfirmed = true,
            IsActive = !requiresApproval
        };
        var result = await _userManager.CreateAsync(user, password);

        if (!result.Succeeded)
            throw new InvalidOperationException(string.Join("; ", result.Errors.Select(e => e.Description)));

        await _userManager.AddToRoleAsync(user, role);
        return user.Id;
    }

    public async Task SetUserActiveAsync(Guid userId, bool isActive, CancellationToken ct = default)
    {
        var user = await _userManager.FindByIdAsync(userId.ToString())
            ?? throw new NotFoundException(nameof(ApplicationUser), userId);
        user.IsActive = isActive;
        await _userManager.UpdateAsync(user);
    }

    public async Task<LoginResult> RefreshTokenAsync(string refreshToken, CancellationToken ct = default)
    {
        var user = await _userManager.Users.FirstOrDefaultAsync(u => u.RefreshToken == refreshToken, ct)
            ?? throw new UnauthorizedAccessException("Invalid refresh token.");

        if (user.RefreshTokenExpiryUtc is null || user.RefreshTokenExpiryUtc < DateTime.UtcNow)
            throw new UnauthorizedAccessException("Refresh token expired.");

        var sentBack = await IsSentBackForCorrectionAsync(user, ct);
        if (!user.IsActive && !sentBack)
            throw new ConflictException("This account has been deactivated or is not yet activated.");

        await EnsureRegistrationAllowsLoginAsync(user, ct);
        return await IssueTokensAsync(user, ct);
    }

    public async Task ForgotPasswordAsync(string userNameOrEmail, CancellationToken ct = default) =>
        await ForgotPasswordAndGetDevOtpAsync(userNameOrEmail, ct);

    public async Task<string?> ForgotPasswordAndGetDevOtpAsync(string userNameOrEmail, CancellationToken ct = default)
    {
        var user = await _userManager.FindByNameAsync(userNameOrEmail)
            ?? await _userManager.FindByEmailAsync(userNameOrEmail);

        // Always look successful to the client (no account enumeration).
        if (user?.Email is null) return null;

        var expiryMinutes = int.Parse(_configuration["Otp:ExpiryMinutes"] ?? "5");
        var code = await _otp.GenerateAndStoreAsync(user.Email, "forgot-password", ct);
        await _email.SendOtpAsync(user.Email, code, "forgot-password", expiryMinutes, user.UserName, ct);
        _logger.LogInformation("Password-reset OTP emailed to {Email}", user.Email);

        var returnOtp = bool.Parse(_configuration["Otp:DevReturnOtpInResponse"] ?? "false");
        return returnOtp ? code : null;
    }

    public async Task ResetPasswordAsync(string userNameOrEmail, string token, string newPassword, CancellationToken ct = default)
    {
        var user = await _userManager.FindByNameAsync(userNameOrEmail)
            ?? await _userManager.FindByEmailAsync(userNameOrEmail)
            ?? throw new UnauthorizedAccessException("Invalid reset request.");

        var result = await _userManager.ResetPasswordAsync(user, token, newPassword);
        if (!result.Succeeded)
            throw new InvalidOperationException(string.Join("; ", result.Errors.Select(e => e.Description)));
    }

    public async Task ResetPasswordWithOtpAsync(string userNameOrEmail, string otp, string newPassword, CancellationToken ct = default)
    {
        var user = await _userManager.FindByNameAsync(userNameOrEmail)
            ?? await _userManager.FindByEmailAsync(userNameOrEmail)
            ?? throw new UnauthorizedAccessException("Invalid or expired OTP.");

        if (string.IsNullOrWhiteSpace(user.Email))
            throw new UnauthorizedAccessException("Invalid or expired OTP.");

        // OTP is always stored against the account email from ForgotPassword.
        var ok = await _otp.VerifyAsync(user.Email, "forgot-password", otp, ct);
        if (!ok)
            throw new UnauthorizedAccessException("Invalid or expired OTP.");

        var token = await _userManager.GeneratePasswordResetTokenAsync(user);
        var result = await _userManager.ResetPasswordAsync(user, token, newPassword);
        if (!result.Succeeded)
            throw new InvalidOperationException(string.Join("; ", result.Errors.Select(e => e.Description)));
    }

    private async Task<bool> IsSentBackForCorrectionAsync(ApplicationUser user, CancellationToken ct)
    {
        var retailer = await _dbContext.Retailers.AsNoTracking()
            .FirstOrDefaultAsync(r => r.ApplicationUserId == user.Id, ct);
        if (retailer != null)
        {
            return retailer.DistributorApprovalStatus == ApprovalStatus.SentBackForCorrection
                || retailer.SuperAdminApprovalStatus == ApprovalStatus.SentBackForCorrection;
        }

        var distributor = await _dbContext.Distributors.AsNoTracking()
            .FirstOrDefaultAsync(d => d.ApplicationUserId == user.Id, ct);
        return distributor?.ApprovalStatus == ApprovalStatus.SentBackForCorrection;
    }

    /// <summary>
    /// Pending / rejected registrations cannot log in.
    /// SentBackForCorrection CAN log in so they can update details and resubmit.
    /// </summary>
    private async Task EnsureRegistrationAllowsLoginAsync(ApplicationUser user, CancellationToken ct)
    {
        var retailer = await _dbContext.Retailers.FirstOrDefaultAsync(r => r.ApplicationUserId == user.Id, ct);
        if (retailer != null)
        {
            if (retailer.IsBlocked)
                throw new ConflictException("Your retailer account is blocked due to inactivity. Contact your distributor.");

            if (retailer.DistributorApprovalStatus == ApprovalStatus.Rejected)
                throw new ConflictException("Your retailer registration was rejected by the distributor.");

            if (retailer.SuperAdminApprovalStatus == ApprovalStatus.Rejected)
                throw new ConflictException("Your retailer registration was rejected by Pak Suzuki.");

            // Allowed: sent back for correction (login → fix → resubmit)
            if (retailer.DistributorApprovalStatus == ApprovalStatus.SentBackForCorrection
                || retailer.SuperAdminApprovalStatus == ApprovalStatus.SentBackForCorrection)
                return;

            if (retailer.DistributorApprovalStatus != ApprovalStatus.Approved)
                throw new ConflictException("Your retailer registration is pending distributor approval. You can sign in after both distributor and Pak Suzuki approve your account.");

            if (retailer.SuperAdminApprovalStatus != ApprovalStatus.Approved || !retailer.IsActive)
                throw new ConflictException("Your retailer registration is pending Pak Suzuki (Super Admin) approval. You can sign in once final approval is complete.");

            return;
        }

        var distributor = await _dbContext.Distributors.FirstOrDefaultAsync(d => d.ApplicationUserId == user.Id, ct);
        if (distributor != null)
        {
            if (distributor.ApprovalStatus == ApprovalStatus.Rejected)
                throw new ConflictException("Your distributor registration was rejected.");

            if (distributor.ApprovalStatus == ApprovalStatus.SentBackForCorrection)
                return; // allowed to login and resubmit

            if (distributor.ApprovalStatus != ApprovalStatus.Approved || !distributor.IsActive)
                throw new ConflictException("Your distributor registration is pending Pak Suzuki approval. You can sign in once approved.");
        }
    }

    private async Task<LoginResult> IssueTokensAsync(ApplicationUser user, CancellationToken ct)
    {
        var roles = await _userManager.GetRolesAsync(user);
        var role = roles.FirstOrDefault() ?? throw new UnauthorizedAccessException("User has no assigned role.");

        var extraClaims = new Dictionary<string, string>();
        bool requiresCorrection = false;
        string? remarks = null;
        string? registrationStatus = null;
        Guid? profileId = null;

        var distributor = await _dbContext.Distributors.FirstOrDefaultAsync(d => d.ApplicationUserId == user.Id, ct);
        if (distributor != null)
        {
            extraClaims["distributorId"] = distributor.Id.ToString();
            profileId = distributor.Id;
            registrationStatus = distributor.ApprovalStatus.ToString();
            if (distributor.ApprovalStatus == ApprovalStatus.SentBackForCorrection)
            {
                requiresCorrection = true;
                remarks = distributor.ApprovalRemarks;
            }
        }

        var retailer = await _dbContext.Retailers.FirstOrDefaultAsync(r => r.ApplicationUserId == user.Id, ct);
        if (retailer != null)
        {
            extraClaims["retailerId"] = retailer.Id.ToString();
            profileId = retailer.Id;
            if (retailer.DistributorApprovalStatus == ApprovalStatus.SentBackForCorrection)
            {
                requiresCorrection = true;
                registrationStatus = retailer.DistributorApprovalStatus.ToString();
                remarks = retailer.ApprovalRemarks;
            }
            else if (retailer.SuperAdminApprovalStatus == ApprovalStatus.SentBackForCorrection)
            {
                requiresCorrection = true;
                registrationStatus = retailer.SuperAdminApprovalStatus.ToString();
                remarks = retailer.ApprovalRemarks;
            }
            else
            {
                registrationStatus = retailer.IsActive
                    ? "Approved"
                    : retailer.SuperAdminApprovalStatus.ToString();
            }
        }

        var token = _jwtTokenGenerator.GenerateToken(user.Id, user.UserName!, role, extraClaims);
        var refreshToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
        var refreshDays = int.Parse(_configuration["Jwt:RefreshTokenDays"] ?? "14");
        var expiryMinutes = int.Parse(_configuration["Jwt:ExpiryMinutes"] ?? "480");

        user.RefreshToken = refreshToken;
        user.RefreshTokenExpiryUtc = DateTime.UtcNow.AddDays(refreshDays);
        await _userManager.UpdateAsync(user);

        return new LoginResult(
            token, refreshToken, user.UserName!, role, user.Id,
            DateTime.UtcNow.AddMinutes(expiryMinutes),
            requiresCorrection, remarks, registrationStatus, profileId);
    }
}
