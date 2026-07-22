using System.Net;
using System.Text.Json;
using PakSuzuki.Application.Common.Exceptions;
using ValidationException = PakSuzuki.Application.Common.Exceptions.ValidationException;

namespace PakSuzuki.WebApi.Middleware;

// Central place that turns Application-layer exceptions into consistent HTTP
// responses (RFC7807-ish shape) so no controller needs try/catch boilerplate.
public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            await HandleExceptionAsync(context, ex);
        }
    }

    private async Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        context.Response.ContentType = "application/json";

        object payload;
        switch (exception)
        {
            case ValidationException validationEx:
                context.Response.StatusCode = (int)HttpStatusCode.BadRequest;
                payload = new { title = "Validation failed", status = 400, errors = validationEx.Errors };
                break;
            case NotFoundException:
                context.Response.StatusCode = (int)HttpStatusCode.NotFound;
                payload = new { title = exception.Message, status = 404 };
                break;
            case ForbiddenAccessException:
                context.Response.StatusCode = (int)HttpStatusCode.Forbidden;
                payload = new { title = exception.Message, status = 403 };
                break;
            case UnauthorizedAccessException:
                context.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                payload = new { title = exception.Message, status = 401 };
                break;
            case ConflictException:
                context.Response.StatusCode = (int)HttpStatusCode.Conflict;
                payload = new { title = exception.Message, status = 409 };
                break;
            case InvalidOperationException:
                context.Response.StatusCode = (int)HttpStatusCode.BadRequest;
                payload = new { title = exception.Message, status = 400 };
                break;
            default:
                _logger.LogError(exception, "Unhandled exception");
                context.Response.StatusCode = (int)HttpStatusCode.InternalServerError;
                payload = new { title = "An unexpected error occurred.", status = 500 };
                break;
        }

        await context.Response.WriteAsync(JsonSerializer.Serialize(payload));
    }
}
