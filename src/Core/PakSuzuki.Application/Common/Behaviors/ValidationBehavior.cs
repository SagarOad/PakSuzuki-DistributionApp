using FluentValidation;
using MediatR;
using ValidationException = PakSuzuki.Application.Common.Exceptions.ValidationException;

namespace PakSuzuki.Application.Common.Behaviors;

// Runs all FluentValidation validators registered for TRequest before the handler
// executes. Every Command/Query gets this for free just by having a matching Validator.
public class ValidationBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
    where TRequest : IRequest<TResponse>
{
    private readonly IEnumerable<IValidator<TRequest>> _validators;

    public ValidationBehavior(IEnumerable<IValidator<TRequest>> validators) => _validators = validators;

    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken ct)
    {
        if (!_validators.Any()) return await next();

        var context = new ValidationContext<TRequest>(request);
        var failures = (await Task.WhenAll(_validators.Select(v => v.ValidateAsync(context, ct))))
            .SelectMany(r => r.Errors)
            .Where(f => f != null)
            .ToList();

        if (failures.Count != 0) throw new ValidationException(failures);

        return await next();
    }
}
