using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Domain.Entities;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Products.Commands;

public record UpdateProductCommand(
    Guid Id, string Name, string? Description, ProductCategory Category,
    UnitOfMeasure BaseUnit, decimal ConversionFactorToBaseUnit
) : IRequest;

public class UpdateProductCommandValidator : AbstractValidator<UpdateProductCommand>
{
    public UpdateProductCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.ConversionFactorToBaseUnit).GreaterThan(0);
    }
}

public class UpdateProductCommandHandler : IRequestHandler<UpdateProductCommand>
{
    private readonly IApplicationDbContext _context;
    public UpdateProductCommandHandler(IApplicationDbContext context) => _context = context;

    public async Task Handle(UpdateProductCommand request, CancellationToken ct)
    {
        var product = await _context.Products.FirstOrDefaultAsync(p => p.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Product), request.Id);

        product.Name = request.Name;
        product.Description = request.Description;
        product.Category = request.Category;
        product.BaseUnit = request.BaseUnit;
        product.ConversionFactorToBaseUnit = request.ConversionFactorToBaseUnit;

        await _context.SaveChangesAsync(ct);
    }
}

public record DeactivateProductCommand(Guid Id) : IRequest;

public class DeactivateProductCommandValidator : AbstractValidator<DeactivateProductCommand>
{
    public DeactivateProductCommandValidator() => RuleFor(x => x.Id).NotEmpty();
}

public class DeactivateProductCommandHandler : IRequestHandler<DeactivateProductCommand>
{
    private readonly IApplicationDbContext _context;
    public DeactivateProductCommandHandler(IApplicationDbContext context) => _context = context;

    public async Task Handle(DeactivateProductCommand request, CancellationToken ct)
    {
        var product = await _context.Products.FirstOrDefaultAsync(p => p.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Product), request.Id);

        product.IsActive = false;
        await _context.SaveChangesAsync(ct);
    }
}

// 3.2: adds a new effective-dated price row and closes the previous one, preserving
// full price history rather than overwriting it.
public record AddProductPriceCommand(
    Guid ProductId, decimal CostPrice, decimal SellingPrice, decimal RetailPrice,
    decimal GstPercent, decimal FedPercent, decimal WhtPercent
) : IRequest<Guid>;

public class AddProductPriceCommandValidator : AbstractValidator<AddProductPriceCommand>
{
    public AddProductPriceCommandValidator()
    {
        RuleFor(x => x.ProductId).NotEmpty();
        RuleFor(x => x.CostPrice).GreaterThanOrEqualTo(0);
        RuleFor(x => x.SellingPrice).GreaterThanOrEqualTo(0);
        RuleFor(x => x.RetailPrice).GreaterThanOrEqualTo(0);
        RuleFor(x => x.GstPercent).InclusiveBetween(0, 100);
        RuleFor(x => x.FedPercent).InclusiveBetween(0, 100);
        RuleFor(x => x.WhtPercent).InclusiveBetween(0, 100);
    }
}

public class AddProductPriceCommandHandler : IRequestHandler<AddProductPriceCommand, Guid>
{
    private readonly IApplicationDbContext _context;
    private readonly IDateTimeService _dateTime;

    public AddProductPriceCommandHandler(IApplicationDbContext context, IDateTimeService dateTime)
    {
        _context = context;
        _dateTime = dateTime;
    }

    public async Task<Guid> Handle(AddProductPriceCommand request, CancellationToken ct)
    {
        var product = await _context.Products.Include(p => p.PriceHistory)
            .FirstOrDefaultAsync(p => p.Id == request.ProductId, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Product), request.ProductId);

        var now = _dateTime.UtcNow;

        foreach (var previous in product.PriceHistory.Where(pp => pp.IsCurrent))
        {
            previous.IsCurrent = false;
            previous.EffectiveToUtc = now;
        }

        var newPrice = new ProductPrice
        {
            ProductId = product.Id,
            CostPrice = request.CostPrice,
            SellingPrice = request.SellingPrice,
            RetailPrice = request.RetailPrice,
            GstPercent = request.GstPercent,
            FedPercent = request.FedPercent,
            WhtPercent = request.WhtPercent,
            EffectiveFromUtc = now,
            IsCurrent = true
        };

        product.PriceHistory.Add(newPrice);
        await _context.SaveChangesAsync(ct);
        return newPrice.Id;
    }
}

// 3.2: "Bulk upload via Excel/CSV" - each row creates a product with its initial
// current price; rows whose SKU already exists are skipped, not overwritten.
public record BulkProductRow(
    string Sku, string Name, string? Description, ProductCategory Category, UnitOfMeasure BaseUnit,
    decimal ConversionFactorToBaseUnit, decimal CostPrice, decimal SellingPrice, decimal RetailPrice,
    decimal GstPercent, decimal FedPercent, decimal WhtPercent);

public record BulkUploadResult(int CreatedCount, List<string> SkippedSkus);

public record BulkUploadProductsCommand(List<BulkProductRow> Rows) : IRequest<BulkUploadResult>;

public class BulkUploadProductsCommandValidator : AbstractValidator<BulkUploadProductsCommand>
{
    public BulkUploadProductsCommandValidator()
    {
        RuleFor(x => x.Rows).NotEmpty().WithMessage("The upload must contain at least one product row.");
        RuleForEach(x => x.Rows).ChildRules(row =>
        {
            row.RuleFor(r => r.Sku).NotEmpty().MaximumLength(50);
            row.RuleFor(r => r.Name).NotEmpty().MaximumLength(200);
            row.RuleFor(r => r.ConversionFactorToBaseUnit).GreaterThan(0);
            row.RuleFor(r => r.CostPrice).GreaterThanOrEqualTo(0);
            row.RuleFor(r => r.SellingPrice).GreaterThanOrEqualTo(0);
            row.RuleFor(r => r.RetailPrice).GreaterThanOrEqualTo(0);
            row.RuleFor(r => r.GstPercent).InclusiveBetween(0, 100);
            row.RuleFor(r => r.FedPercent).InclusiveBetween(0, 100);
            row.RuleFor(r => r.WhtPercent).InclusiveBetween(0, 100);
        });
    }
}

public class BulkUploadProductsCommandHandler : IRequestHandler<BulkUploadProductsCommand, BulkUploadResult>
{
    private readonly IApplicationDbContext _context;
    public BulkUploadProductsCommandHandler(IApplicationDbContext context) => _context = context;

    public async Task<BulkUploadResult> Handle(BulkUploadProductsCommand request, CancellationToken ct)
    {
        var requestedSkus = request.Rows.Select(r => r.Sku).ToList();
        var existingSkus = await _context.Products
            .Where(p => requestedSkus.Contains(p.Sku))
            .Select(p => p.Sku)
            .ToListAsync(ct);
        var existingSkuSet = existingSkus.ToHashSet(StringComparer.OrdinalIgnoreCase);

        var skippedSkus = new List<string>();
        var createdCount = 0;

        foreach (var row in request.Rows)
        {
            if (existingSkuSet.Contains(row.Sku))
            {
                skippedSkus.Add(row.Sku);
                continue;
            }

            var product = new Product
            {
                Sku = row.Sku,
                Name = row.Name,
                Description = row.Description,
                Category = row.Category,
                BaseUnit = row.BaseUnit,
                ConversionFactorToBaseUnit = row.ConversionFactorToBaseUnit
            };

            product.PriceHistory.Add(new ProductPrice
            {
                CostPrice = row.CostPrice,
                SellingPrice = row.SellingPrice,
                RetailPrice = row.RetailPrice,
                GstPercent = row.GstPercent,
                FedPercent = row.FedPercent,
                WhtPercent = row.WhtPercent,
                IsCurrent = true
            });

            _context.Products.Add(product);
            existingSkuSet.Add(row.Sku); // guards against duplicate SKUs within the same upload batch
            createdCount++;
        }

        await _context.SaveChangesAsync(ct);
        return new BulkUploadResult(createdCount, skippedSkus);
    }
}
