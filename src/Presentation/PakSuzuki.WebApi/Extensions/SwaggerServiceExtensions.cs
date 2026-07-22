using Microsoft.OpenApi.Models;

namespace PakSuzuki.WebApi.Extensions;

public static class SwaggerServiceExtensions
{
    public static IServiceCollection AddSwaggerWithJwt(this IServiceCollection services)
    {
        services.AddEndpointsApiExplorer();
        services.AddSwaggerGen(c =>
        {
            c.SwaggerDoc("v1", new OpenApiInfo
            {
                Title = "Pak Suzuki Distribution API",
                Version = "v1",
                Description =
                    "Use http://localhost:5080/swagger (HTTP).\n\n" +
                    "Auth: click Authorize → paste ONLY the JWT from login `token` (no 'Bearer ' prefix).\n\n" +
                    "Seed: superadmin@paksuzuki.local / ChangeMe!2026"
            });

            // Definition must NOT include Reference — requirement references the definition by Id.
            c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
            {
                Description =
                    "JWT Authorization. Paste the raw token from POST /api/auth/login → `token` field. " +
                    "Do NOT type the word Bearer — Swagger adds it automatically.",
                Name = "Authorization",
                In = ParameterLocation.Header,
                Type = SecuritySchemeType.Http,
                Scheme = "bearer",
                BearerFormat = "JWT"
            });

            c.AddSecurityRequirement(new OpenApiSecurityRequirement
            {
                {
                    new OpenApiSecurityScheme
                    {
                        Reference = new OpenApiReference
                        {
                            Type = ReferenceType.SecurityScheme,
                            Id = "Bearer"
                        }
                    },
                    Array.Empty<string>()
                }
            });
        });

        return services;
    }
}
