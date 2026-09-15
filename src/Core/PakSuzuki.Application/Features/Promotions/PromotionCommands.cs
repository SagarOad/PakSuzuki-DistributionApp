using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Images;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Common.Models;
using PakSuzuki.Domain.Entities;

namespace PakSuzuki.Application.Features.Promotions;

public record PromotionListDto(
    Guid Id, string Title, string Type, string ImageUrl, string? RedirectUrl,
    string TargetRoles, bool IsActive, DateTime StartDateUtc, DateTime EndDateUtc, DateTime CreatedAtUtc);

public record UpsertPromotionCommand(
    Guid? Id, string Title, string Type, string? ImageUrl, string? RedirectUrl,
    string TargetRoles, bool IsActive, DateTime? StartDateUtc, DateTime? EndDateUtc,
    Stream? ImageContent, string? ImageFileName
) : IRequest<Guid>;

public record DeletePromotionCommand(Guid Id) : IRequest;

public record GetPromotionsQuery(string? Type, string? Search, int PageNumber = 1, int PageSize = 20)
    : IRequest<PaginatedList<PromotionListDto>>;

public record GetPromotionByIdQuery(Guid Id) : IRequest<PromotionListDto>;

public class UpsertPromotionCommandValidator : AbstractValidator<UpsertPromotionCommand>
{
    private static readonly string[] Allowed =
    {
        BannerImageAspect.LoginPopup,
        BannerImageAspect.NewsletterPopUp,
        BannerImageAspect.PromotionBanner,
        "PromoPopup"
    };

    public UpsertPromotionCommandValidator()
    {
        RuleFor(x => x.Title).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Type).Must(t => Allowed.Contains(t, StringComparer.OrdinalIgnoreCase))
            .WithMessage("Type must be LoginPopup.");
        RuleFor(x => x.TargetRoles).NotEmpty();
    }
}

public class GetPromotionsQueryHandler : IRequestHandler<GetPromotionsQuery, PaginatedList<PromotionListDto>>
{
    private readonly IApplicationDbContext _context;
    public GetPromotionsQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<PaginatedList<PromotionListDto>> Handle(GetPromotionsQuery request, CancellationToken ct)
    {
        var query = _context.Promotions.AsQueryable();
        if (!string.IsNullOrWhiteSpace(request.Type))
        {
            var type = BannerImageAspect.NormalizePromotionType(request.Type);
            if (BannerImageAspect.IsLoginPopupType(type))
            {
                query = query.Where(p =>
                    p.Type == BannerImageAspect.LoginPopup
                    || p.Type == BannerImageAspect.NewsletterPopUp
                    || p.Type == BannerImageAspect.PromotionBanner
                    || p.Type == "PromoPopup");
            }
            else
            {
                query = query.Where(p => p.Type == request.Type);
            }
        }
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.Trim();
            query = query.Where(p => p.Title.Contains(s));
        }

        var projected = query
            .OrderByDescending(p => p.CreatedAtUtc)
            .Select(p => new PromotionListDto(
                p.Id, p.Title, p.Type, p.ImageUrl, p.RedirectUrl,
                p.TargetRoles, p.IsActive, p.StartDateUtc, p.EndDateUtc, p.CreatedAtUtc));

        var page = await PaginatedList<PromotionListDto>.CreateAsync(projected, request.PageNumber, request.PageSize);
        var normalized = page.Items.Select(p => p with { Type = BannerImageAspect.NormalizePromotionType(p.Type) }).ToList();
        return new PaginatedList<PromotionListDto>(normalized, page.TotalCount, page.PageNumber, request.PageSize);
    }
}

public class GetPromotionByIdQueryHandler : IRequestHandler<GetPromotionByIdQuery, PromotionListDto>
{
    private readonly IApplicationDbContext _context;
    public GetPromotionByIdQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<PromotionListDto> Handle(GetPromotionByIdQuery request, CancellationToken ct)
    {
        var p = await _context.Promotions.FirstOrDefaultAsync(x => x.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Promotion), request.Id);
        return new PromotionListDto(
            p.Id, p.Title, BannerImageAspect.NormalizePromotionType(p.Type), p.ImageUrl, p.RedirectUrl,
            p.TargetRoles, p.IsActive, p.StartDateUtc, p.EndDateUtc, p.CreatedAtUtc);
    }
}

public class UpsertPromotionCommandHandler : IRequestHandler<UpsertPromotionCommand, Guid>
{
    private readonly IApplicationDbContext _context;
    private readonly IFileStorageService _files;
    private readonly IDateTimeService _dateTime;
    private const string Container = "promotions";

    public UpsertPromotionCommandHandler(
        IApplicationDbContext context, IFileStorageService files, IDateTimeService dateTime)
    {
        _context = context;
        _files = files;
        _dateTime = dateTime;
    }

    public async Task<Guid> Handle(UpsertPromotionCommand request, CancellationToken ct)
    {
        Promotion promotion;
        if (request.Id is Guid id)
        {
            promotion = await _context.Promotions.FirstOrDefaultAsync(p => p.Id == id, ct)
                ?? throw new NotFoundException(nameof(Promotion), id);
        }
        else
        {
            promotion = new Promotion();
            _context.Promotions.Add(promotion);
        }

        if (request.ImageContent != null && !string.IsNullOrWhiteSpace(request.ImageFileName))
        {
            await using var buffer = new MemoryStream();
            await request.ImageContent.CopyToAsync(buffer, ct);
            buffer.Position = 0;
            BannerImageAspect.EnsureValid(buffer, BannerImageAspect.LoginPopup);
            buffer.Position = 0;
            promotion.ImageUrl = await _files.UploadAsync(
                buffer, request.ImageFileName, Container, ct);
        }
        else if (string.IsNullOrWhiteSpace(promotion.ImageUrl))
        {
            if (!string.IsNullOrWhiteSpace(request.ImageUrl))
                promotion.ImageUrl = request.ImageUrl!;
            else
                throw new ConflictException("Banner image is required.");
        }

        var now = _dateTime.UtcNow;

        promotion.Title = request.Title.Trim();
        promotion.Type = BannerImageAspect.LoginPopup;
        promotion.RedirectUrl = string.IsNullOrWhiteSpace(request.RedirectUrl) ? null : request.RedirectUrl.Trim();
        promotion.TargetRoles = request.TargetRoles;
        promotion.IsActive = request.IsActive;
        promotion.ImageWidth = 800;
        promotion.ImageHeight = 600;
        promotion.StartDateUtc = request.StartDateUtc?.Date ?? now.Date;
        // Keep the whole end calendar day valid (avoid midnight truncation excluding “today”).
        var endDay = request.EndDateUtc?.Date ?? now.Date.AddYears(1);
        promotion.EndDateUtc = endDay.Date.AddDays(1).AddTicks(-1);

        await _context.SaveChangesAsync(ct);
        return promotion.Id;
    }
}

public class DeletePromotionCommandHandler : IRequestHandler<DeletePromotionCommand>
{
    private readonly IApplicationDbContext _context;
    public DeletePromotionCommandHandler(IApplicationDbContext context) => _context = context;

    public async Task Handle(DeletePromotionCommand request, CancellationToken ct)
    {
        var promotion = await _context.Promotions.FirstOrDefaultAsync(p => p.Id == request.Id, ct)
            ?? throw new NotFoundException(nameof(Promotion), request.Id);
        _context.Promotions.Remove(promotion);
        await _context.SaveChangesAsync(ct);
    }
}
