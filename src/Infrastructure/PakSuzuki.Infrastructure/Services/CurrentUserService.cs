using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using PakSuzuki.Application.Common.Interfaces;

namespace PakSuzuki.Infrastructure.Services;

public class CurrentUserService : ICurrentUserService
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public CurrentUserService(IHttpContextAccessor httpContextAccessor) => _httpContextAccessor = httpContextAccessor;

    private ClaimsPrincipal? User => _httpContextAccessor.HttpContext?.User;

    public Guid? UserId
    {
        get
        {
            var id = User?.FindFirstValue(ClaimTypes.NameIdentifier);
            return Guid.TryParse(id, out var guid) ? guid : null;
        }
    }

    public string? Role => User?.FindFirstValue(ClaimTypes.Role);

    public Guid? DistributorId
    {
        get
        {
            var id = User?.FindFirstValue("distributorId");
            return Guid.TryParse(id, out var guid) ? guid : null;
        }
    }

    public Guid? RetailerId
    {
        get
        {
            var id = User?.FindFirstValue("retailerId");
            return Guid.TryParse(id, out var guid) ? guid : null;
        }
    }

    public bool IsInRole(string role) => User?.IsInRole(role) ?? false;
}
