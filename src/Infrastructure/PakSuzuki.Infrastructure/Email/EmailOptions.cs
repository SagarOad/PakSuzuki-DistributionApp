namespace PakSuzuki.Infrastructure.Email;

public class SmtpOptions
{
    public const string SectionName = "Smtp";

    /// <summary>When false, emails are not sent over the network (outbox-only if enabled).</summary>
    public bool Enabled { get; set; }

    public string Host { get; set; } = "localhost";
    public int Port { get; set; } = 587;
    public bool UseStartTls { get; set; } = true;
    public string UserName { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string FromEmail { get; set; } = "noreply@paksuzuki.local";
    public string FromName { get; set; } = "Pak Suzuki | ECSTAR";
}

public class EmailOptions
{
    public const string SectionName = "Email";

    /// <summary>Write .html files under ContentRoot/email-outbox so you can open them in a browser (free, no SMTP).</summary>
    public bool SaveToOutbox { get; set; } = true;

    public string OutboxRelativePath { get; set; } = "email-outbox";

    /// <summary>Frontend base URL used in “fix registration” links.</summary>
    public string AppBaseUrl { get; set; } = "http://localhost:5173";

    public string CorrectionPath { get; set; } = "/correct-registration";
}
