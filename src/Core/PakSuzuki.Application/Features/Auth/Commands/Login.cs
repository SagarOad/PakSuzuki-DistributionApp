using FluentValidation;
using MediatR;
using Microsoft.Extensions.Configuration;
using PakSuzuki.Application.Common.Interfaces;

namespace PakSuzuki.Application.Features.Auth.Commands;

public record LoginCommand(string UserName, string Password) : IRequest<LoginResult>;

public record LoginResult(
    string Token,
    string RefreshToken,
    string UserName,
    string Role,
    Guid UserId,
    DateTime ExpiresAtUtc,
    bool RequiresCorrection = false,
    string? ApprovalRemarks = null,
    string? RegistrationStatus = null,
    Guid? ProfileId = null);

public class LoginCommandValidator : AbstractValidator<LoginCommand>
{
    public LoginCommandValidator()
    {
        RuleFor(x => x.UserName).NotEmpty();
        RuleFor(x => x.Password).NotEmpty();
    }
}

public class LoginCommandHandler : IRequestHandler<LoginCommand, LoginResult>
{
    private readonly IIdentityService _identityService;
    public LoginCommandHandler(IIdentityService identityService) => _identityService = identityService;

    public async Task<LoginResult> Handle(LoginCommand request, CancellationToken ct) =>
        await _identityService.LoginAsync(request.UserName, request.Password, ct);
}

// ---------- OTP ----------
public record SendOtpCommand(string Destination, string Purpose) : IRequest<SendOtpResult>;
public record SendOtpResult(bool Sent, DateTime ExpiresAtUtc, string? DevOtp);

public class SendOtpCommandValidator : AbstractValidator<SendOtpCommand>
{
    public SendOtpCommandValidator()
    {
        RuleFor(x => x.Destination).NotEmpty();
        RuleFor(x => x.Purpose).NotEmpty().Must(p =>
            p is "login" or "registration" or "forgot-password")
            .WithMessage("Purpose must be login, registration, or forgot-password.");
    }
}

public class SendOtpCommandHandler : IRequestHandler<SendOtpCommand, SendOtpResult>
{
    private readonly IOtpService _otpService;
    private readonly IEmailNotificationService _email;
    private readonly IConfiguration _configuration;

    public SendOtpCommandHandler(
        IOtpService otpService,
        IEmailNotificationService email,
        IConfiguration configuration)
    {
        _otpService = otpService;
        _email = email;
        _configuration = configuration;
    }

    public async Task<SendOtpResult> Handle(SendOtpCommand request, CancellationToken ct)
    {
        var code = await _otpService.GenerateAndStoreAsync(request.Destination, request.Purpose, ct);
        var expiryMinutes = int.Parse(_configuration["Otp:ExpiryMinutes"] ?? "5");
        var returnOtp = bool.Parse(_configuration["Otp:DevReturnOtpInResponse"] ?? "false");

        // Email destinations get a branded OTP message (SMTP and/or local outbox).
        if (request.Destination.Contains('@'))
        {
            await _email.SendOtpAsync(request.Destination, code, request.Purpose, expiryMinutes, ct: ct);
        }

        return new SendOtpResult(true, DateTime.UtcNow.AddMinutes(expiryMinutes), returnOtp ? code : null);
    }
}

public record VerifyOtpCommand(string Destination, string Purpose, string Code) : IRequest<VerifyOtpResult>;
public record VerifyOtpResult(bool Verified);

public class VerifyOtpCommandValidator : AbstractValidator<VerifyOtpCommand>
{
    public VerifyOtpCommandValidator()
    {
        RuleFor(x => x.Destination).NotEmpty();
        RuleFor(x => x.Purpose).NotEmpty();
        RuleFor(x => x.Code).NotEmpty().Length(4, 8);
    }
}

public class VerifyOtpCommandHandler : IRequestHandler<VerifyOtpCommand, VerifyOtpResult>
{
    private readonly IOtpService _otpService;
    public VerifyOtpCommandHandler(IOtpService otpService) => _otpService = otpService;

    public async Task<VerifyOtpResult> Handle(VerifyOtpCommand request, CancellationToken ct)
    {
        var ok = await _otpService.VerifyAsync(request.Destination, request.Purpose, request.Code, ct);
        if (!ok) throw new UnauthorizedAccessException("Invalid or expired OTP.");
        return new VerifyOtpResult(true);
    }
}

// ---------- Refresh / Forgot / Reset ----------
public record RefreshTokenCommand(string RefreshToken) : IRequest<LoginResult>;

public class RefreshTokenCommandValidator : AbstractValidator<RefreshTokenCommand>
{
    public RefreshTokenCommandValidator() => RuleFor(x => x.RefreshToken).NotEmpty();
}

public class RefreshTokenCommandHandler : IRequestHandler<RefreshTokenCommand, LoginResult>
{
    private readonly IIdentityService _identityService;
    public RefreshTokenCommandHandler(IIdentityService identityService) => _identityService = identityService;

    public Task<LoginResult> Handle(RefreshTokenCommand request, CancellationToken ct) =>
        _identityService.RefreshTokenAsync(request.RefreshToken, ct);
}

public record ForgotPasswordCommand(string UserNameOrEmail) : IRequest<ForgotPasswordResult>;
public record ForgotPasswordResult(bool Accepted, string? DevOtp);

public class ForgotPasswordCommandValidator : AbstractValidator<ForgotPasswordCommand>
{
    public ForgotPasswordCommandValidator() => RuleFor(x => x.UserNameOrEmail).NotEmpty();
}

public class ForgotPasswordCommandHandler : IRequestHandler<ForgotPasswordCommand, ForgotPasswordResult>
{
    private readonly IIdentityService _identityService;

    public ForgotPasswordCommandHandler(IIdentityService identityService) => _identityService = identityService;

    public async Task<ForgotPasswordResult> Handle(ForgotPasswordCommand request, CancellationToken ct)
    {
        var devOtp = await _identityService.ForgotPasswordAndGetDevOtpAsync(request.UserNameOrEmail, ct);
        return new ForgotPasswordResult(true, devOtp);
    }
}

public record ResetPasswordCommand(string UserNameOrEmail, string Token, string NewPassword) : IRequest;

public class ResetPasswordCommandValidator : AbstractValidator<ResetPasswordCommand>
{
    public ResetPasswordCommandValidator()
    {
        RuleFor(x => x.UserNameOrEmail).NotEmpty();
        RuleFor(x => x.Token).NotEmpty();
        RuleFor(x => x.NewPassword).NotEmpty().MinimumLength(8);
    }
}

public class ResetPasswordCommandHandler : IRequestHandler<ResetPasswordCommand>
{
    private readonly IIdentityService _identityService;
    public ResetPasswordCommandHandler(IIdentityService identityService) => _identityService = identityService;

    public Task Handle(ResetPasswordCommand request, CancellationToken ct) =>
        _identityService.ResetPasswordAsync(request.UserNameOrEmail, request.Token, request.NewPassword, ct);
}

public record ResetPasswordWithOtpCommand(string UserNameOrEmail, string Otp, string NewPassword) : IRequest;

public class ResetPasswordWithOtpCommandValidator : AbstractValidator<ResetPasswordWithOtpCommand>
{
    public ResetPasswordWithOtpCommandValidator()
    {
        RuleFor(x => x.UserNameOrEmail).NotEmpty();
        RuleFor(x => x.Otp).NotEmpty().Length(4, 8);
        RuleFor(x => x.NewPassword).NotEmpty().MinimumLength(8);
    }
}

public class ResetPasswordWithOtpCommandHandler : IRequestHandler<ResetPasswordWithOtpCommand>
{
    private readonly IIdentityService _identityService;
    public ResetPasswordWithOtpCommandHandler(IIdentityService identityService) => _identityService = identityService;

    public Task Handle(ResetPasswordWithOtpCommand request, CancellationToken ct) =>
        _identityService.ResetPasswordWithOtpAsync(request.UserNameOrEmail, request.Otp, request.NewPassword, ct);
}
