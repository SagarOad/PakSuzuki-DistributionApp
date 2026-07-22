using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Products.Queries;

// "liters / bottles / cartons - auto conversion" (3.3.1). Product.ConversionFactorToBaseUnit
// expresses how many of the product's BaseUnit make up one non-base unit (e.g. 1 carton
// = 12 base units); converting between any two units routes through the base unit.
public record ConvertUnitsResult(decimal ConvertedQuantity, decimal BaseUnitQuantity);

public record ConvertUnitsQuery(Guid ProductId, decimal Quantity, UnitOfMeasure FromUnit, UnitOfMeasure ToUnit)
    : IRequest<ConvertUnitsResult>;

public class ConvertUnitsQueryHandler : IRequestHandler<ConvertUnitsQuery, ConvertUnitsResult>
{
    private readonly IApplicationDbContext _context;
    public ConvertUnitsQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<ConvertUnitsResult> Handle(ConvertUnitsQuery request, CancellationToken ct)
    {
        var product = await _context.Products.FirstOrDefaultAsync(p => p.Id == request.ProductId, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Product), request.ProductId);

        var baseQuantity = ToBase(request.Quantity, request.FromUnit, product.BaseUnit, product.ConversionFactorToBaseUnit);
        var convertedQuantity = FromBase(baseQuantity, request.ToUnit, product.BaseUnit, product.ConversionFactorToBaseUnit);

        return new ConvertUnitsResult(convertedQuantity, baseQuantity);
    }

    private static decimal ToBase(decimal quantity, UnitOfMeasure unit, UnitOfMeasure baseUnit, decimal conversionFactor) =>
        unit == baseUnit ? quantity : quantity * conversionFactor;

    private static decimal FromBase(decimal baseQuantity, UnitOfMeasure unit, UnitOfMeasure baseUnit, decimal conversionFactor) =>
        unit == baseUnit ? baseQuantity : baseQuantity / conversionFactor;
}
