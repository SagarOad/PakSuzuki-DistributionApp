using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Common.Models;
using PakSuzuki.Domain.Entities;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Shop.Banners;

public record ShopBannerDto(
    Guid Id, string Type, string ProductCode, string? BannerName, string CategoryName,
    string ImageUrl, Guid? ProductId, string? ProductName, bool IsActive, int SortOrder);

public record GetShopBannersQuery(ShopBannerType? Type, string? Search, int PageNumber = 1, int PageSize = 20)
    : IRequest<PaginatedList<ShopBannerDto>>;

public class GetShopBannersQueryHandler : IRequestHandler<GetShopBannersQuery, PaginatedList<ShopBannerDto>>
{
    private readonly IApplicationDbContext _context;
    public GetShopBannersQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<PaginatedList<ShopBannerDto>> Handle(GetShopBannersQuery request, CancellationToken ct)
    {
        var query = _context.ShopBanners.AsQueryable()
            .Where(b => request.Type == null || b.Type == request.Type)
            .Where(b => request.Search == null
                || b.ProductCode.Contains(request.Search)
                || b.CategoryName.Contains(request.Search)
                || (b.BannerName != null && b.BannerName.Contains(request.Search)))
            .OrderBy(b => b.SortOrder).ThenByDescending(b => b.CreatedAtUtc)
            .Select(b => new ShopBannerDto(
                b.Id, b.Type.ToString(), b.ProductCode, b.BannerName, b.CategoryName,
                b.ImageUrl, b.ProductId, b.Product != null ? b.Product.Name : null, b.IsActive, b.SortOrder));

        return await PaginatedList<ShopBannerDto>.CreateAsync(query, request.PageNumber, request.PageSize);
    }
}

public record GetShopBannerByIdQuery(Guid Id) : IRequest<ShopBannerDto>;

public class GetShopBannerByIdQueryHandler : IRequestHandler<GetShopBannerByIdQuery, ShopBannerDto>
{
    private readonly IApplicationDbContext _context;
    public GetShopBannerByIdQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<ShopBannerDto> Handle(GetShopBannerByIdQuery request, CancellationToken ct)
    {
        var b = await _context.ShopBanners.Include(x => x.Product)
            .FirstOrDefaultAsync(x => x.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(ShopBanner), request.Id);

        return new ShopBannerDto(
            b.Id, b.Type.ToString(), b.ProductCode, b.BannerName, b.CategoryName,
            b.ImageUrl, b.ProductId, b.Product?.Name, b.IsActive, b.SortOrder);
    }
}

public record UpsertShopBannerCommand(
    Guid? Id, ShopBannerType Type, string ProductCode, string? BannerName, string CategoryName,
    string? ImageUrl, Guid? ProductId, bool IsActive = true, int SortOrder = 0
) : IRequest<Guid>;

public class UpsertShopBannerCommandValidator : AbstractValidator<UpsertShopBannerCommand>
{
    public UpsertShopBannerCommandValidator()
    {
        RuleFor(x => x.ProductCode).NotEmpty().MaximumLength(50);
        RuleFor(x => x.CategoryName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.BannerName).MaximumLength(200)
            .When(x => x.Type == ShopBannerType.Category);
    }
}

public class UpsertShopBannerCommandHandler : IRequestHandler<UpsertShopBannerCommand, Guid>
{
    private readonly IApplicationDbContext _context;
    public UpsertShopBannerCommandHandler(IApplicationDbContext context) => _context = context;

    public async Task<Guid> Handle(UpsertShopBannerCommand request, CancellationToken ct)
    {
        ShopBanner banner;
        if (request.Id is Guid id)
        {
            banner = await _context.ShopBanners.FirstOrDefaultAsync(b => b.Id == id, ct)
                ?? throw new NotFoundException(nameof(ShopBanner), id);
        }
        else
        {
            banner = new ShopBanner();
            _context.ShopBanners.Add(banner);
        }

        banner.Type = request.Type;
        banner.ProductCode = request.ProductCode.Trim();
        banner.BannerName = request.Type == ShopBannerType.Category
            ? (request.BannerName?.Trim() ?? request.CategoryName.Trim())
            : request.BannerName?.Trim();
        banner.CategoryName = request.CategoryName.Trim();
        if (!string.IsNullOrWhiteSpace(request.ImageUrl))
            banner.ImageUrl = request.ImageUrl;
        banner.ProductId = request.ProductId;
        banner.IsActive = request.IsActive;
        banner.SortOrder = request.SortOrder;

        await _context.SaveChangesAsync(ct);
        return banner.Id;
    }
}

public record DeleteShopBannerCommand(Guid Id) : IRequest;

public class DeleteShopBannerCommandHandler : IRequestHandler<DeleteShopBannerCommand>
{
    private readonly IApplicationDbContext _context;
    public DeleteShopBannerCommandHandler(IApplicationDbContext context) => _context = context;

    public async Task Handle(DeleteShopBannerCommand request, CancellationToken ct)
    {
        var banner = await _context.ShopBanners.FirstOrDefaultAsync(b => b.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(ShopBanner), request.Id);
        _context.ShopBanners.Remove(banner);
        await _context.SaveChangesAsync(ct);
    }
}

public record UploadShopBannerImageCommand(Guid Id, string FileName, Stream Content) : IRequest<string>;

public class UploadShopBannerImageCommandHandler : IRequestHandler<UploadShopBannerImageCommand, string>
{
    private const string Container = "shop-banners";
    private readonly IApplicationDbContext _context;
    private readonly IFileStorageService _files;

    public UploadShopBannerImageCommandHandler(IApplicationDbContext context, IFileStorageService files)
    {
        _context = context;
        _files = files;
    }

    public async Task<string> Handle(UploadShopBannerImageCommand request, CancellationToken ct)
    {
        var banner = await _context.ShopBanners.FirstOrDefaultAsync(b => b.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(ShopBanner), request.Id);
        var url = await _files.UploadAsync(request.Content, request.FileName, Container, ct);
        banner.ImageUrl = url;
        await _context.SaveChangesAsync(ct);
        return url;
    }
}
