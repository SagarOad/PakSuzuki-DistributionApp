using System.Reflection;
using FluentValidation;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using PakSuzuki.Application.Common.Behaviors;

namespace PakSuzuki.Application;

public static class DependencyInjection
{
    // Called once from PakSuzuki.WebApi Program.cs. Keeping this here means the API
    // project never needs to know MediatR/FluentValidation/AutoMapper internals -
    // it just calls services.AddApplication().
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        var assembly = Assembly.GetExecutingAssembly();

        services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(assembly));
        services.AddValidatorsFromAssembly(assembly);
        services.AddAutoMapper(assembly);

        // Pipeline order matters: logging wraps everything, validation runs before the handler.
        services.AddTransient(typeof(IPipelineBehavior<,>), typeof(LoggingBehavior<,>));
        services.AddTransient(typeof(IPipelineBehavior<,>), typeof(ValidationBehavior<,>));

        return services;
    }
}
