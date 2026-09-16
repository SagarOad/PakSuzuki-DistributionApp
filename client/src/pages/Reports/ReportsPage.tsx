import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Download, ShoppingBasket, Truck, Package, CheckCircle2, Clock, XCircle, Droplets
} from 'lucide-react'
import { api } from '@/api/axiosClient'
import { useAuth } from '@/context/AuthContext'
import { StatCard, StatCardRow } from '@/components/ui/StatCard'
import { StatsGraph, type ChartPeriod } from '@/components/ui/StatsGraph'
import { OrderTable, DateFilterField } from '@/components/ui/DataTable'
import { downloadExcel, fetchAllFromApi, inDateRange, exportFailed } from '@/utils/excelExport'
import clsx from 'clsx'

interface Dash {
  totalOrders: number
  totalSales: number
  totalDistributors: number
  totalRetailers: number
  pendingDistributorApprovals: number
  pendingRetailerApprovals: number
  ordersByStatus: { status: string; count: number }[]
  topDistributors: { distributorId: string; name: string; totalSales: number; orderCount: number }[]
}

interface OrderRow {
  id: string
  orderNumber: string
  source: string
  retailerName?: string | null
  distributorName: string
  status: string
  statusLabel?: string | null
  grandTotal: number
  createdAtUtc: string
  thresholdReached?: boolean
  shippedBy?: string
  totalLiters?: number
}

interface DistributorRow {
  id: string
  distributorCode: string
  name: string
  businessName: string
  regionName: string
  email: string
  mobileNumber: string
  approvalStatus: string
  isActive: boolean
  createdAtUtc: string
}

interface RetailerRow {
  id: string
  retailerCode: string
  name: string
  businessName: string
  distributorName: string
  regionName: string
  email: string
  mobileNumber: string
  distributorApprovalStatus: string
  superAdminApprovalStatus: string
  isActive: boolean
  createdAtUtc: string
}

interface ProductRow {
  id: string
  partItemNo: string
  description: string
  categoryName?: string | null
  packLabel?: string | null
  discontinued?: boolean
  salePrice?: number
  purchasePrice?: number
}

type ReportKind =
  | 'orders-all'
  | 'orders-retailer'
  | 'orders-manufacture'
  | 'orders-threshold'
  | 'distributors'
  | 'retailers'
  | 'products'

interface ReportDef {
  id: ReportKind
  title: string
  note: string
}

const REPORTS: ReportDef[] = [
  { id: 'orders-all', title: 'All Orders', note: 'Every order in the selected date range.' },
  { id: 'orders-retailer', title: 'Retailer Orders', note: 'Retailer → distributor orders only.' },
  { id: 'orders-manufacture', title: 'Manufacturer Orders', note: 'Distributor → Pak Suzuki direct orders.' },
  { id: 'orders-threshold', title: 'Threshold Reached Orders', note: 'Orders that met pack threshold (Ship-to-Party eligible).' },
  { id: 'distributors', title: 'Distributors List', note: 'Approved / listed distributors (excludes pending requests).' },
  { id: 'retailers', title: 'Retailers List', note: 'Approved / listed retailers (excludes pending requests).' },
  { id: 'products', title: 'Products Catalog', note: 'Master catalog products currently in the system.' }
]

function money(n: number) {
  return `Rs ${n.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`
}

function formatDate(iso: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return d.toLocaleDateString('en-GB')
}

export default function ReportsPage() {
  const { role } = useAuth()
  const isStaff = role === 'SuperAdmin' || role === 'Admin' || role === 'RegionalHead'
  const [period, setPeriod] = useState<ChartPeriod>('Month')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [search, setSearch] = useState('')
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const dashQuery = useQuery({
    queryKey: ['reports-dashboard', role],
    enabled: isStaff,
    queryFn: async () => (await api.get<Dash>('/dashboards/superadmin')).data
  })

  const distDashQuery = useQuery({
    queryKey: ['reports-dashboard-distributor'],
    enabled: role === 'Distributor',
    queryFn: async () =>
      (await api.get<{
        totalOrders: number
        totalSales: number
        totalRetailers: number
        inProgressOrders: number
        cancelOrders: number
        completeOrders: number
      }>('/dashboards/distributor')).data
  })

  const statsQuery = useQuery({
    queryKey: ['reports-orders-stats', period],
    queryFn: async () =>
      (await api.get<{ series: { label: string; amount: number; orderCount: number }[] }>(
        '/dashboards/orders-stats',
        { params: { period } }
      )).data
  })

  const chartPoints = useMemo(
    () => (statsQuery.data?.series ?? []).map((p) => p.orderCount),
    [statsQuery.data]
  )
  const chartLabels = useMemo(
    () => (statsQuery.data?.series ?? []).map((p) => p.label),
    [statsQuery.data]
  )
  const chartSales = useMemo(
    () => (statsQuery.data?.series ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0),
    [statsQuery.data]
  )
  const chartOrders = useMemo(
    () => (statsQuery.data?.series ?? []).reduce((s, p) => s + (p.orderCount ?? 0), 0),
    [statsQuery.data]
  )

  const dash = dashQuery.data
  const distDash = distDashQuery.data
  const totalOrders = dash?.totalOrders ?? distDash?.totalOrders ?? '—'
  const totalSales = dash?.totalSales ?? distDash?.totalSales
  const statusRows = (dash?.ordersByStatus ?? [])
    .slice()
    .sort((a, b) => b.count - a.count)

  const completed = isStaff
    ? statusRows
        .filter((s) => s.status === 'Delivered' || s.status === 'InvoiceConfirmed')
        .reduce((n, s) => n + s.count, 0)
    : (distDash?.completeOrders ?? 0)
  const canceled = isStaff
    ? statusRows
        .filter((s) => s.status === 'Cancelled' || s.status === 'RejectedByDistributor')
        .reduce((n, s) => n + s.count, 0)
    : (distDash?.cancelOrders ?? 0)
  const pending = isStaff
    ? statusRows
        .filter((s) =>
          s.status === 'PendingDistributorApproval'
          || s.status === 'PendingPakSuzukiApproval'
          || s.status === 'SentBackForModification'
        )
        .reduce((n, s) => n + s.count, 0)
    : (distDash?.inProgressOrders ?? 0)

  const availableReports = useMemo(() => {
    if (isStaff) return REPORTS
    // Distributors: own order lanes + their retailers (no full master lists).
    return REPORTS.filter((r) =>
      r.id === 'orders-all'
      || r.id === 'orders-retailer'
      || r.id === 'orders-manufacture'
      || r.id === 'orders-threshold'
      || r.id === 'retailers'
    )
  }, [isStaff])

  const filteredReports = useMemo(() => {
    if (!search.trim()) return availableReports
    const q = search.toLowerCase()
    return availableReports.filter((r) => r.title.toLowerCase().includes(q) || r.note.toLowerCase().includes(q))
  }, [search, availableReports])

  const pageSize = 10
  const totalPages = Math.max(1, Math.ceil(filteredReports.length / pageSize))
  const pageItems = filteredReports.slice((page - 1) * pageSize, page * pageSize)
  const showingStart = filteredReports.length === 0 ? 0 : (page - 1) * pageSize + 1
  const showingEnd = Math.min(page * pageSize, filteredReports.length)

  const downloadReport = async (report: ReportDef) => {
    setExportingId(report.id)
    try {
      if (report.id.startsWith('orders-')) {
        const source =
          report.id === 'orders-retailer'
            ? 'RetailerOrder'
            : report.id === 'orders-manufacture'
              ? 'DistributorDirectOrder'
              : undefined
        const items = await fetchAllFromApi<OrderRow>('/orders', {
          source
        })
        let rows = items.filter((o) => inDateRange(o.createdAtUtc, fromDate, toDate))
        if (report.id === 'orders-threshold') {
          rows = rows.filter((o) => !!o.thresholdReached)
        }
        downloadExcel(
          report.id,
          [
            { header: 'Order Date', value: (o) => formatDate(o.createdAtUtc) },
            { header: 'Order Number', value: (o) => o.orderNumber },
            { header: 'Source', value: (o) => o.source },
            { header: 'Retailer', value: (o) => o.retailerName ?? '' },
            { header: 'Distributor', value: (o) => o.distributorName },
            { header: 'Status', value: (o) => o.statusLabel || o.status },
            { header: 'Shipped By', value: (o) => o.shippedBy ?? '' },
            { header: 'Threshold', value: (o) => (o.thresholdReached ? 'Yes' : 'No') },
            { header: 'Total Liters', value: (o) => o.totalLiters ?? 0 },
            { header: 'Total (PKR)', value: (o) => o.grandTotal }
          ],
          rows
        )
        return
      }

      if (report.id === 'distributors') {
        const items = await fetchAllFromApi<DistributorRow>('/distributors', {})
        const rows = items.filter((d) => inDateRange(d.createdAtUtc, fromDate, toDate))
        downloadExcel(
          report.id,
          [
            { header: 'Code', value: (d) => d.distributorCode },
            { header: 'Name', value: (d) => d.name },
            { header: 'Business', value: (d) => d.businessName },
            { header: 'Region', value: (d) => d.regionName },
            { header: 'Email', value: (d) => d.email },
            { header: 'Mobile', value: (d) => d.mobileNumber },
            { header: 'Status', value: (d) => d.approvalStatus },
            { header: 'Active', value: (d) => (d.isActive ? 'Yes' : 'No') },
            { header: 'Created', value: (d) => formatDate(d.createdAtUtc) }
          ],
          rows
        )
        return
      }

      if (report.id === 'retailers') {
        const items = await fetchAllFromApi<RetailerRow>('/retailers', {})
        const rows = items.filter((r) => inDateRange(r.createdAtUtc, fromDate, toDate))
        downloadExcel(
          report.id,
          [
            { header: 'Code', value: (r) => r.retailerCode },
            { header: 'Name', value: (r) => r.name },
            { header: 'Business', value: (r) => r.businessName },
            { header: 'Distributor', value: (r) => r.distributorName },
            { header: 'Region', value: (r) => r.regionName },
            { header: 'Email', value: (r) => r.email },
            { header: 'Mobile', value: (r) => r.mobileNumber },
            { header: 'Dist Approval', value: (r) => r.distributorApprovalStatus },
            { header: 'SA Approval', value: (r) => r.superAdminApprovalStatus },
            { header: 'Active', value: (r) => (r.isActive ? 'Yes' : 'No') },
            { header: 'Created', value: (r) => formatDate(r.createdAtUtc) }
          ],
          rows
        )
        return
      }

      if (report.id === 'products') {
        const items = await fetchAllFromApi<ProductRow>('/master-catalog/products', {})
        downloadExcel(
          report.id,
          [
            { header: 'Part Item No', value: (p) => p.partItemNo },
            { header: 'Description', value: (p) => p.description },
            { header: 'Category', value: (p) => p.categoryName ?? '' },
            { header: 'Pack', value: (p) => p.packLabel ?? '' },
            { header: 'Sale Price', value: (p) => p.salePrice ?? 0 },
            { header: 'Purchase Price', value: (p) => p.purchasePrice ?? 0 },
            { header: 'Discontinued', value: (p) => (p.discontinued ? 'Y' : 'N') }
          ],
          items
        )
      }
    } catch (err) {
      exportFailed(err)
    } finally {
      setExportingId(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-suzuki-navy">Reports</h1>
          <p className="text-sm text-suzuki-mute mt-1">
            Live platform stats and Excel downloads. Use the date range for order / party exports.
          </p>
        </div>
      </div>

      <StatCardRow>
        <StatCard tone="order-blue" icon={<ShoppingBasket size={20} />} value={totalOrders} label="Total Orders" />
        <StatCard
          tone="order-green"
          icon={<CheckCircle2 size={20} />}
          value={totalSales != null ? money(Number(totalSales)) : '—'}
          label="Total Sales"
        />
        {isStaff && (
          <>
            <StatCard tone="order-blue" icon={<Truck size={20} />} value={dash?.totalDistributors ?? '—'} label="Distributors" />
            <StatCard tone="order-blue" icon={<Package size={20} />} value={dash?.totalRetailers ?? '—'} label="Retailers" />
          </>
        )}
        {!isStaff && (
          <StatCard
            tone="order-blue"
            icon={<Package size={20} />}
            value={distDash?.totalRetailers ?? '—'}
            label="My Retailers"
          />
        )}
        <StatCard tone="order-red" icon={<Clock size={20} />} value={pending} label="Pending Orders" />
        <StatCard tone="order-green" icon={<CheckCircle2 size={20} />} value={completed} label="Completed" />
        <StatCard tone="order-gray" icon={<XCircle size={20} />} value={canceled} label="Canceled" />
      </StatCardRow>

      {isStaff && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-suzuki-line bg-white shadow-card p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-suzuki-mute">Pending distributor requests</div>
            <div className="mt-1 text-2xl font-extrabold text-suzuki-navy">{dash?.pendingDistributorApprovals ?? '—'}</div>
          </div>
          <div className="rounded-2xl border border-suzuki-line bg-white shadow-card p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-suzuki-mute">Pending retailer requests</div>
            <div className="mt-1 text-2xl font-extrabold text-suzuki-navy">{dash?.pendingRetailerApprovals ?? '—'}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-4">
        <StatsGraph
          title="Orders over time"
          points={chartPoints}
          labels={chartLabels}
          period={period}
          onPeriodChange={setPeriod}
          ariaLabel="Orders stats chart"
          size="large"
        />

        <div className="bg-white rounded-2xl border border-suzuki-line shadow-card p-4 space-y-4">
          <div>
            <h2 className="text-lg font-extrabold text-suzuki-navy">Period snapshot</h2>
            <p className="text-xs text-suzuki-mute mt-0.5">Based on the chart period above ({period}).</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-suzuki-mist/60 p-3">
              <div className="text-xs font-bold text-suzuki-mute">Orders</div>
              <div className="text-xl font-extrabold text-suzuki-navy">{chartOrders}</div>
            </div>
            <div className="rounded-xl bg-suzuki-mist/60 p-3">
              <div className="text-xs font-bold text-suzuki-mute">Sales</div>
              <div className="text-xl font-extrabold text-suzuki-navy">{money(chartSales)}</div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-extrabold text-suzuki-navy mb-2">Orders by status</h3>
            {statusRows.length > 0 ? (
              <ul className="space-y-1.5 max-h-56 overflow-auto pr-1">
                {statusRows.map((s) => (
                  <li key={s.status} className="flex items-center justify-between text-sm gap-2">
                    <span className="text-suzuki-ink truncate">{s.status}</span>
                    <span className="font-bold text-suzuki-navy tabular-nums">{s.count}</span>
                  </li>
                ))}
              </ul>
            ) : !isStaff ? (
              <ul className="space-y-1.5">
                <li className="flex justify-between text-sm"><span>In progress</span><span className="font-bold tabular-nums">{pending}</span></li>
                <li className="flex justify-between text-sm"><span>Completed</span><span className="font-bold tabular-nums">{completed}</span></li>
                <li className="flex justify-between text-sm"><span>Canceled</span><span className="font-bold tabular-nums">{canceled}</span></li>
              </ul>
            ) : (
              <p className="text-sm text-suzuki-mute">No order status data yet.</p>
            )}
          </div>
        </div>
      </div>

      {isStaff && (dash?.topDistributors?.length ?? 0) > 0 && (
        <div className="bg-white rounded-2xl border border-suzuki-line shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-suzuki-line">
            <h2 className="text-lg font-extrabold text-suzuki-navy">Top distributors by sales</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-suzuki-mist/50 text-suzuki-navy">
                <tr>
                  <th className="px-4 py-2.5 font-extrabold">#</th>
                  <th className="px-4 py-2.5 font-extrabold">Distributor</th>
                  <th className="px-4 py-2.5 font-extrabold">Orders</th>
                  <th className="px-4 py-2.5 font-extrabold">Sales</th>
                </tr>
              </thead>
              <tbody>
                {dash!.topDistributors.map((d, i) => (
                  <tr key={d.distributorId} className="border-t border-suzuki-line">
                    <td className="px-4 py-2.5 text-suzuki-mute">{i + 1}</td>
                    <td className="px-4 py-2.5 font-semibold text-suzuki-navy">{d.name}</td>
                    <td className="px-4 py-2.5">{d.orderCount}</td>
                    <td className="px-4 py-2.5 font-bold">{money(d.totalSales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <OrderTable
        title="Download reports"
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        filterBar={
          <>
            <span className="text-sm font-semibold text-[#0B2E59]">From</span>
            <DateFilterField value={fromDate} onChange={(v) => { setFromDate(v); setPage(1) }} />
            <span className="text-sm font-semibold text-[#0B2E59]">To</span>
            <DateFilterField value={toDate} onChange={(v) => { setToDate(v); setPage(1) }} />
          </>
        }
        columns={[
          { key: 'title', header: 'Report', wide: true },
          { key: 'note', header: 'Description', wide: true },
          { key: 'action', header: 'Download', align: 'right' }
        ]}
        empty="No reports match your search."
        pagination={{
          page,
          totalPages,
          onChange: setPage,
          showingText: `Showing ${String(showingStart).padStart(2, '0')} to ${String(showingEnd).padStart(2, '0')} of ${filteredReports.length} entries`
        }}
      >
        {pageItems.map((r) => (
          <tr key={r.id} className="border-b border-[#E2E4EA]/80 hover:bg-[#F5F7FB]/60">
            <td className="pl-4 pr-3 py-3.5 font-semibold text-[#0B2E59]">{r.title}</td>
            <td className="px-3 py-3.5 text-[#64748B]">{r.note}</td>
            <td className="pl-3 pr-4 py-3.5 text-right">
              <button
                type="button"
                disabled={exportingId === r.id}
                onClick={() => void downloadReport(r)}
                className={clsx(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold',
                  'text-suzuki-blue hover:bg-suzuki-ice disabled:opacity-50'
                )}
                title="Download Excel"
              >
                <Download size={16} />
                {exportingId === r.id ? 'Exporting…' : 'Excel'}
              </button>
            </td>
          </tr>
        ))}
      </OrderTable>

      {isStaff && (
        <p className="text-xs text-suzuki-mute flex items-center gap-1.5">
          <Droplets size={12} /> Product export uses the master catalog. Date range applies to orders and party lists.
        </p>
      )}
    </div>
  )
}
