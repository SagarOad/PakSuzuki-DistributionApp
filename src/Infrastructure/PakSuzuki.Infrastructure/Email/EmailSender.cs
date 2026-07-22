using System.Text;
using System.Text.RegularExpressions;
using MailKit.Security;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MimeKit;
using PakSuzuki.Application.Common.Interfaces;

namespace PakSuzuki.Infrastructure.Email;

/// <summary>
/// Dual-mode sender:
/// 1) Always can save HTML to a local outbox folder (no credentials needed).
/// 2) When Smtp:Enabled=true, also delivers via SMTP (Mailtrap / Gmail / etc.).
/// </summary>
public class EmailSender : IEmailSender
{
    private readonly SmtpOptions _smtp;
    private readonly EmailOptions _email;
    private readonly IHostEnvironment _env;
    private readonly ILogger<EmailSender> _logger;

    public EmailSender(
        IOptions<SmtpOptions> smtp,
        IOptions<EmailOptions> email,
        IHostEnvironment env,
        ILogger<EmailSender> logger)
    {
        _smtp = smtp.Value;
        _email = email.Value;
        _env = env;
        _logger = logger;
    }

    public async Task SendAsync(EmailMessage message, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(message.ToEmail) || !LooksLikeEmail(message.ToEmail))
        {
            _logger.LogWarning("Skipping email — invalid destination: {To}", message.ToEmail);
            return;
        }

        var text = message.TextBody ?? StripHtml(message.HtmlBody);

        if (_email.SaveToOutbox)
            await SaveOutboxAsync(message, text, ct);

        if (!_smtp.Enabled)
        {
            _logger.LogInformation(
                "SMTP disabled — email queued to outbox only. To={To} Subject={Subject}",
                message.ToEmail, message.Subject);
            return;
        }

        var mime = new MimeMessage();
        mime.From.Add(new MailboxAddress(_smtp.FromName, _smtp.FromEmail));
        mime.To.Add(new MailboxAddress(message.ToName ?? message.ToEmail, message.ToEmail));
        mime.Subject = message.Subject;

        var builder = new BodyBuilder
        {
            HtmlBody = message.HtmlBody,
            TextBody = text
        };
        mime.Body = builder.ToMessageBody();

        using var client = new MailKit.Net.Smtp.SmtpClient();
        try
        {
            var secure = _smtp.UseStartTls ? SecureSocketOptions.StartTls : SecureSocketOptions.Auto;
            await client.ConnectAsync(_smtp.Host, _smtp.Port, secure, ct);

            if (!string.IsNullOrWhiteSpace(_smtp.UserName))
                await client.AuthenticateAsync(_smtp.UserName, _smtp.Password, ct);

            await client.SendAsync(mime, ct);
            _logger.LogInformation("SMTP email sent To={To} Subject={Subject}", message.ToEmail, message.Subject);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "SMTP send failed To={To} Subject={Subject}", message.ToEmail, message.Subject);
            throw;
        }
        finally
        {
            if (client.IsConnected)
                await client.DisconnectAsync(true, ct);
        }
    }

    private async Task SaveOutboxAsync(EmailMessage message, string text, CancellationToken ct)
    {
        var folder = Path.Combine(_env.ContentRootPath, _email.OutboxRelativePath);
        Directory.CreateDirectory(folder);

        var stamp = DateTime.UtcNow.ToString("yyyyMMdd_HHmmss_fff");
        var safeSubject = SanitizeFileName(message.Subject);
        var baseName = $"{stamp}_{safeSubject}_{SanitizeFileName(message.ToEmail)}";

        var htmlPath = Path.Combine(folder, baseName + ".html");
        var metaPath = Path.Combine(folder, baseName + ".txt");

        var wrapped = $$"""
            <!DOCTYPE html>
            <html><head><meta charset="utf-8"><title>{{System.Net.WebUtility.HtmlEncode(message.Subject)}}</title></head>
            <body>
            <div style="font-family:monospace;font-size:12px;color:#64748B;padding:12px;background:#F1F5F9;border-bottom:1px solid #E2E8F0;">
              <div><b>To:</b> {{System.Net.WebUtility.HtmlEncode(message.ToEmail)}} ({{System.Net.WebUtility.HtmlEncode(message.ToName ?? "")}})</div>
              <div><b>Subject:</b> {{System.Net.WebUtility.HtmlEncode(message.Subject)}}</div>
              <div><b>UTC:</b> {{DateTime.UtcNow:O}}</div>
              <div style="margin-top:6px;color:#22A06B;">Local outbox preview — not a real mailbox</div>
            </div>
            {{message.HtmlBody}}
            </body></html>
            """;

        await File.WriteAllTextAsync(htmlPath, wrapped, Encoding.UTF8, ct);
        await File.WriteAllTextAsync(metaPath,
            $"To: {message.ToEmail}\nName: {message.ToName}\nSubject: {message.Subject}\n\n{text}",
            Encoding.UTF8, ct);

        _logger.LogInformation("Email outbox written: {Path}", htmlPath);
    }

    private static bool LooksLikeEmail(string value) =>
        value.Contains('@') && !value.Contains(' ') && value.Length >= 5;

    private static string StripHtml(string html) =>
        Regex.Replace(html, "<[^>]+>", " ").Replace("&nbsp;", " ").Trim();

    private static string SanitizeFileName(string value)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var cleaned = new string(value.Select(c => invalid.Contains(c) ? '_' : c).ToArray());
        return cleaned.Length > 40 ? cleaned[..40] : cleaned;
    }
}
