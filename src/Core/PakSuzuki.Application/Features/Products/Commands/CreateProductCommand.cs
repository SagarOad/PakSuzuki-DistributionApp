using FluentValidation;
using MediatR;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Domain.Entities;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Products.Commands;

// 3.2: Admin uploads product + defines cost/selling/retail price and dynamic tax %.
public record CreateProductCommand(
    string Sku, string Name, string? Description, ProductCategory Category, UnitOfMeasure BaseUnit,
    decimal ConversionFactorToBaseUnit, decimal CostPrice, decimal SellingPrice, decimal RetailPrice,
    decimal GstPercent, decimal FedPercent, decimal WhtPercent
) : IRequest<Guid>;

public class CreateProductCommandValidator : AbstractValidator<CreateProductCommand>
{
    public CreateProductCommandValidator()
    {
        RuleFor(x => x.Sku).NotEmpty().MaximumLength(50);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.ConversionFactorToBaseUnit).GreaterThan(0);
        RuleFor(x => x.CostPrice).GreaterThanOrEqualTo(0);
        RuleFor(x => x.SellingPrice).GreaterThanOrEqualTo(0);
        RuleFor(x => x.RetailPrice).GreaterThanOrEqualTo(0);
        RuleFor(x => x.GstPercent).InclusiveBetween(0, 100);
        RuleFor(x => x.FedPercent).InclusiveBetween(0, 100);
        RuleFor(x => x.WhtPercent).InclusiveBetween(0, 100);
    }
}

public class CreateProductCommandHandler : IRequestHandler<CreateProductCommand, Guid>
{
    private readonly IApplicationDbContext _context;
    public CreateProductCommandHandler(IApplicationDbContext context) => _context = context;

    public async Task<Guid> Handle(CreateProductCommand request, CancellationToken ct)
    {
        var product = new Product
        {
            Sku = request.Sku,
            Name = request.Name,
            Description = request.Description,
            Category = request.Category,
            BaseUnit = request.BaseUnit,
            ConversionFactorToBaseUnit = request.ConversionFactorToBaseUnit
        };

        product.PriceHistory.Add(new ProductPrice
        {
            CostPrice = request.CostPrice,
            SellingPrice = request.SellingPrice,
            RetailPrice = request.RetailPrice,
            GstPercent = request.GstPercent,
            FedPercent = request.FedPercent,
            WhtPercent = request.WhtPercent,
            IsCurrent = true
        });

        _context.Products.Add(product);
        await _context.SaveChangesAsync(ct);
        return product.Id;
    }
}
