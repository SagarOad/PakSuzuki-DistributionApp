using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Common.Models;
using PakSuzuki.Domain.Entities;

namespace PakSuzuki.Application.Features.IncentiveSchemes;

public record ProductGroupMemberDto(Guid ProductId, string PartItemNo, string ProductName);
public record ProductGroupListDto(Guid Id, string Name, string? Description, bool IsActive, int MemberCount);
public record ProductGroupDetailDto(
    Guid Id, string Name, string? Description, bool IsActive, List<ProductGroupMemberDto> Members);

public record GetProductGroupsQuery(string? Search, int PageNumber = 1, int PageSize = 50)
    : IRequest<PaginatedList<ProductGroupListDto>>;

public class GetProductGroupsQueryHandler : IRequestHandler<GetProductGroupsQuery, PaginatedList<ProductGroupListDto>>
{
    private readonly IApplicationDbContext _context;
    public GetProductGroupsQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<PaginatedList<ProductGroupListDto>> Handle(GetProductGroupsQuery request, CancellationToken ct)
    {
        var q = _context.ProductGroups.AsNoTracking().Where(g => !g.IsDeleted);
        if (!string.IsNullOrWhiteSpace(request.Search))
            q = q.Where(g => g.Name.Contains(request.Search));

        var total = await q.CountAsync(ct);
        var page = await q.OrderBy(g => g.Name)
            .Skip((request.PageNumber - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(g => new ProductGroupListDto(
                g.Id, g.Name, g.Description, g.IsActive, g.Members.Count(m => !m.IsDeleted)))
            .ToListAsync(ct);
        return new PaginatedList<ProductGroupListDto>(page, total, request.PageNumber, request.PageSize);
    }
}

public record GetProductGroupByIdQuery(Guid Id) : IRequest<ProductGroupDetailDto>;

public class GetProductGroupByIdQueryHandler : IRequestHandler<GetProductGroupByIdQuery, ProductGroupDetailDto>
{
    private readonly IApplicationDbContext _context;
    public GetProductGroupByIdQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<ProductGroupDetailDto> Handle(GetProductGroupByIdQuery request, CancellationToken ct)
    {
        var g = await _context.ProductGroups.AsNoTracking()
            .Include(x => x.Members).ThenInclude(m => m.Product)
            .FirstOrDefaultAsync(x => x.Id == request.Id && !x.IsDeleted, ct)
            ?? throw new NotFoundException(nameof(ProductGroup), request.Id);

        return new ProductGroupDetailDto(
            g.Id, g.Name, g.Description, g.IsActive,
            g.Members.Where(m => !m.IsDeleted)
                .Select(m => new ProductGroupMemberDto(m.ProductId, m.PartItemNo, m.Product.Name))
                .OrderBy(m => m.PartItemNo)
                .ToList());
    }
}

public record UpsertProductGroupCommand(
    Guid? Id, string Name, string? Description, bool IsActive, List<Guid> ProductIds) : IRequest<Guid>;

public class UpsertProductGroupCommandValidator : AbstractValidator<UpsertProductGroupCommand>
{
    public UpsertProductGroupCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.ProductIds).NotEmpty().WithMessage("Select at least one product.");
    }
}

public class UpsertProductGroupCommandHandler : IRequestHandler<UpsertProductGroupCommand, Guid>
{
    private readonly IApplicationDbContext _context;
    public UpsertProductGroupCommandHandler(IApplicationDbContext context) => _context = context;

    public async Task<Guid> Handle(UpsertProductGroupCommand request, CancellationToken ct)
    {
        var products = await _context.Products
            .Where(p => request.ProductIds.Contains(p.Id) && p.IsActive)
            .ToListAsync(ct);
        if (products.Count != request.ProductIds.Distinct().Count())
            throw new ConflictException("One or more selected products were not found or inactive.");

        ProductGroup group;
        if (request.Id is Guid id)
        {
            group = await _context.ProductGroups
                .Include(g => g.Members)
                .FirstOrDefaultAsync(g => g.Id == id && !g.IsDeleted, ct)
                ?? throw new NotFoundException(nameof(ProductGroup), id);
        }
        else
        {
            group = new ProductGroup();
            _context.ProductGroups.Add(group);
        }

        group.Name = request.Name.Trim();
        group.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        group.IsActive = request.IsActive;

        var keep = request.ProductIds.ToHashSet();
        foreach (var existing in group.Members.Where(m => !keep.Contains(m.ProductId)).ToList())
            _context.ProductGroupMembers.Remove(existing);

        var have = group.Members.Select(m => m.ProductId).ToHashSet();
        foreach (var p in products.Where(p => !have.Contains(p.Id)))
        {
            group.Members.Add(new ProductGroupMember
            {
                ProductId = p.Id,
                PartItemNo = p.Sku
            });
        }

        foreach (var m in group.Members.Where(m => keep.Contains(m.ProductId)))
        {
            var p = products.First(x => x.Id == m.ProductId);
            m.PartItemNo = p.Sku;
        }

        await _context.SaveChangesAsync(ct);
        return group.Id;
    }
}

public record DeleteProductGroupCommand(Guid Id) : IRequest;

public class DeleteProductGroupCommandHandler : IRequestHandler<DeleteProductGroupCommand>
{
    private readonly IApplicationDbContext _context;
    public DeleteProductGroupCommandHandler(IApplicationDbContext context) => _context = context;

    public async Task Handle(DeleteProductGroupCommand request, CancellationToken ct)
    {
        var g = await _context.ProductGroups.FirstOrDefaultAsync(x => x.Id == request.Id && !x.IsDeleted, ct)
            ?? throw new NotFoundException(nameof(ProductGroup), request.Id);
        var inUse = await _context.IncentiveSchemes.AnyAsync(s => s.ProductGroupId == g.Id && !s.IsDeleted, ct);
        if (inUse)
            throw new ConflictException("Cannot delete a product group that is used by an incentive scheme.");
        g.IsDeleted = true;
        g.DeletedAtUtc = DateTime.UtcNow;
        await _context.SaveChangesAsync(ct);
    }
}
