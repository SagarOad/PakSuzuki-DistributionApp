using PakSuzuki.Application;
using PakSuzuki.Infrastructure;
using PakSuzuki.WebApi.Extensions;
using PakSuzuki.WebApi.Middleware;
using PakSuzuki.WebApi.Persistence;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

// ---------- Serilog ----------
builder.Host.UseSerilog((context, services, configuration) => configuration
    .ReadFrom.Configuration(context.Configuration)
    .WriteTo.Console()
    .WriteTo.File("logs/log-.txt", rollingInterval: RollingInterval.Day));

// ---------- Layers (Clean Architecture composition root) ----------
builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration, builder.Environment.WebRootPath);

// ---------- API plumbing ----------
builder.Services.AddControllers()
    .AddJsonOptions(o =>
    {
        o.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
        o.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    });

// Turn the default (cryptic) model-binding / malformed-JSON 400 into a clear,
// consistent shape matching our ValidationException responses.
builder.Services.Configure<Microsoft.AspNetCore.Mvc.ApiBehaviorOptions>(options =>
{
    options.InvalidModelStateResponseFactory = context =>
    {
        var errors = context.ModelState
            .Where(e => e.Value is { Errors.Count: > 0 })
            .ToDictionary(
                e => string.IsNullOrEmpty(e.Key) ? "body" : e.Key,
                e => e.Value!.Errors
                    .Select(err =>
                    {
                        var msg = err.ErrorMessage;
                        if (string.IsNullOrWhiteSpace(msg) ||
                            msg.Contains("invalid after a value", StringComparison.OrdinalIgnoreCase) ||
                            msg.Contains("JSON", StringComparison.OrdinalIgnoreCase))
                        {
                            return "Request body is not valid JSON. Check for missing commas, extra quotes, "
                                 + "or trailing characters, and ensure Content-Type is application/json.";
                        }
                        return msg;
                    })
                    .Distinct()
                    .ToArray());

        var payload = new
        {
            title = "Validation failed",
            status = 400,
            errors
        };
        return new Microsoft.AspNetCore.Mvc.BadRequestObjectResult(payload)
        {
            ContentTypes = { "application/json" }
        };
    };
});
builder.Services.AddJwtAuthentication(builder.Configuration);
builder.Services.AddAppCors(builder.Configuration, builder.Environment);
builder.Services.AddSwaggerWithJwt();

var app = builder.Build();

// ---------- Seed roles + first SuperAdmin (dev convenience) ----------
using (var scope = app.Services.CreateScope())
{
    await DbSeeder.SeedAsync(scope.ServiceProvider);
}

// ---------- Middleware pipeline ----------
app.UseMiddleware<ExceptionHandlingMiddleware>();

// Swagger available locally so Try-it-out works against the same host/scheme.
app.UseSwagger();
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "Pak Suzuki Distribution API");
    c.DisplayRequestDuration();
});

// HTTPS redirect breaks Swagger "Try it out" when the page is opened on http://
// (browser fetch cannot follow the redirect cleanly → "Failed to fetch" / CORS).
if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseStaticFiles();

app.UseCors(CorsServiceExtensions.PolicyName);

app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.MapFallbackToFile("index.html");

app.Run();

public partial class Program { }
