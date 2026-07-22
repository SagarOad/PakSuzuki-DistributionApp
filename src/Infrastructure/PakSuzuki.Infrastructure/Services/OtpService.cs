using System.Collections.Concurrent;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using PakSuzuki.Application.Common.Interfaces;

namespace PakSuzuki.Infrastructure.Services;

// In-memory OTP store for registration/login. Swap for SMS/Redis later without
// changing Application handlers. In Development, OTPs are also logged.
public class OtpService : IOtpService
{
    private readonly ConcurrentDictionary<string, OtpEntry> _store = new();
    private readonly IConfiguration _configuration;
    private readonly ILogger<OtpService> _logger;

    public OtpService(IConfiguration configuration, ILogger<OtpService> logger)
    {
        _configuration = configuration;
        _logger = logger;
    }

    public Task<string> GenerateAndStoreAsync(string destination, string purpose, CancellationToken ct = default)
    {
        var length = int.Parse(_configuration["Otp:Length"] ?? "6");
        var expiryMinutes = int.Parse(_configuration["Otp:ExpiryMinutes"] ?? "5");
        var code = Random.Shared.Next(0, (int)Math.Pow(10, length)).ToString($"D{length}");
        var key = BuildKey(destination, purpose);
        _store[key] = new OtpEntry(code, DateTime.UtcNow.AddMinutes(expiryMinutes));
        _logger.LogInformation("OTP generated for {Destination} purpose={Purpose} code={Code}", destination, purpose, code);
        return Task.FromResult(code);
    }

    public Task<bool> VerifyAsync(string destination, string purpose, string code, CancellationToken ct = default)
    {
        var key = BuildKey(destination, purpose);
        if (!_store.TryGetValue(key, out var entry)) return Task.FromResult(false);
        if (entry.ExpiresAtUtc < DateTime.UtcNow)
        {
            _store.TryRemove(key, out _);
            return Task.FromResult(false);
        }

        var ok = string.Equals(entry.Code, code, StringComparison.Ordinal);
        if (ok) _store.TryRemove(key, out _);
        return Task.FromResult(ok);
    }

    private static string BuildKey(string destination, string purpose) =>
        $"{purpose.Trim().ToLowerInvariant()}::{destination.Trim().ToLowerInvariant()}";

    private sealed record OtpEntry(string Code, DateTime ExpiresAtUtc);
}
