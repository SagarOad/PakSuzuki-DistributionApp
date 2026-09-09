using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.Application.Features.Dashboards.Queries;

public record OrderStatusCountDto(string Status, int Count);
public record DistributorPerformanceDto(Guid DistributorId, string Name, decimal TotalSales, int OrderCount);
public record RecentOrderDto(Guid Id, string OrderNumber, string Status, decimal GrandTotal, DateTime CreatedAtUtc);
public record TargetAchievementDto(
    Guid TargetId, decimal TargetAmount, decimal AchievedAmount, decimal AchievementPercent,
    DateTime PeriodStartUtc, DateTime PeriodEndUtc);
public record ActivePromotionDto(Guid Id, string Title, string Type, string ImageUrl, DateTime StartDateUtc, DateTime EndDateUtc);

// Orders that haven't reached a terminal state yet - used to surface "open orders"
// counts across all three dashboards without duplicating the status list everywhere.
internal static class OrderStatusHelper
{
    public static readonly OrderStatus[] TerminalStatuses =
    {
        OrderStatus.InvoiceConfirmed, OrderStatus.Cancelled, OrderStatus.RejectedByDistributor
    };

    /// <summary>Matches client COMPLETED_STATUSES on Orders pages.</summary>
    public static readonly OrderStatus[] CompletedStatuses =
    {
        OrderStatus.Delivered, OrderStatus.InvoiceConfirmed
    };

    /// <summary>Matches client CANCELED_STATUSES on Orders pages.</summary>
    public static readonly OrderStatus[] CancelledStatuses =
    {
        OrderStatus.Cancelled, OrderStatus.RejectedByDistributor
    };

    public static bool IsCompleted(OrderStatus status) => CompletedStatuses.Contains(status);
    public static bool IsCancelled(OrderStatus status) => CancelledStatuses.Contains(status);
    public static bool IsInProgress(OrderStatus status) =>
        !IsCompleted(status) && !IsCancelled(status);
}

// 3.9/3.10: platform-wide overview for SuperAdmin/Admin - order volume, sales,
// pending approval queues, and a distributor leaderboard.
public record SuperAdminDashboardDto(
    int TotalOrders, decimal TotalSales, int PendingDistributorApprovals, int PendingRetailerApprovals,
    int TotalDistributors, int TotalRetailers, int ActiveDistributors,
    List<OrderStatusCountDto> OrdersByStatus, List<DistributorPerformanceDto> TopDistributors);

public record GetSuperAdminDashboardQuery : IRequest<SuperAdminDashboardDto>;

public class GetSuperAdminDashboardQueryHandler : IRequestHandler<GetSuperAdminDashboardQuery, SuperAdminDashboardDto>
{
    private readonly IApplicationDbContext _context;
    public GetSuperAdminDashboardQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<SuperAdminDashboardDto> Handle(GetSuperAdminDashboardQuery request, CancellationToken ct)
    {
        var totalOrders = await _context.Orders.CountAsync(ct);
        var totalSales = await _context.Orders.SumAsync(o => (decimal?)o.GrandTotal, ct) ?? 0;

        var pendingDistributorApprovals = await _context.Distributors
            .CountAsync(d => d.ApprovalStatus == ApprovalStatus.PendingReview
                || d.ApprovalStatus == ApprovalStatus.SentBackForCorrection, ct);

        // Count the full SuperAdmin retailer approval pipeline (awaiting distributor or PSMCL).
        var pendingRetailerApprovals = await _context.Retailers
            .CountAsync(r =>
                r.DistributorApprovalStatus == ApprovalStatus.PendingReview
                || r.DistributorApprovalStatus == ApprovalStatus.SentBackForCorrection
                || (r.DistributorApprovalStatus == ApprovalStatus.Approved
                    && (r.SuperAdminApprovalStatus == ApprovalStatus.PendingReview
                        || r.SuperAdminApprovalStatus == ApprovalStatus.SentBackForCorrection)), ct);

        var ordersByStatus = await _context.Orders
            .GroupBy(o => o.Status)
            .Select(g => new OrderStatusCountDto(g.Key.ToString(), g.Count()))
            .ToListAsync(ct);

        // Group by Id only (EF cannot translate GroupBy on navigation props + Sum reliably).
        var topSales = await _context.Orders
            .GroupBy(o => o.DistributorId)
            .Select(g => new
            {
                DistributorId = g.Key,
                TotalSales = g.Sum(o => o.GrandTotal),
                OrderCount = g.Count()
            })
            .OrderByDescending(x => x.TotalSales)
            .Take(10)
            .ToListAsync(ct);

        var topIds = topSales.Select(x => x.DistributorId).ToList();
        var names = await _context.Distributors
            .Where(d => topIds.Contains(d.Id))
            .Select(d => new { d.Id, d.Name })
            .ToDictionaryAsync(d => d.Id, d => d.Name, ct);

        var topDistributors = topSales
            .Select(x => new DistributorPerformanceDto(
                x.DistributorId,
                names.GetValueOrDefault(x.DistributorId, "Unknown"),
                x.TotalSales,
                x.OrderCount))
            .ToList();

        var totalDistributors = await _context.Distributors
            .CountAsync(d => d.IsActive && d.ApprovalStatus == ApprovalStatus.Approved, ct);
        var activeDistributors = totalDistributors;
        var totalRetailers = await _context.Retailers
            .CountAsync(r => r.IsActive
                && r.DistributorApprovalStatus == ApprovalStatus.Approved
                && r.SuperAdminApprovalStatus == ApprovalStatus.Approved, ct);

        return new SuperAdminDashboardDto(
            totalOrders, totalSales, pendingDistributorApprovals, pendingRetailerApprovals,
            totalDistributors, totalRetailers, activeDistributors,
            ordersByStatus, topDistributors);
    }
}

// 3.9/3.10: a distributor's own performance view - their retailers' order activity,
// open-order backlog, and monthly target achievement (Targets table).
public record DistributorDashboardDto(
    int TotalRetailers, int TotalOrders, int OpenOrders, decimal TotalSales,
    int InProgressOrders, int CancelOrders, int CompleteOrders,
    List<TargetAchievementDto> Targets, List<RecentOrderDto> RecentOrders);

public record GetDistributorDashboardQuery(Guid DistributorId) : IRequest<DistributorDashboardDto>;

public class GetDistributorDashboardQueryHandler : IRequestHandler<GetDistributorDashboardQuery, DistributorDashboardDto>
{
    private readonly IApplicationDbContext _context;
    public GetDistributorDashboardQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<DistributorDashboardDto> Handle(GetDistributorDashboardQuery request, CancellationToken ct)
    {
        var ordersQuery = _context.Orders.Where(o => o.DistributorId == request.DistributorId);

        var totalRetailers = await _context.Retailers.CountAsync(r =>
            r.DistributorId == request.DistributorId
            && r.IsActive
            && r.DistributorApprovalStatus == ApprovalStatus.Approved
            && r.SuperAdminApprovalStatus == ApprovalStatus.Approved, ct);
        var totalOrders = await ordersQuery.CountAsync(ct);
        var openOrders = await ordersQuery.CountAsync(o => !OrderStatusHelper.TerminalStatuses.Contains(o.Status), ct);
        var inProgressOrders = await ordersQuery.CountAsync(o =>
            !OrderStatusHelper.CompletedStatuses.Contains(o.Status)
            && !OrderStatusHelper.CancelledStatuses.Contains(o.Status), ct);
        var cancelOrders = await ordersQuery.CountAsync(o => OrderStatusHelper.CancelledStatuses.Contains(o.Status), ct);
        var completeOrders = await ordersQuery.CountAsync(o => OrderStatusHelper.CompletedStatuses.Contains(o.Status), ct);
        var totalSales = await ordersQuery.SumAsync(o => (decimal?)o.GrandTotal, ct) ?? 0;

        var targets = await _context.Targets
            .Where(t => t.DistributorId == request.DistributorId)
            .OrderByDescending(t => t.PeriodStartUtc)
            .Select(t => new TargetAchievementDto(
                t.Id, t.TargetAmount, t.AchievedAmount, t.AchievementPercent, t.PeriodStartUtc, t.PeriodEndUtc))
            .ToListAsync(ct);

        var recentOrders = await ordersQuery
            .OrderByDescending(o => o.CreatedAtUtc)
            .Take(10)
            .Select(o => new RecentOrderDto(o.Id, o.OrderNumber, o.Status.ToString(), o.GrandTotal, o.CreatedAtUtc))
            .ToListAsync(ct);

        return new DistributorDashboardDto(
            totalRetailers, totalOrders, openOrders, totalSales,
            inProgressOrders, cancelOrders, completeOrders,
            targets, recentOrders);
    }
}

// 3.9/3.10 + 3.7.2: a retailer's own order history summary plus promotions/banners
// targeted at the Retailer role that are currently within their active date range.
public record RetailerDashboardDto(
    int TotalOrders, decimal TotalSpent, List<OrderStatusCountDto> StatusCounts,
    int InProgressOrders, int CancelOrders, int CompleteOrders,
    List<ActivePromotionDto> ActivePromotions, List<RecentOrderDto> RecentOrders);

public record GetRetailerDashboardQuery(Guid RetailerId) : IRequest<RetailerDashboardDto>;

public class GetRetailerDashboardQueryHandler : IRequestHandler<GetRetailerDashboardQuery, RetailerDashboardDto>
{
    private readonly IApplicationDbContext _context;
    private readonly IDateTimeService _dateTime;

    public GetRetailerDashboardQueryHandler(IApplicationDbContext context, IDateTimeService dateTime)
    {
        _context = context;
        _dateTime = dateTime;
    }

    public async Task<RetailerDashboardDto> Handle(GetRetailerDashboardQuery request, CancellationToken ct)
    {
        var ordersQuery = _context.Orders.Where(o => o.RetailerId == request.RetailerId);

        var totalOrders = await ordersQuery.CountAsync(ct);
        var totalSpent = await ordersQuery.SumAsync(o => (decimal?)o.GrandTotal, ct) ?? 0;
        var inProgressOrders = await ordersQuery.CountAsync(o =>
            !OrderStatusHelper.CompletedStatuses.Contains(o.Status)
            && !OrderStatusHelper.CancelledStatuses.Contains(o.Status), ct);
        var cancelOrders = await ordersQuery.CountAsync(o => OrderStatusHelper.CancelledStatuses.Contains(o.Status), ct);
        var completeOrders = await ordersQuery.CountAsync(o => OrderStatusHelper.CompletedStatuses.Contains(o.Status), ct);

        var statusCounts = await ordersQuery
            .GroupBy(o => o.Status)
            .Select(g => new OrderStatusCountDto(g.Key.ToString(), g.Count()))
            .ToListAsync(ct);

        var now = _dateTime.UtcNow;
        var activePromotions = await _context.Promotions
            .Where(p => p.IsActive && p.StartDateUtc <= now && p.EndDateUtc >= now && p.TargetRoles.Contains(Roles.Retailer))
            .OrderByDescending(p => p.StartDateUtc)
            .Select(p => new ActivePromotionDto(p.Id, p.Title, p.Type, p.ImageUrl, p.StartDateUtc, p.EndDateUtc))
            .ToListAsync(ct);

        var recentOrders = await ordersQuery
            .OrderByDescending(o => o.CreatedAtUtc)
            .Take(10)
            .Select(o => new RecentOrderDto(o.Id, o.OrderNumber, o.Status.ToString(), o.GrandTotal, o.CreatedAtUtc))
            .ToListAsync(ct);

        return new RetailerDashboardDto(
            totalOrders, totalSpent, statusCounts,
            inProgressOrders, cancelOrders, completeOrders,
            activePromotions, recentOrders);
    }
}

// 2.4: RegionalHead is a view-only role scoped to one or more regions (RegionalHeadAssignments).
// Shape mirrors the SuperAdmin dashboard but every metric is filtered down to the
// distributors that belong to the head's assigned regions.
public record RegionalHeadDashboardDto(
    List<string> RegionNames, int TotalOrders, decimal TotalSales,
    List<OrderStatusCountDto> OrdersByStatus, List<DistributorPerformanceDto> TopDistributors);

public record GetRegionalHeadDashboardQuery(Guid UserId) : IRequest<RegionalHeadDashboardDto>;

public class GetRegionalHeadDashboardQueryHandler : IRequestHandler<GetRegionalHeadDashboardQuery, RegionalHeadDashboardDto>
{
    private readonly IApplicationDbContext _context;
    public GetRegionalHeadDashboardQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<RegionalHeadDashboardDto> Handle(GetRegionalHeadDashboardQuery request, CancellationToken ct)
    {
        var regionIds = await _context.RegionalHeadAssignments
            .Where(a => a.ApplicationUserId == request.UserId)
            .Select(a => a.RegionId)
            .ToListAsync(ct);

        var regionNames = await _context.Regions
            .Where(r => regionIds.Contains(r.Id))
            .Select(r => r.Name)
            .ToListAsync(ct);

        var distributorIds = _context.Distributors
            .Where(d => regionIds.Contains(d.RegionId))
            .Select(d => d.Id);

        var ordersQuery = _context.Orders.Where(o => distributorIds.Contains(o.DistributorId));

        var totalOrders = await ordersQuery.CountAsync(ct);
        var totalSales = await ordersQuery.SumAsync(o => (decimal?)o.GrandTotal, ct) ?? 0;

        var ordersByStatus = await ordersQuery
            .GroupBy(o => o.Status)
            .Select(g => new OrderStatusCountDto(g.Key.ToString(), g.Count()))
            .ToListAsync(ct);

        var topSales = await ordersQuery
            .GroupBy(o => o.DistributorId)
            .Select(g => new
            {
                DistributorId = g.Key,
                TotalSales = g.Sum(o => o.GrandTotal),
                OrderCount = g.Count()
            })
            .OrderByDescending(x => x.TotalSales)
            .Take(10)
            .ToListAsync(ct);

        var topIds = topSales.Select(x => x.DistributorId).ToList();
        var names = await _context.Distributors
            .Where(d => topIds.Contains(d.Id))
            .Select(d => new { d.Id, d.Name })
            .ToDictionaryAsync(d => d.Id, d => d.Name, ct);

        var topDistributors = topSales
            .Select(x => new DistributorPerformanceDto(
                x.DistributorId,
                names.GetValueOrDefault(x.DistributorId, "Unknown"),
                x.TotalSales,
                x.OrderCount))
            .ToList();

        return new RegionalHeadDashboardDto(regionNames, totalOrders, totalSales, ordersByStatus, topDistributors);
    }
}

// Profile pages (SuperAdmin viewing a specific distributor/retailer, or the entity viewing itself).
public record SalesSeriesPointDto(string Label, decimal Amount, int OrderCount);

public record EntityProfileStatsDto(
    int TotalOrders, int InProcessOrders, int CompletedOrders, int CanceledOrders,
    int TotalRetailers, decimal TotalSales, List<OrderStatusCountDto> OrdersByStatus,
    List<SalesSeriesPointDto> SalesSeries);

public record GetDistributorProfileStatsQuery(Guid DistributorId, string Period = "Month")
    : IRequest<EntityProfileStatsDto>;

public class GetDistributorProfileStatsQueryHandler : IRequestHandler<GetDistributorProfileStatsQuery, EntityProfileStatsDto>
{
    private readonly IApplicationDbContext _context;
    private readonly IDateTimeService _dateTime;
    public GetDistributorProfileStatsQueryHandler(IApplicationDbContext context, IDateTimeService dateTime)
    {
        _context = context;
        _dateTime = dateTime;
    }

    public async Task<EntityProfileStatsDto> Handle(GetDistributorProfileStatsQuery request, CancellationToken ct)
    {
        var exists = await _context.Distributors.AnyAsync(d => d.Id == request.DistributorId, ct);
        if (!exists) throw new Common.Exceptions.NotFoundException(nameof(Domain.Entities.Distributor), request.DistributorId);

        var orders = _context.Orders.Where(o => o.DistributorId == request.DistributorId);
        return await ProfileStatsHelper.BuildAsync(_context, orders, request.DistributorId, request.Period, _dateTime.UtcNow, ct);
    }
}

public record GetRetailerProfileStatsQuery(Guid RetailerId, string Period = "Month")
    : IRequest<EntityProfileStatsDto>;

public class GetRetailerProfileStatsQueryHandler : IRequestHandler<GetRetailerProfileStatsQuery, EntityProfileStatsDto>
{
    private readonly IApplicationDbContext _context;
    private readonly IDateTimeService _dateTime;
    public GetRetailerProfileStatsQueryHandler(IApplicationDbContext context, IDateTimeService dateTime)
    {
        _context = context;
        _dateTime = dateTime;
    }

    public async Task<EntityProfileStatsDto> Handle(GetRetailerProfileStatsQuery request, CancellationToken ct)
    {
        var retailer = await _context.Retailers.FirstOrDefaultAsync(r => r.Id == request.RetailerId, ct)
            ?? throw new Common.Exceptions.NotFoundException(nameof(Domain.Entities.Retailer), request.RetailerId);

        var orders = _context.Orders.Where(o => o.RetailerId == request.RetailerId);
        return await ProfileStatsHelper.BuildAsync(_context, orders, null, request.Period, _dateTime.UtcNow, ct, retailerCount: 0);
    }
}

internal static class ProfileStatsHelper
{
    private static readonly OrderStatus[] InProcess =
    {
        OrderStatus.PendingDistributorApproval, OrderStatus.SentBackForModification,
        OrderStatus.ApprovedByDistributor, OrderStatus.PartiallyApprovedByDistributor,
        OrderStatus.ForwardedToPakSuzuki, OrderStatus.PendingPakSuzukiApproval,
        OrderStatus.ApprovedByPakSuzuki, OrderStatus.SubmittedToSap, OrderStatus.PartiallyDelivered
    };
    private static readonly OrderStatus[] Completed = { OrderStatus.Delivered, OrderStatus.InvoiceConfirmed };
    private static readonly OrderStatus[] Canceled = { OrderStatus.Cancelled, OrderStatus.RejectedByDistributor };

    public static async Task<EntityProfileStatsDto> BuildAsync(
        IApplicationDbContext context,
        IQueryable<Domain.Entities.Order> ordersQuery,
        Guid? distributorIdForRetailerCount,
        string period,
        DateTime utcNow,
        CancellationToken ct,
        int? retailerCount = null)
    {
        var totalOrders = await ordersQuery.CountAsync(ct);
        var inProcess = await ordersQuery.CountAsync(o => InProcess.Contains(o.Status), ct);
        var completed = await ordersQuery.CountAsync(o => Completed.Contains(o.Status), ct);
        var canceled = await ordersQuery.CountAsync(o => Canceled.Contains(o.Status), ct);
        var totalSales = await ordersQuery.SumAsync(o => (decimal?)o.GrandTotal, ct) ?? 0;

        var totalRetailers = retailerCount
            ?? (distributorIdForRetailerCount is Guid did
                ? await context.Retailers.CountAsync(r =>
                    r.DistributorId == did
                    && r.IsActive
                    && r.DistributorApprovalStatus == ApprovalStatus.Approved
                    && r.SuperAdminApprovalStatus == ApprovalStatus.Approved, ct)
                : 0);

        var ordersByStatus = await ordersQuery
            .GroupBy(o => o.Status)
            .Select(g => new OrderStatusCountDto(g.Key.ToString(), g.Count()))
            .ToListAsync(ct);

        var series = await BuildSeriesAsync(ordersQuery, period, utcNow, ct);

        return new EntityProfileStatsDto(
            totalOrders, inProcess, completed, canceled, totalRetailers, totalSales, ordersByStatus, series);
    }

    private static async Task<List<SalesSeriesPointDto>> BuildSeriesAsync(
        IQueryable<Domain.Entities.Order> ordersQuery, string period, DateTime utcNow, CancellationToken ct)
    {
        period = (period ?? "Month").Trim();
        if (period.Equals("Week", StringComparison.OrdinalIgnoreCase))
        {
            var start = utcNow.Date.AddDays(-6);
            var rows = await ordersQuery
                .Where(o => o.CreatedAtUtc >= start)
                .GroupBy(o => o.CreatedAtUtc.Date)
                .Select(g => new { Day = g.Key, Amount = g.Sum(x => x.GrandTotal), Count = g.Count() })
                .ToListAsync(ct);

            var labels = new[] { "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun" };
            return Enumerable.Range(0, 7).Select(i =>
            {
                var day = start.AddDays(i);
                var hit = rows.FirstOrDefault(r => r.Day == day);
                return new SalesSeriesPointDto(labels[(int)day.DayOfWeek == 0 ? 6 : (int)day.DayOfWeek - 1],
                    hit?.Amount ?? 0, hit?.Count ?? 0);
            }).ToList();
        }

        if (period.Equals("Year", StringComparison.OrdinalIgnoreCase))
        {
            var start = new DateTime(utcNow.Year - 4, 1, 1, 0, 0, 0, DateTimeKind.Utc);
            var rows = await ordersQuery
                .Where(o => o.CreatedAtUtc >= start)
                .GroupBy(o => o.CreatedAtUtc.Year)
                .Select(g => new { Year = g.Key, Amount = g.Sum(x => x.GrandTotal), Count = g.Count() })
                .ToListAsync(ct);

            return Enumerable.Range(utcNow.Year - 4, 5).Select(y =>
            {
                var hit = rows.FirstOrDefault(r => r.Year == y);
                return new SalesSeriesPointDto(y.ToString(), hit?.Amount ?? 0, hit?.Count ?? 0);
            }).ToList();
        }

        // Default Month: last 12 calendar months
        var monthStart = new DateTime(utcNow.Year, utcNow.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(-11);
        var monthRows = await ordersQuery
            .Where(o => o.CreatedAtUtc >= monthStart)
            .GroupBy(o => new { o.CreatedAtUtc.Year, o.CreatedAtUtc.Month })
            .Select(g => new { g.Key.Year, g.Key.Month, Amount = g.Sum(x => x.GrandTotal), Count = g.Count() })
            .ToListAsync(ct);

        var monthNames = new[] { "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" };
        return Enumerable.Range(0, 12).Select(i =>
        {
            var m = monthStart.AddMonths(i);
            var hit = monthRows.FirstOrDefault(r => r.Year == m.Year && r.Month == m.Month);
            return new SalesSeriesPointDto(monthNames[m.Month - 1], hit?.Amount ?? 0, hit?.Count ?? 0);
        }).ToList();
    }
}
