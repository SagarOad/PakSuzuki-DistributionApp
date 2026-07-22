using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Auth.Commands;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Retailers.Commands;

// Two-step approval: Distributor reviews first, then SuperAdmin (PSMCL) gives final
// approval (3.1). "ApprovingAs" is set by the controller from the caller's role.
public record ApproveRetailerCommand(Guid RetailerId, string ApprovingAs, ApprovalStatus Decision, string? Remarks) : IRequest;

public class ApproveRetailerCommandValidator : AbstractValidator<ApproveRetailerCommand>
{
    public ApproveRetailerCommandValidator()
    {
        RuleFor(x => x.RetailerId).NotEmpty();
        RuleFor(x => x.Decision).IsInEnum();
        RuleFor(x => x.ApprovingAs).Must(x => x is Roles.Distributor or Roles.SuperAdmin);
    }
}

public class ApproveRetailerCommandHandler : IRequestHandler<ApproveRetailerCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    private readonly IIdentityService _identity;
    private readonly IEmailNotificationService _email;
    private readonly ILogger<ApproveRetailerCommandHandler> _logger;

    public ApproveRetailerCommandHandler(
        IApplicationDbContext context,
        ICurrentUserService currentUser,
        IIdentityService identity,
        IEmailNotificationService email,
        ILogger<ApproveRetailerCommandHandler> logger)
    {
        _context = context;
        _currentUser = currentUser;
        _identity = identity;
        _email = email;
        _logger = logger;
    }

    public async Task Handle(ApproveRetailerCommand request, CancellationToken ct)
    {
        var retailer = await _context.Retailers.FirstOrDefaultAsync(r => r.Id == request.RetailerId, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Retailer), request.RetailerId);

        if (request.ApprovingAs == Roles.Distributor)
        {
            if (_currentUser.DistributorId is null || retailer.DistributorId != _currentUser.DistributorId)
                throw new ForbiddenAccessException("You can only review retailers registered under your distributorship.");

            retailer.DistributorApprovalStatus = request.Decision;
            if (request.Decision != ApprovalStatus.Approved)
            {
                retailer.SuperAdminApprovalStatus = ApprovalStatus.PendingReview;
                retailer.IsActive = false;
                await _identity.SetUserActiveAsync(
                    retailer.ApplicationUserId,
                    request.Decision == ApprovalStatus.SentBackForCorrection,
                    ct);
            }
        }
        else
        {
            if (retailer.DistributorApprovalStatus != ApprovalStatus.Approved)
                throw new ConflictException("Retailer must be approved by its distributor before Super Admin final approval.");

            retailer.SuperAdminApprovalStatus = request.Decision;
            retailer.IsActive = request.Decision == ApprovalStatus.Approved;
            var loginAllowed = request.Decision is ApprovalStatus.Approved or ApprovalStatus.SentBackForCorrection;
            await _identity.SetUserActiveAsync(retailer.ApplicationUserId, loginAllowed, ct);
        }

        retailer.ApprovalRemarks = request.Remarks;
        await _context.SaveChangesAsync(ct);

        var shouldNotify = request.ApprovingAs == Roles.Distributor
            ? request.Decision is ApprovalStatus.Rejected or ApprovalStatus.SentBackForCorrection
            : request.Decision is ApprovalStatus.Approved or ApprovalStatus.Rejected or ApprovalStatus.SentBackForCorrection;

        if (shouldNotify)
            await NotifyDecisionAsync(retailer.Email, retailer.Name, "Retailer", request.Decision, request.Remarks, ct);
    }

    private async Task NotifyDecisionAsync(
        string email, string name, string accountType, ApprovalStatus decision, string? remarks, CancellationToken ct)
    {
        try
        {
            switch (decision)
            {
                case ApprovalStatus.Approved:
                    await _email.SendAccountApprovedAsync(email, name, accountType, ct);
                    break;
                case ApprovalStatus.Rejected:
                    await _email.SendAccountRejectedAsync(email, name, accountType, remarks, ct);
                    break;
                case ApprovalStatus.SentBackForCorrection:
                    await _email.SendAccountSentBackAsync(email, name, accountType, remarks, ct);
                    break;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send {Decision} email to {Email}", decision, email);
        }
    }
}
