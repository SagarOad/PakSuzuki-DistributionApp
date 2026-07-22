using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PakSuzuki.Application.Common.Interfaces;

namespace PakSuzuki.WebApi.Controllers;

/// <summary>Dev/admin helpers to preview branded email templates without going through full flows.</summary>
[Authorize(Policy = "AdminOrAbove")]
public class EmailController : BaseApiController
{
    private readonly IEmailNotificationService _email;
    private readonly IWebHostEnvironment _env;

    public EmailController(IEmailNotificationService email, IWebHostEnvironment env)
    {
        _email = email;
        _env = env;
    }

    /// <summary>
    /// Sends a sample template to the given address (and/or local outbox).
    /// Templates: otp | approved | rejected | sent-back
    /// </summary>
    [HttpPost("test")]
    public async Task<IActionResult> SendTest([FromBody] EmailTestRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.ToEmail))
            return BadRequest(new { message = "toEmail is required." });

        await _email.SendSampleAsync(request.ToEmail, request.Template ?? "otp", ct);

        return Ok(new
        {
            message = "Sample email dispatched.",
            template = request.Template ?? "otp",
            toEmail = request.ToEmail,
            hint = "If Smtp:Enabled is false, open the latest .html file under the API project's email-outbox folder."
        });
    }

    /// <summary>Lists recent outbox files (Development convenience).</summary>
    [HttpGet("outbox")]
    public IActionResult ListOutbox()
    {
        if (!_env.IsDevelopment())
            return NotFound();

        var folder = Path.Combine(_env.ContentRootPath, "email-outbox");
        if (!Directory.Exists(folder))
            return Ok(new { files = Array.Empty<string>(), folder });

        var files = Directory.GetFiles(folder, "*.html")
            .OrderByDescending(System.IO.File.GetCreationTimeUtc)
            .Take(20)
            .Select(f => new { name = Path.GetFileName(f), path = f, createdUtc = System.IO.File.GetCreationTimeUtc(f) })
            .ToList();

        return Ok(new { folder, files });
    }
}

public record EmailTestRequest(string ToEmail, string? Template = "otp");
