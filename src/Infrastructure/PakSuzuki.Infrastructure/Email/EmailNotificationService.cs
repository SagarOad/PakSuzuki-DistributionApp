using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using PakSuzuki.Application.Common.Interfaces;

namespace PakSuzuki.Infrastructure.Email;

public class EmailNotificationService : IEmailNotificationService
{
    private readonly IEmailSender _sender;
    private readonly EmailOptions _options;
    private readonly ILogger<EmailNotificationService> _logger;

    public EmailNotificationService(
        IEmailSender sender,
        IOptions<EmailOptions> options,
        ILogger<EmailNotificationService> logger)
    {
        _sender = sender;
        _options = options.Value;
        _logger = logger;
    }

    public Task SendOtpAsync(string toEmail, string otpCode, string purpose, int expiryMinutes, string? toName = null, CancellationToken ct = default)
    {
        var purposeLabel = purpose.Trim().ToLowerInvariant() switch
        {
            "registration" => "registration verification",
            "login" => "login verification",
            "forgot-password" => "password reset",
            _ => "verification"
        };
        var (subject, html, text) = EmailTemplates.Otp(toName ?? toEmail, otpCode, purposeLabel, expiryMinutes);
        return _sender.SendAsync(new EmailMessage(toEmail, subject, html, toName, text), ct);
    }

    public Task SendAccountApprovedAsync(string toEmail, string toName, string accountType, CancellationToken ct = default)
    {
        var (subject, html, text) = EmailTemplates.Approved(toName, accountType);
        return _sender.SendAsync(new EmailMessage(toEmail, subject, html, toName, text), ct);
    }

    public Task SendAccountRejectedAsync(string toEmail, string toName, string accountType, string? remarks, CancellationToken ct = default)
    {
        var (subject, html, text) = EmailTemplates.Rejected(toName, accountType, remarks);
        return _sender.SendAsync(new EmailMessage(toEmail, subject, html, toName, text), ct);
    }

    public Task SendAccountSentBackAsync(string toEmail, string toName, string accountType, string? remarks, CancellationToken ct = default)
    {
        var correctionUrl = $"{_options.AppBaseUrl.TrimEnd('/')}{_options.CorrectionPath}";
        var (subject, html, text) = EmailTemplates.SentBack(toName, accountType, remarks, correctionUrl);
        return _sender.SendAsync(new EmailMessage(toEmail, subject, html, toName, text), ct);
    }

    public async Task SendSampleAsync(string toEmail, string templateKey, CancellationToken ct = default)
    {
        var key = templateKey.Trim().ToLowerInvariant();
        _logger.LogInformation("Sending sample email template={Template} to={To}", key, toEmail);

        switch (key)
        {
            case "otp":
                await SendOtpAsync(toEmail, "123456", "registration", 5, "Demo User", ct);
                break;
            case "approved":
                await SendAccountApprovedAsync(toEmail, "Demo User", "Distributor", ct);
                break;
            case "rejected":
                await SendAccountRejectedAsync(toEmail, "Demo User", "Distributor", "Incomplete business documents.", ct);
                break;
            case "sent-back":
            case "sentback":
            case "correction":
                await SendAccountSentBackAsync(toEmail, "Demo User", "Retailer", "Please re-upload a clearer CNIC photo and correct the business address.", ct);
                break;
            default:
                throw new ArgumentException($"Unknown template '{templateKey}'. Use: otp, approved, rejected, sent-back.");
        }
    }
}
