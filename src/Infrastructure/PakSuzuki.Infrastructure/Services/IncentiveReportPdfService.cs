using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.IncentiveSchemes;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace PakSuzuki.Infrastructure.Services;

public class IncentiveReportPdfService : IIncentiveReportPdfService
{
    static IncentiveReportPdfService()
    {
        QuestPDF.Settings.License = LicenseType.Community;
    }

    public Task<byte[]> BuildDistributorSchemePdfAsync(
        SchemeEvaluationDto evaluation,
        DistributorSchemeResultDto distributor,
        IncentiveSignatoriesDto signatories,
        CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();

        var periodLabel =
            $"{evaluation.CurrentPeriodStartUtc:MMM yyyy} – {evaluation.CurrentPeriodEndUtc:MMM yyyy}";

        var bytes = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4.Landscape());
                page.Margin(28);
                page.DefaultTextStyle(x => x.FontSize(9));

                page.Header().Column(col =>
                {
                    col.Item().Text("Pak Suzuki Motor Company — Distributor Incentive Report")
                        .Bold().FontSize(14).FontColor(Colors.Blue.Darken3);
                    col.Item().Text($"{evaluation.SchemeName}  ·  {evaluation.ProductGroupName}  ·  {periodLabel}")
                        .FontSize(10);
                    col.Item().PaddingTop(4).Text(
                            $"Distributor: {distributor.DistributorName} ({distributor.DistributorCode})" +
                            (string.IsNullOrWhiteSpace(distributor.RegionName) ? "" : $"  ·  Region: {distributor.RegionName}"))
                        .SemiBold();
                });

                page.Content().PaddingTop(12).Column(col =>
                {
                    col.Item().Text("Monthly purchase (liters) — current period").SemiBold();
                    col.Item().PaddingTop(4).Table(table =>
                    {
                        table.ColumnsDefinition(c =>
                        {
                            c.RelativeColumn(2);
                            c.RelativeColumn();
                        });
                        table.Header(h =>
                        {
                            h.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text("Month");
                            h.Cell().Background(Colors.Grey.Lighten3).Padding(4).AlignRight().Text("Liters");
                        });
                        foreach (var m in distributor.MonthlyCurrent)
                        {
                            var label = new DateTime(m.Year, m.Month, 1).ToString("MMM yyyy");
                            table.Cell().BorderBottom(0.5f).BorderColor(Colors.Grey.Lighten2).Padding(4).Text(label);
                            table.Cell().BorderBottom(0.5f).BorderColor(Colors.Grey.Lighten2).Padding(4)
                                .AlignRight().Text(m.Liters.ToString("N2"));
                        }
                        if (distributor.MonthlyCurrent.Count == 0)
                        {
                            table.Cell().ColumnSpan(2).Padding(4).Text("No purchases in period.").Italic();
                        }
                    });

                    col.Item().PaddingTop(14).Table(table =>
                    {
                        table.ColumnsDefinition(c =>
                        {
                            c.RelativeColumn();
                            c.RelativeColumn();
                            c.RelativeColumn();
                            c.RelativeColumn();
                        });

                        void Metric(string label, string value)
                        {
                            table.Cell().Padding(4).Column(c =>
                            {
                                c.Item().Text(label).FontSize(8).FontColor(Colors.Grey.Darken1);
                                c.Item().Text(value).SemiBold().FontSize(11);
                            });
                        }

                        Metric("Current period liters", distributor.CurrentLiters.ToString("N2"));
                        Metric("Avg / closed month",
                            distributor.AvgPerClosedMonth is decimal a
                                ? $"{a:N2} ({distributor.ClosedMonths} mo)"
                                : "N/A");
                        Metric("Qualifying incentive",
                            distributor.QualifyingIncentivePkr is decimal qi
                                ? qi.ToString("N2")
                                : distributor.PercentOfSalesIncentivePkr is decimal pi
                                    ? pi.ToString("N2")
                                    : "—");
                        Metric("Scheme type", evaluation.SchemeType);
                    });

                    if (evaluation.SchemeType == "Slab")
                    {
                        col.Item().PaddingTop(12).Text("Slabs (admin-configured)").SemiBold();
                        col.Item().PaddingTop(4).Table(table =>
                        {
                            table.ColumnsDefinition(c =>
                            {
                                c.RelativeColumn(1.2f);
                                c.RelativeColumn();
                                c.RelativeColumn();
                                c.RelativeColumn();
                                c.RelativeColumn();
                                c.RelativeColumn(1.2f);
                            });
                            table.Header(h =>
                            {
                                foreach (var t in new[]
                                         { "Target L", "Rate/L", "Fixed bonus", "Cartons", "Incentive PKR", "Qualifying" })
                                    h.Cell().Background(Colors.Grey.Lighten3).Padding(4).Text(t);
                            });
                            foreach (var s in distributor.Slabs)
                            {
                                var q = distributor.QualifyingSlabId == s.Id;
                                table.Cell().Padding(3).Text(s.TargetLiters.ToString("N2"));
                                table.Cell().Padding(3).Text(s.RatePerLiter.ToString("N4"));
                                table.Cell().Padding(3).Text(s.FixedBonusPkr.ToString("N2"));
                                table.Cell().Padding(3).Text(s.ComputedCartons?.ToString("N2") ?? "—");
                                table.Cell().Padding(3).Text(s.ComputedIncentivePkr.ToString("N2"));
                                table.Cell().Padding(3).Text(q ? "YES" : "").Bold();
                            }
                        });

                        col.Item().PaddingTop(8).Text(
                            distributor.QualifyingIncentivePkr is decimal pay
                                ? $"Qualifying incentive: Rs {pay:N2}"
                                : "No qualifying slab yet.")
                            .SemiBold().FontSize(11);
                    }
                    else if (evaluation.SchemeType == "PercentOfSales")
                    {
                        col.Item().PaddingTop(10).Text(
                            $"Percent-of-sales incentive: Rs {distributor.PercentOfSalesIncentivePkr ?? 0:N2}")
                            .SemiBold();
                    }
                    else
                    {
                        col.Item().PaddingTop(10).Text("Tracking-only scheme — no payout calculated.").Italic();
                    }

                    col.Item().PaddingTop(28).Row(row =>
                    {
                        void Sign(string title, string? name)
                        {
                            row.RelativeItem().Column(c =>
                            {
                                c.Item().Height(28).BorderBottom(0.5f).BorderColor(Colors.Grey.Medium);
                                c.Item().PaddingTop(4).Text(title).FontSize(8).FontColor(Colors.Grey.Darken1);
                                c.Item().Text(string.IsNullOrWhiteSpace(name) ? "________________" : name).FontSize(9);
                            });
                        }

                        Sign("Prepared by", signatories.PreparedBy);
                        row.ConstantItem(16);
                        Sign("Checked by", signatories.CheckedBy);
                        row.ConstantItem(16);
                        Sign("Approved by", signatories.ApprovedBy);
                    });
                });

                page.Footer().AlignRight().Text(t =>
                {
                    t.Span("Generated ").FontSize(8).FontColor(Colors.Grey.Darken1);
                    t.Span(evaluation.AsOfUtc.ToString("dd-MMM-yyyy HH:mm UTC")).FontSize(8);
                    t.Span("  ·  Page ").FontSize(8);
                    t.CurrentPageNumber().FontSize(8);
                });
            });
        }).GeneratePdf();

        return Task.FromResult(bytes);
    }
}
