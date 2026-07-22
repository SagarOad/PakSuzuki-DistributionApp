namespace PakSuzuki.Application.Common.Interfaces;

public interface IJwtTokenGenerator
{
    string GenerateToken(Guid userId, string userName, string role, IDictionary<string, string>? extraClaims = null);
}
