using MediatR;
using Microsoft.Extensions.Logging;
using System.Diagnostics;

namespace PakSuzuki.Application.Common.Behaviors;

// Structured logging for every command/query - request name, elapsed time, and
// failures. Slow-request threshold flags anything worth investigating (e.g. a
// dashboard aggregation query that got expensive).
public class LoggingBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
    where TRequest : IRequest<TResponse>
{
    private readonly ILogger<LoggingBehavior<TRequest, TResponse>> _logger;

    public LoggingBehavior(ILogger<LoggingBehavior<TRequest, TResponse>> logger) => _logger = logger;

    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken ct)
    {
        var requestName = typeof(TRequest).Name;
        var sw = Stopwatch.StartNew();
        try
        {
            var response = await next();
            sw.Stop();
            if (sw.ElapsedMilliseconds > 500)
                _logger.LogWarning("Slow request: {RequestName} took {Elapsed}ms", requestName, sw.ElapsedMilliseconds);
            else
                _logger.LogInformation("Handled {RequestName} in {Elapsed}ms", requestName, sw.ElapsedMilliseconds);
            return response;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Request {RequestName} failed", requestName);
            throw;
        }
    }
}
