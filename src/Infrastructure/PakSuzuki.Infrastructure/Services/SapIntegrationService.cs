using PakSuzuki.Application.Common.Interfaces;

namespace PakSuzuki.Infrastructure.Services;

// Placeholder until Pak Suzuki shares actual SAP endpoint specs. Stub returns
// deterministic fake document numbers so the order lifecycle can be exercised end-to-end.
public class SapIntegrationService : ISapIntegrationService
{
    public Task<SapOrderSubmissionResult> SubmitOrderAsync(Guid orderId, CancellationToken ct = default)
    {
        var doc = $"SAP-{orderId.ToString("N")[..12].ToUpperInvariant()}";
        return Task.FromResult(new SapOrderSubmissionResult(true, doc, null));
    }

    public Task<SapOrderStatusResult> GetOrderStatusAsync(string sapDocumentNumber, CancellationToken ct = default)
    {
        var suffix = sapDocumentNumber.Length >= 6 ? sapDocumentNumber[^6..] : sapDocumentNumber;
        return Task.FromResult(new SapOrderStatusResult(
            DeliveryNumber: $"DL-{suffix}",
            GrnNumber: $"GRN-{suffix}",
            InvoiceNumber: $"INV-{suffix}",
            IsInvoiced: true));
    }
}
