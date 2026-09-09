using PakSuzuki.Application.Common.Interfaces;

namespace PakSuzuki.Application.Common.Interfaces;

public interface ISapIntegrationService
{
    Task<SapOrderSubmissionResult> SubmitOrderAsync(Guid orderId, CancellationToken ct = default);
    Task<SapOrderSubmissionResult> RetryOrderAsync(Guid orderId, CancellationToken ct = default);
    Task<SapOrderStatusResult> GetOrderStatusAsync(string sapDocumentNumber, CancellationToken ct = default);
    Task ApplyMiddlewareUpdatesToOrderAsync(Guid orderId, CancellationToken ct = default);
}

public record SapOrderSubmissionResult(bool Success, string? SapDocumentNumber, string? ErrorMessage);
public record SapOrderStatusResult(string? DeliveryNumber, string? GrnNumber, string? InvoiceNumber, bool IsInvoiced);
