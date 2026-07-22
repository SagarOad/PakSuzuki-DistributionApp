namespace PakSuzuki.WebApi.Extensions;

public static class CorsServiceExtensions
{
    public const string PolicyName = "AppCorsPolicy";

    public static IServiceCollection AddAppCors(this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        var allowedOrigins = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
            ?? Array.Empty<string>();

        services.AddCors(options =>
        {
            options.AddPolicy(PolicyName, policy =>
            {
                if (environment.IsDevelopment())
                {
                    // Dev: Vite + Swagger (http/https localhost) + mobile emulators.
                    policy.SetIsOriginAllowed(_ => true)
                        .AllowAnyHeader()
                        .AllowAnyMethod()
                        .AllowCredentials();
                    return;
                }

                policy.WithOrigins(allowedOrigins)
                    .AllowAnyHeader()
                    .AllowAnyMethod()
                    .AllowCredentials();
            });
        });

        return services;
    }
}
