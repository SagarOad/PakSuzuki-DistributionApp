namespace PakSuzuki.Application.Common.Interfaces;

public interface IAppNotificationService
{
    Task NotifyUserAsync(
        Guid userId,
        string title,
        string message,
        string category,
        string? linkUrl = null,
        Guid? relatedEntityId = null,
        CancellationToken ct = default);

    Task NotifyUsersAsync(
        IEnumerable<Guid> userIds,
        string title,
        string message,
        string category,
        string? linkUrl = null,
        Guid? relatedEntityId = null,
        CancellationToken ct = default);

    Task NotifyDistributorAsync(
        Guid distributorId,
        string title,
        string message,
        string category,
        string? linkUrl = null,
        Guid? relatedEntityId = null,
        CancellationToken ct = default);

    Task NotifyRetailerAsync(
        Guid retailerId,
        string title,
        string message,
        string category,
        string? linkUrl = null,
        Guid? relatedEntityId = null,
        CancellationToken ct = default);

    /// <summary>Notify SuperAdmin and Admin users.</summary>
    Task NotifyStaffAsync(
        string title,
        string message,
        string category,
        string? linkUrl = null,
        Guid? relatedEntityId = null,
        CancellationToken ct = default);
}

public static class NotificationCategories
{
    public const string Order = "Order";
    public const string Incentive = "Incentive";
    public const string Registration = "Registration";
    public const string Claim = "Claim";
    public const string System = "System";
}
