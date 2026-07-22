using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Domain.Entities;

namespace PakSuzuki.Application.Features.Orders.Commands;

// 3.3.2: both distributor and retailer can upload a delivery-proof photo/document
// for an order; UploadedByUserId/Role are populated by the controller from the
// authenticated caller, never trusted from the request body.
public record UploadProofOfDeliveryCommand(
    Guid OrderId, Guid UploadedByUserId, string UploadedByRole, string FileName, Stream Content
) : IRequest<Guid>;

public class UploadProofOfDeliveryCommandValidator : AbstractValidator<UploadProofOfDeliveryCommand>
{
    public UploadProofOfDeliveryCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty();
        RuleFor(x => x.UploadedByUserId).NotEmpty();
        RuleFor(x => x.UploadedByRole).NotEmpty().Must(x => x is Domain.Enums.Roles.Distributor or Domain.Enums.Roles.Retailer);
        RuleFor(x => x.FileName).NotEmpty();
    }
}

public class UploadProofOfDeliveryCommandHandler : IRequestHandler<UploadProofOfDeliveryCommand, Guid>
{
    private const string ContainerName = "proof-of-delivery";

    private readonly IApplicationDbContext _context;
    private readonly IFileStorageService _fileStorage;

    public UploadProofOfDeliveryCommandHandler(IApplicationDbContext context, IFileStorageService fileStorage)
    {
        _context = context;
        _fileStorage = fileStorage;
    }

    public async Task<Guid> Handle(UploadProofOfDeliveryCommand request, CancellationToken ct)
    {
        var orderExists = await _context.Orders.AnyAsync(o => o.Id == request.OrderId, ct);
        if (!orderExists) throw new NotFoundException(nameof(Domain.Entities.Order), request.OrderId);

        var url = await _fileStorage.UploadAsync(request.Content, request.FileName, ContainerName, ct);

        var proof = new ProofOfDelivery
        {
            OrderId = request.OrderId,
            UploadedByUserId = request.UploadedByUserId,
            UploadedByRole = request.UploadedByRole,
            StorageUrl = url,
            FileName = request.FileName
        };

        _context.ProofsOfDelivery.Add(proof);
        await _context.SaveChangesAsync(ct);
        return proof.Id;
    }
}

public record ProofOfDeliveryDto(Guid Id, string StorageUrl, string FileName, Guid UploadedByUserId, string UploadedByRole, DateTime CreatedAtUtc);

public record GetProofsOfDeliveryQuery(Guid OrderId) : IRequest<List<ProofOfDeliveryDto>>;

public class GetProofsOfDeliveryQueryHandler : IRequestHandler<GetProofsOfDeliveryQuery, List<ProofOfDeliveryDto>>
{
    private readonly IApplicationDbContext _context;
    public GetProofsOfDeliveryQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<List<ProofOfDeliveryDto>> Handle(GetProofsOfDeliveryQuery request, CancellationToken ct)
    {
        var orderExists = await _context.Orders.AnyAsync(o => o.Id == request.OrderId, ct);
        if (!orderExists) throw new NotFoundException(nameof(Domain.Entities.Order), request.OrderId);

        return await _context.ProofsOfDelivery
            .Where(p => p.OrderId == request.OrderId)
            .OrderByDescending(p => p.CreatedAtUtc)
            .Select(p => new ProofOfDeliveryDto(p.Id, p.StorageUrl, p.FileName, p.UploadedByUserId, p.UploadedByRole, p.CreatedAtUtc))
            .ToListAsync(ct);
    }
}
