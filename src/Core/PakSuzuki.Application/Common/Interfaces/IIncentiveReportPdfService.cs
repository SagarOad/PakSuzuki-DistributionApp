using PakSuzuki.Application.Features.IncentiveSchemes;

namespace PakSuzuki.Application.Common.Interfaces;

public interface IIncentiveReportPdfService
{
    Task<byte[]> BuildDistributorSchemePdfAsync(
        SchemeEvaluationDto evaluation,
        DistributorSchemeResultDto distributor,
        IncentiveSignatoriesDto signatories,
        CancellationToken ct = default);
}
