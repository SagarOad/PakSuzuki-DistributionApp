using PakSuzuki.Domain.Common;

namespace PakSuzuki.Domain.Entities;

/// <summary>
/// Middleware pickup queue for SAP work. Column set is intentionally flexible
/// (JSON bags + ExtJson) so we can extend without blocking order flows before
/// the real SAP contract is finalized.
/// </summary>
public class SapOutboundQueue : AuditableEntity
{
    public Guid? OrderId { get; set; }
    public Order? Order { get; set; }

    /// <summary>OrderSubmission | StatusRefresh | BpCreate | DeliverySync | InvoiceSync</summary>
    public string QueueType { get; set; } = "OrderSubmission";

    /// <summary>Pending | Processing | Completed | Failed | Cancelled</summary>
    public string Status { get; set; } = "Pending";

    public string? CorrelationKey { get; set; }

    /// <summary>Request payload for middleware (schema TBD).</summary>
    public string? PayloadJson { get; set; }

    /// <summary>Raw SAP / middleware response (schema TBD).</summary>
    public string? ResponseJson { get; set; }

    public int AttemptCount { get; set; }
    public DateTime? NextAttemptAtUtc { get; set; }
    public DateTime? ProcessedAtUtc { get; set; }
    public string? LastError { get; set; }

    /// <summary>Open extension bag for future fields without a schema migration.</summary>
    public string? ExtJson { get; set; }
}
