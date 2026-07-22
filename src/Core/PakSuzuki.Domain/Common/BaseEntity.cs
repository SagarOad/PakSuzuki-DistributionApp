namespace PakSuzuki.Domain.Common;

// Every aggregate/entity inherits this. Guid PKs are deliberate: distributors/retailers
// can be created offline in the mobile app and synced later without PK collisions.
public abstract class BaseEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
}

// Adds audit + soft-delete. Orders, registrations and approvals all need a durable
// audit trail for compliance and SAP reconciliation.
public abstract class AuditableEntity : BaseEntity, ISoftDeletable
{
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public string? CreatedBy { get; set; }
    public DateTime? ModifiedAtUtc { get; set; }
    public string? ModifiedBy { get; set; }
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAtUtc { get; set; }
    public string? DeletedBy { get; set; }
}

public interface ISoftDeletable
{
    bool IsDeleted { get; set; }
}

// Domain events let an aggregate announce "something happened" (e.g. OrderApproved)
// without knowing who cares (notifications, SAP sync, dashboards). Dispatched via
// MediatR from the EF SaveChanges interceptor in Infrastructure.
public abstract class DomainEvent
{
    public DateTime OccurredOnUtc { get; protected set; } = DateTime.UtcNow;
}

public abstract class EntityWithDomainEvents : AuditableEntity
{
    private readonly List<DomainEvent> _domainEvents = new();
    public IReadOnlyCollection<DomainEvent> DomainEvents => _domainEvents.AsReadOnly();
    public void AddDomainEvent(DomainEvent domainEvent) => _domainEvents.Add(domainEvent);
    public void ClearDomainEvents() => _domainEvents.Clear();
}
