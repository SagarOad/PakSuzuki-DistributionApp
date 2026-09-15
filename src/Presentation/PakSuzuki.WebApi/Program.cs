using Microsoft.Extensions.FileProviders;
using PakSuzuki.Application;
using PakSuzuki.Infrastructure;
using PakSuzuki.WebApi.Extensions;
using PakSuzuki.WebApi.Middleware;
using PakSuzuki.WebApi.Persistence;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

// IIS app-pool must be able to write here; missing folder/permission often causes 500.30.
Directory.CreateDirectory(Path.Combine(builder.Environment.ContentRootPath, "logs"));
Directory.CreateDirectory(Path.Combine(builder.Environment.ContentRootPath, "email-outbox"));

// User media lives outside wwwroot so `npm run build` (emptyOutDir) cannot wipe uploads.
var mediaRoot = Path.Combine(builder.Environment.ContentRootPath, "App_Data", "uploads");
Directory.CreateDirectory(mediaRoot);
MigrateLegacyWwwrootUploads(builder.Environment.WebRootPath, mediaRoot);

// ---------- Serilog ----------
builder.Host.UseSerilog((context, services, configuration) => configuration
    .ReadFrom.Configuration(context.Configuration)
    .WriteTo.Console()
    .WriteTo.File(
        Path.Combine(builder.Environment.ContentRootPath, "logs", "log-.txt"),
        rollingInterval: RollingInterval.Day));

// ---------- Layers (Clean Architecture composition root) ----------
builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration, mediaRoot);

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

// ---------- Migrate DB + seed roles/SuperAdmin/regions ----------
// Failure here is the usual cause of IIS HTTP 500.30 (bad connection string / SQL auth).
try
{
    using var scope = app.Services.CreateScope();
    await DbSeeder.SeedAsync(scope.ServiceProvider);
}
catch (Exception ex)
{
    Log.Fatal(ex,
        "Startup database migrate/seed failed. Check ConnectionStrings:DefaultConnection. " +
        "Under IIS, Trusted_Connection=True usually fails — use SQL User Id/Password, " +
        "or grant the app-pool identity access to SQL Server.");
    throw;
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

app.UseStaticFiles(); // SPA assets in wwwroot (safe to empty on frontend build)
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(mediaRoot),
    RequestPath = "/uploads"
});

app.UseCors(CorsServiceExtensions.PolicyName);

app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.MapFallbackToFile("index.html");

app.Run();

/// <summary>
/// One-time move of any leftover wwwroot/uploads into App_Data/uploads so existing
/// DB URLs (/uploads/...) keep working after storage was moved off wwwroot.
/// </summary>
static void MigrateLegacyWwwrootUploads(string? webRootPath, string mediaRoot)
{
    if (string.IsNullOrWhiteSpace(webRootPath)) return;
    var legacy = Path.Combine(webRootPath, "uploads");
    if (!Directory.Exists(legacy)) return;

    foreach (var sourceFile in Directory.EnumerateFiles(legacy, "*", SearchOption.AllDirectories))
    {
        var relative = Path.GetRelativePath(legacy, sourceFile);
        var destFile = Path.Combine(mediaRoot, relative);
        Directory.CreateDirectory(Path.GetDirectoryName(destFile)!);
        if (!File.Exists(destFile))
            File.Move(sourceFile, destFile);
    }

    try
    {
        // Clean empty leftover folders under wwwroot/uploads after move.
        if (!Directory.EnumerateFileSystemEntries(legacy).Any())
            Directory.Delete(legacy, recursive: true);
    }
    catch
    {
        // Non-fatal: leave empty legacy folder if locked.
    }
}

public partial class Program { }
