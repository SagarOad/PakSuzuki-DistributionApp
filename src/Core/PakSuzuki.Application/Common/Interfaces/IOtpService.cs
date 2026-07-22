namespace PakSuzuki.Application.Common.Interfaces;

public interface IOtpService
{
    Task<string> GenerateAndStoreAsync(string destination, string purpose, CancellationToken ct = default);
    Task<bool> VerifyAsync(string destination, string purpose, string code, CancellationToken ct = default);
}
