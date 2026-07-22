namespace PakSuzuki.Application.Common.Interfaces;

// Stubbed now, implemented in Infrastructure once Pak Suzuki shares SAP endpoint
// specs. Kept as an interface from day one so Order handlers can be wired against
// it without waiting on the SAP integration to be finished (3.3.3, section on SAP APIs).
public interface ISapIntegrationService
{
    Task<SapOrderSubmissionResult> SubmitOrderAsync(Guid orderId, CancellationToken ct = default);
    Task<SapOrderStatusResult> GetOrderStatusAsync(string sapDocumentNumber, CancellationToken ct = default);
}

public record SapOrderSubmissionResult(bool Success, string? SapDocumentNumber, string? ErrorMessage);
public record SapOrderStatusResult(string? DeliveryNumber, string? GrnNumber, string? InvoiceNumber, bool IsInvoiced);
