using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

namespace PakSuzuki.WebApi.Extensions;

public static class AuthServiceExtensions
{
    public static IServiceCollection AddJwtAuthentication(this IServiceCollection services, IConfiguration configuration)
    {
        var jwtSettings = configuration.GetSection("Jwt");
        var secret = jwtSettings["Secret"]!;

        services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
                options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
            })
            .AddJwtBearer(options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer = jwtSettings["Issuer"],
                    ValidAudience = jwtSettings["Audience"],
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret)),
                    ClockSkew = TimeSpan.FromMinutes(2),
                    RoleClaimType = ClaimTypes.Role,
                    NameClaimType = ClaimTypes.Name
                };

                options.Events = new JwtBearerEvents
                {
                    // Swagger users often paste "Bearer eyJ..." while Swagger already prefixes Bearer →
                    // resulting header "Bearer Bearer eyJ..." which yields 401. Strip the duplicate.
                    OnMessageReceived = context =>
                    {
                        var header = context.Request.Headers.Authorization.ToString();
                        if (string.IsNullOrWhiteSpace(header))
                            return Task.CompletedTask;

                        const string bearer = "Bearer ";
                        if (header.StartsWith(bearer, StringComparison.OrdinalIgnoreCase))
                        {
                            var rest = header[bearer.Length..].Trim();
                            if (rest.StartsWith(bearer, StringComparison.OrdinalIgnoreCase))
                                context.Token = rest[bearer.Length..].Trim();
                        }

                        return Task.CompletedTask;
                    },
                    OnAuthenticationFailed = context =>
                    {
                        var logger = context.HttpContext.RequestServices
                            .GetRequiredService<ILoggerFactory>()
                            .CreateLogger("JwtBearer");
                        logger.LogWarning(context.Exception, "JWT authentication failed: {Message}", context.Exception.Message);
                        return Task.CompletedTask;
                    },
                    OnChallenge = context =>
                    {
                        // Leave default 401 behavior; log missing/invalid auth for Swagger debugging.
                        if (string.IsNullOrEmpty(context.Error))
                        {
                            var logger = context.HttpContext.RequestServices
                                .GetRequiredService<ILoggerFactory>()
                                .CreateLogger("JwtBearer");
                            var hasAuth = context.Request.Headers.ContainsKey("Authorization");
                            logger.LogWarning(
                                "JWT challenge (401) on {Path}. Authorization header present: {HasAuth}",
                                context.Request.Path, hasAuth);
                        }
                        return Task.CompletedTask;
                    }
                };
            });

        services.AddAuthorizationBuilder()
            .AddPolicy("SuperAdminOnly", p => p.RequireRole(PakSuzuki.Domain.Enums.Roles.SuperAdmin))
            .AddPolicy("AdminOrAbove", p => p.RequireRole(PakSuzuki.Domain.Enums.Roles.SuperAdmin, PakSuzuki.Domain.Enums.Roles.Admin))
            .AddPolicy("DistributorOnly", p => p.RequireRole(PakSuzuki.Domain.Enums.Roles.Distributor))
            .AddPolicy("RetailerOnly", p => p.RequireRole(PakSuzuki.Domain.Enums.Roles.Retailer))
            .AddPolicy("DashboardStaff", p => p.RequireRole(
                PakSuzuki.Domain.Enums.Roles.SuperAdmin, PakSuzuki.Domain.Enums.Roles.Admin, PakSuzuki.Domain.Enums.Roles.RegionalHead));

        return services;
    }
}
