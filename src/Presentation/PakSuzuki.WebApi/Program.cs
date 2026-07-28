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
        var errors = new Dictionary<string, string[]>();
        foreach (var entry in context.ModelState.Where(e => e.Value is { Errors.Count: > 0 }))
        {
            var key = string.IsNullOrEmpty(entry.Key) ? "body" : entry.Key;
            // ASP.NET names the complex body parameter (e.g. "command") when JSON fails to bind.
            if (key is "command" or "request" or "body")
                key = "body";
            if (key.StartsWith("$.", StringComparison.Ordinal))
                key = key[2..]; // $.mobileNumber → mobileNumber

            var messages = entry.Value!.Errors.Select(err =>
            {
                var msg = err.ErrorMessage;
                var looksLikeJsonProblem =
                    string.IsNullOrWhiteSpace(msg) ||
                    msg.Contains("invalid after a value", StringComparison.OrdinalIgnoreCase) ||
                    msg.Contains("JSON", StringComparison.OrdinalIgnoreCase) ||
                    msg.Contains("could not be converted", StringComparison.OrdinalIgnoreCase) ||
                    (msg.Contains("is required", StringComparison.OrdinalIgnoreCase) && key == "body");

                if (looksLikeJsonProblem)
                {
                    if (key != "body")
                    {
                        return $"Invalid or malformed value for '{key}'. "
                             + "Ensure the field has a proper JSON string (quotes closed), e.g. "
                             + $"\"{key}\": \"value\", and Content-Type is application/json.";
                    }

                    return "Request body is not valid JSON or is missing. "
                         + "Check for missing commas/quotes (e.g. \"mobileNumber\": \"03331234567\"), "
                         + "no trailing commas, and set Content-Type: application/json.";
                }
                return msg;
            }).Distinct().ToArray();

            if (errors.ContainsKey(key))
                errors[key] = errors[key].Concat(messages).Distinct().ToArray();
            else
                errors[key] = messages;
        }

        return new Microsoft.AspNetCore.Mvc.BadRequestObjectResult(new
        {
            title = "Validation failed",
            status = 400,
            errors
        })
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
