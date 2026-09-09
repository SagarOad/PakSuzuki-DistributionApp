using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using PakSuzuki.Application.Common.Exceptions;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Auth.Commands;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Distributors.Commands;

// Only SuperAdmin (PSMCL) gives final approval per doc section 2.1 / 3.1.
// Authorization (role check) is enforced at the controller/pipeline level, not here.
public record ApproveDistributorCommand(Guid DistributorId, ApprovalStatus Decision, string? Remarks) : IRequest;

public class ApproveDistributorCommandValidator : AbstractValidator<ApproveDistributorCommand>
{
    public ApproveDistributorCommandValidator()
    {
        RuleFor(x => x.DistributorId).NotEmpty();
        RuleFor(x => x.Decision).IsInEnum();
    }
}

public class ApproveDistributorCommandHandler : IRequestHandler<ApproveDistributorCommand>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    private readonly IDateTimeService _dateTime;
    private readonly IIdentityService _identity;
    private readonly IEmailNotificationService _email;
    private readonly IAppNotificationService _notifications;
    private readonly ILogger<ApproveDistributorCommandHandler> _logger;

    public ApproveDistributorCommandHandler(
        IApplicationDbContext context,
        ICurrentUserService currentUser,
        IDateTimeService dateTime,
        IIdentityService identity,
        IEmailNotificationService email,
        IAppNotificationService notifications,
        ILogger<ApproveDistributorCommandHandler> logger)
    {
        _context = context;
        _currentUser = currentUser;
        _dateTime = dateTime;
        _identity = identity;
        _email = email;
        _notifications = notifications;
        _logger = logger;
    }

    public async Task Handle(ApproveDistributorCommand request, CancellationToken ct)
    {
        var distributor = await _context.Distributors.FirstOrDefaultAsync(d => d.Id == request.DistributorId, ct)
            ?? throw new NotFoundException(nameof(Domain.Entities.Distributor), request.DistributorId);

        distributor.ApprovalStatus = request.Decision;
        distributor.ApprovalRemarks = request.Remarks;

        if (request.Decision == ApprovalStatus.Approved)
        {
            distributor.ApprovedAtUtc = _dateTime.UtcNow;
            distributor.ApprovedByUserId = _currentUser.UserId;
            distributor.IsActive = true;
            await _identity.SetUserActiveAsync(distributor.ApplicationUserId, true, ct);
            await _identity.TouchLastLoginAsync(distributor.ApplicationUserId, ct);
        }
        else
        {
            distributor.IsActive = false;
            await _identity.SetUserActiveAsync(
                distributor.ApplicationUserId,
                request.Decision == ApprovalStatus.SentBackForCorrection,
                ct);
        }

        await _context.SaveChangesAsync(ct);

        await _notifications.NotifyUserAsync(
            distributor.ApplicationUserId,
            "Registration update",
            $"Your distributor registration was marked as {request.Decision}.",
            NotificationCategories.Registration,
            "/settings",
            distributor.Id,
            ct);

        await NotifyDecisionAsync(distributor.Email, distributor.Name, "Distributor", request.Decision, request.Remarks, ct);
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
