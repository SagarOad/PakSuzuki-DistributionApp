using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Products.Queries;

// Role-based price visibility per 3.2 (same rule as GetProductsQuery):
//   SuperAdmin -> full pricing (cost + selling + retail + margin)
//   Distributor -> selling + retail + margin
//   Retailer -> retail price only
public record ProductPriceDto(
    Guid Id, decimal? CostPrice, decimal SellingPrice, decimal RetailPrice,
    decimal GstPercent, decimal FedPercent, decimal WhtPercent,
    decimal? MarginFixed, decimal? MarginPercent,
    DateTime EffectiveFromUtc, DateTime? EffectiveToUtc, bool IsCurrent);

public record ProductDetailDto(
    Guid Id, string Sku, string Name, string? Description, string Category, string BaseUnit,
    decimal ConversionFactorToBaseUnit, bool IsActive, DateTime CreatedAtUtc,
    ProductPriceDto? CurrentPrice, List<ProductPriceDto> PriceHistory);

public record GetProductByIdQuery(Guid Id, string ViewerRole) : IRequest<ProductDetailDto>;

public class GetProductByIdQueryHandler : IRequestHandler<GetProductByIdQuery, ProductDetailDto>
{
    private readonly IApplicationDbContext _context;
    public GetProductByIdQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<ProductDetailDto> Handle(GetProductByIdQuery request, CancellationToken ct)
    {
        var product = await _context.Products.Include(p => p.PriceHistory)
            .FirstOrDefaultAsync(p => p.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Product), request.Id);

        var isSuperAdmin = request.ViewerRole == Roles.SuperAdmin;
        var canSeeDistributorPricing = isSuperAdmin || request.ViewerRole == Roles.Distributor;

        var priceHistory = product.PriceHistory
            .OrderByDescending(pp => pp.EffectiveFromUtc)
            .Select(pp => MapPrice(pp, isSuperAdmin, canSeeDistributorPricing))
            .ToList();

        var currentPrice = priceHistory.FirstOrDefault(pp => pp.IsCurrent);

        return new ProductDetailDto(
            product.Id, product.Sku, product.Name, product.Description, product.Category.ToString(),
            product.BaseUnit.ToString(), product.ConversionFactorToBaseUnit, product.IsActive,
            product.CreatedAtUtc, currentPrice, priceHistory);
    }

    private static ProductPriceDto MapPrice(Domain.Entities.ProductPrice pp, bool isSuperAdmin, bool canSeeDistributorPricing) =>
        new(
            pp.Id,
            isSuperAdmin ? pp.CostPrice : null,
            pp.SellingPrice,
            pp.RetailPrice,
            pp.GstPercent, pp.FedPercent, pp.WhtPercent,
            canSeeDistributorPricing ? pp.MarginFixed : null,
            canSeeDistributorPricing ? pp.MarginPercent : null,
            pp.EffectiveFromUtc, pp.EffectiveToUtc, pp.IsCurrent);
}

// Full, unfiltered price history - intended for internal/SuperAdmin audit views;
// callers that need role-based masking should use GetProductByIdQuery instead.
public record GetProductPriceHistoryQuery(Guid ProductId) : IRequest<List<ProductPriceDto>>;

public class GetProductPriceHistoryQueryHandler : IRequestHandler<GetProductPriceHistoryQuery, List<ProductPriceDto>>
{
    private readonly IApplicationDbContext _context;
    public GetProductPriceHistoryQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<List<ProductPriceDto>> Handle(GetProductPriceHistoryQuery request, CancellationToken ct)
    {
        var exists = await _context.Products.AnyAsync(p => p.Id == request.ProductId, ct);
        if (!exists) throw new NotFoundException(nameof(Domain.Entities.Product), request.ProductId);

        return await _context.ProductPrices
            .Where(pp => pp.ProductId == request.ProductId)
            .OrderByDescending(pp => pp.EffectiveFromUtc)
            .Select(pp => new ProductPriceDto(
                pp.Id, pp.CostPrice, pp.SellingPrice, pp.RetailPrice,
                pp.GstPercent, pp.FedPercent, pp.WhtPercent, pp.MarginFixed, pp.MarginPercent,
                pp.EffectiveFromUtc, pp.EffectiveToUtc, pp.IsCurrent))
            .ToListAsync(ct);
    }
}
