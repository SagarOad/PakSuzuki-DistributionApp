namespace PakSuzuki.Application.Common.Interfaces;

public record EmailMessage(
    string ToEmail,
    string Subject,
    string HtmlBody,
    string? ToName = null,
    string? TextBody = null);

/// <summary>Low-level transport: SMTP and/or local outbox.</summary>
public interface IEmailSender
{
    Task SendAsync(EmailMessage message, CancellationToken ct = default);
}

/// <summary>
/// High-level branded emails (OTP, approval decisions). Call these from handlers
/// when you want a specific notification — templates live in Infrastructure.
/// </summary>
public interface IEmailNotificationService
{
    Task SendOtpAsync(string toEmail, string otpCode, string purpose, int expiryMinutes, string? toName = null, CancellationToken ct = default);

    Task SendAccountApprovedAsync(string toEmail, string toName, string accountType, CancellationToken ct = default);

    Task SendAccountRejectedAsync(string toEmail, string toName, string accountType, string? remarks, CancellationToken ct = default);

    Task SendAccountSentBackAsync(string toEmail, string toName, string accountType, string? remarks, CancellationToken ct = default);

    /// <summary>Dev helper: send any of the known templates with sample content.</summary>
    Task SendSampleAsync(string toEmail, string templateKey, CancellationToken ct = default);
}
