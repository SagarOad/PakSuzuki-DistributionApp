using System.Net;

namespace PakSuzuki.Infrastructure.Email;

/// <summary>Branded HTML email templates for Pak Suzuki / ECSTAR distribution.</summary>
public static class EmailTemplates
{
    private const string Navy = "#003A70";
    private const string Red = "#E30613";
    private const string Mist = "#EEF2F6";
    private const string Ink = "#1A2B4A";
    private const string Mute = "#64748B";

    public static (string Subject, string Html, string Text) Otp(
        string toName, string otpCode, string purposeLabel, int expiryMinutes)
    {
        var name = DisplayName(toName);
        var subject = $"Your verification code — {otpCode}";
        var body = $"""
            <p style="margin:0 0 16px;color:{Ink};font-size:16px;">Hi {E(name)},</p>
            <p style="margin:0 0 16px;color:{Mute};font-size:15px;line-height:1.5;">
              Use this one-time code to complete your <strong>{E(purposeLabel)}</strong>.
              It expires in <strong>{expiryMinutes} minutes</strong>. Do not share this code with anyone.
            </p>
            <div style="margin:24px 0;text-align:center;">
              <div style="display:inline-block;letter-spacing:8px;font-size:32px;font-weight:800;color:{Navy};
                background:{Mist};border:1px solid #E2E8F0;border-radius:12px;padding:16px 28px;">
                {E(otpCode)}
              </div>
            </div>
            <p style="margin:0;color:{Mute};font-size:13px;line-height:1.5;">
              If you did not request this code, you can ignore this email.
            </p>
            """;
        var html = Layout(subject, body, "Verification code");
        var text = $"Hi {name},\n\nYour {purposeLabel} code is: {otpCode}\nIt expires in {expiryMinutes} minutes.\n\nPak Suzuki | ECSTAR";
        return (subject, html, text);
    }

    public static (string Subject, string Html, string Text) Approved(string toName, string accountType)
    {
        var name = DisplayName(toName);
        var subject = $"Your {accountType} account has been approved";
        var body = $"""
            <p style="margin:0 0 16px;color:{Ink};font-size:16px;">Hi {E(name)},</p>
            <p style="margin:0 0 16px;color:{Mute};font-size:15px;line-height:1.5;">
              Good news — your <strong>{E(accountType)}</strong> registration with Pakistan Suzuki Motor Company
              has been <strong style="color:#22A06B;">approved</strong>.
            </p>
            <p style="margin:0 0 16px;color:{Mute};font-size:15px;line-height:1.5;">
              You can now sign in to the Pak Suzuki Distribution portal and start using your account.
            </p>
            {CtaHint("Log in with the email and password you registered.")}
            """;
        var html = Layout(subject, body, "Account approved");
        var text = $"Hi {name},\n\nYour {accountType} account has been approved. You can now log in.\n\nPak Suzuki | ECSTAR";
        return (subject, html, text);
    }

    public static (string Subject, string Html, string Text) Rejected(string toName, string accountType, string? remarks)
    {
        var name = DisplayName(toName);
        var subject = $"Your {accountType} registration was not approved";
        var remarksBlock = string.IsNullOrWhiteSpace(remarks)
            ? ""
            : $"""
              <div style="margin:20px 0;padding:14px 16px;background:#FEF2F2;border-left:4px solid {Red};border-radius:8px;">
                <div style="font-size:12px;font-weight:700;color:{Red};text-transform:uppercase;margin-bottom:6px;">Remarks</div>
                <div style="color:{Ink};font-size:14px;line-height:1.5;">{E(remarks)}</div>
              </div>
              """;
        var body = $"""
            <p style="margin:0 0 16px;color:{Ink};font-size:16px;">Hi {E(name)},</p>
            <p style="margin:0 0 16px;color:{Mute};font-size:15px;line-height:1.5;">
              We regret to inform you that your <strong>{E(accountType)}</strong> registration
              was <strong style="color:{Red};">not approved</strong>.
            </p>
            {remarksBlock}
            <p style="margin:0;color:{Mute};font-size:14px;line-height:1.5;">
              If you believe this was a mistake, please contact Pakistan Suzuki Motor Company support.
            </p>
            """;
        var html = Layout(subject, body, "Registration update");
        var text = $"Hi {name},\n\nYour {accountType} registration was not approved.\n{(string.IsNullOrWhiteSpace(remarks) ? "" : $"Remarks: {remarks}\n")}\nPak Suzuki | ECSTAR";
        return (subject, html, text);
    }

    public static (string Subject, string Html, string Text) SentBack(
        string toName, string accountType, string? remarks, string? correctionUrl)
    {
        var name = DisplayName(toName);
        var subject = $"Action required — correct your {accountType} registration";
        var remarksBlock = string.IsNullOrWhiteSpace(remarks)
            ? ""
            : $"""
              <div style="margin:20px 0;padding:14px 16px;background:#FFF7ED;border-left:4px solid #F59E0B;border-radius:8px;">
                <div style="font-size:12px;font-weight:700;color:#B45309;text-transform:uppercase;margin-bottom:6px;">What to fix</div>
                <div style="color:{Ink};font-size:14px;line-height:1.5;">{E(remarks)}</div>
              </div>
              """;
        var linkBlock = string.IsNullOrWhiteSpace(correctionUrl)
            ? CtaHint("Log in to the portal and open Correct Registration to update your details, then resubmit.")
            : $"""
              <div style="margin:24px 0;text-align:center;">
                <a href="{E(correctionUrl)}" style="display:inline-block;background:{Red};color:#fff;text-decoration:none;
                  font-weight:700;font-size:14px;padding:12px 24px;border-radius:10px;">Correct registration</a>
              </div>
              <p style="margin:0;color:{Mute};font-size:12px;text-align:center;">Or open: {E(correctionUrl)}</p>
              """;
        var body = $"""
            <p style="margin:0 0 16px;color:{Ink};font-size:16px;">Hi {E(name)},</p>
            <p style="margin:0 0 16px;color:{Mute};font-size:15px;line-height:1.5;">
              Your <strong>{E(accountType)}</strong> registration was <strong>sent back for correction</strong>.
              Please update the required information and resubmit for review.
            </p>
            {remarksBlock}
            {linkBlock}
            """;
        var html = Layout(subject, body, "Correction required");
        var text = $"Hi {name},\n\nYour {accountType} registration was sent back for correction.\n{(string.IsNullOrWhiteSpace(remarks) ? "" : $"What to fix: {remarks}\n")}{(string.IsNullOrWhiteSpace(correctionUrl) ? "" : $"Open: {correctionUrl}\n")}\nPak Suzuki | ECSTAR";
        return (subject, html, text);
    }

    private static string Layout(string title, string innerBody, string eyebrow)
    {
        return $"""
            <!DOCTYPE html>
            <html lang="en">
            <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
            <title>{E(title)}</title></head>
            <body style="margin:0;padding:0;background:{Mist};font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:{Mist};padding:32px 12px;">
                <tr><td align="center">
                  <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0;">
                    <tr><td style="background:{Navy};padding:20px 28px;">
                      <div style="color:#fff;font-size:11px;letter-spacing:1px;text-transform:uppercase;opacity:.8;">{E(eyebrow)}</div>
                      <div style="color:#fff;font-size:20px;font-weight:800;margin-top:4px;">Pak Suzuki Distribution</div>
                      <div style="color:#7EB6E8;font-size:12px;margin-top:2px;">ECSTAR Genuine Oil &amp; Chemical</div>
                    </td></tr>
                    <tr><td style="padding:28px;">{innerBody}</td></tr>
                    <tr><td style="padding:16px 28px 24px;border-top:1px solid #E2E8F0;color:{Mute};font-size:12px;line-height:1.5;">
                      © {DateTime.UtcNow.Year} Pakistan Suzuki Motor Company Ltd.<br>
                      This is an automated message — please do not reply directly to this email.
                    </td></tr>
                  </table>
                </td></tr>
              </table>
            </body>
            </html>
            """;
    }

    private static string CtaHint(string text) =>
        $"""
        <div style="margin:20px 0 0;padding:14px 16px;background:{Mist};border-radius:10px;color:{Ink};font-size:14px;line-height:1.5;">
          {E(text)}
        </div>
        """;

    private static string DisplayName(string? name) =>
        string.IsNullOrWhiteSpace(name) ? "there" : name.Trim();

    private static string E(string? value) => WebUtility.HtmlEncode(value ?? string.Empty);
}
