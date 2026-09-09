using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Auth.Commands;
using PakSuzuki.Domain.Interfaces;
using PakSuzuki.Infrastructure.Identity;
using PakSuzuki.Infrastructure.Persistence;
using PakSuzuki.Infrastructure.Persistence.Repositories;
using PakSuzuki.Infrastructure.Services;

namespace PakSuzuki.Infrastructure;

public static class DependencyInjection
{
    // Called once from PakSuzuki.WebApi Program.cs as services.AddInfrastructure(config, env.WebRootPath).
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration, string webRootPath)
    {
        services.AddDbContext<ApplicationDbContext>(options =>
            options.UseSqlServer(configuration.GetConnectionString("DefaultConnection"),
                sql => sql.MigrationsAssembly(typeof(ApplicationDbContext).Assembly.FullName)));

        services.AddScoped<IApplicationDbContext>(provider => provider.GetRequiredService<ApplicationDbContext>());

        services.AddIdentity<ApplicationUser, ApplicationRole>(options =>
            {
                options.Password.RequiredLength = 8;
                options.Password.RequireNonAlphanumeric = false;
                options.User.RequireUniqueEmail = true;
                options.Lockout.MaxFailedAccessAttempts = 5;
            })
            .AddEntityFrameworkStores<ApplicationDbContext>()
            .AddDefaultTokenProviders();

        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUserService, CurrentUserService>();
        services.AddSingleton<IDateTimeService, DateTimeService>();
        services.AddScoped<IJwtTokenGenerator, JwtTokenGenerator>();
        services.AddScoped<IIdentityService, IdentityService>();
        services.AddScoped<ISapIntegrationService, SapIntegrationService>();
        services.AddScoped<IFileStorageService>(_ => new LocalFileStorageService(webRootPath));
        services.AddScoped<IIncentiveReportPdfService, IncentiveReportPdfService>();
        services.AddSingleton<IOtpService, OtpService>();

        services.Configure<Email.SmtpOptions>(configuration.GetSection(Email.SmtpOptions.SectionName));
        services.Configure<Email.EmailOptions>(configuration.GetSection(Email.EmailOptions.SectionName));
        services.AddScoped<IEmailSender, Email.EmailSender>();
        services.AddScoped<IEmailNotificationService, Email.EmailNotificationService>();

        services.AddScoped(typeof(IRepository<>), typeof(Repository<>));
        services.AddScoped<IUnitOfWork, UnitOfWork>();

        return services;
    }
}
