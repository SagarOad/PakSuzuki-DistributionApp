import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ShoppingBasket, CheckCircle2, XCircle, AlertTriangle, Clock,
  Search, Eye, FileSpreadsheet, ChevronLeft, ChevronRight
} from 'lucide-react'
import { api } from '@/api/axiosClient'
import { CompactStatCard, CompactStatRow } from '@/components/ui/CompactStatCards'
import clsx from 'clsx'

interface OrderRow {
  id: string
  orderNumber: string
  source: string
  retailerName?: string
  distributorName: string
  status: string
  grandTotal: number
  createdAtUtc: string
}

interface OrderDetail {
  id: string
  orderNumber: string
  status: string
  items: {
    productName: string
    productSku: string
    requestedQuantity: number
    requestedUnit: string
  }[]
}

interface Paged<T> {
  items: T[]
  pageNumber: number
  totalPages: number
  totalCount: number
}

interface Dash {
  totalOrders: number
  ordersByStatus: { status: string; count: number }[]
}

type StatusTab = 'all' | 'process' | 'completed' | 'canceled' | 'threshold'

function countStatuses(rows: { status: string; count: number }[] | undefined, names: string[]) {
  if (!rows) return 0
  return rows.filter((r) => names.includes(r.status)).reduce((s, r) => s + r.count, 0)
}

const PROCESS = [
  'PendingDistributorApproval', 'PendingPakSuzukiApproval', 'SubmittedToSap',
  'ApprovedByDistributor', 'PartiallyApprovedByDistributor', 'ForwardedToPakSuzuki',
  'ApprovedByPakSuzuki', 'PartiallyDelivered'
]
const COMPLETED = ['Delivered', 'InvoiceConfirmed']
const CANCELED = ['Cancelled', 'RejectedByDistributor']

export default function OrdersPage() {
  const [period, setPeriod] = useState<'Month' | 'Week' | 'Year'>('Month')
  const [tab, setTab] = useState<StatusTab>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const dashQuery = useQuery({
    queryKey: ['dashboard-superadmin'],
    queryFn: async () => (await api.get<Dash>('/dashboards/superadmin')).data
  })

  const statusFilter = useMemo(() => {
    if (tab === 'process') return PROCESS[0]
    if (tab === 'completed') return COMPLETED[0]
    if (tab === 'canceled') return CANCELED[0]
    return undefined
  }, [tab])

  const ordersQuery = useQuery({
    queryKey: ['orders-page', page, statusFilter, search],
    queryFn: async () =>
      (await api.get<Paged<OrderRow>>('/orders', {
        params: {
          pageNumber: page,
          pageSize: 10,
          statusFilter: tab === 'all' || tab === 'threshold' || tab === 'process' ? undefined : statusFilter
        }
      })).data
  })

  const detailQuery = useQuery({
    queryKey: ['order-detail', selectedId],
    enabled: !!selectedId,
    queryFn: async () => (await api.get<OrderDetail>(`/orders/${selectedId}`)).data
  })

  const inProcess = countStatuses(dashQuery.data?.ordersByStatus, PROCESS)
  const completed = countStatuses(dashQuery.data?.ordersByStatus, COMPLETED)
  const canceled = countStatuses(dashQuery.data?.ordersByStatus, CANCELED)

  const filteredItems = useMemo(() => {
    let items = ordersQuery.data?.items ?? []
    if (tab === 'process') items = items.filter((o) => PROCESS.includes(o.status))
    if (tab === 'completed') items = items.filter((o) => COMPLETED.includes(o.status))
    if (tab === 'canceled') items = items.filter((o) => CANCELED.includes(o.status))
    if (tab === 'threshold') items = [] // ship-to-party threshold — wire when API ready
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(q) ||
          o.distributorName.toLowerCase().includes(q) ||
          (o.retailerName ?? '').toLowerCase().includes(q)
      )
    }
    return items
  }, [ordersQuery.data, tab, search])

  const chartPoints = useMemo(() => {
    if (period === 'Week') return [8, 14, 11, 18, 22, 16, 24]
    if (period === 'Year') return [20, 24, 22, 30, 28, 35, 32, 40, 38, 42, 45, 48]
    return [12, 18, 15, 28, 22, 32, 30, 38, 34, 40, 36, 42]
  }, [period])

  const total = dashQuery.data?.totalOrders ?? ordersQuery.data?.totalCount ?? '—'

  return (
    <div className="space-y-5">
      <CompactStatRow>
        <CompactStatCard tone="order-blue" icon={<ShoppingBasket size={20} />} value={total} label="Total Orders" onClick={() => setTab('all')} />
        <CompactStatCard tone="order-red" icon={<Clock size={20} />} value={inProcess} label="In Process" onClick={() => setTab('process')} />
        <CompactStatCard tone="order-green" icon={<CheckCircle2 size={20} />} value={completed} label="Completed" onClick={() => setTab('completed')} />
        <CompactStatCard tone="order-gray" icon={<XCircle size={20} />} value={canceled} label="Canceled" onClick={() => setTab('canceled')} />
        <CompactStatCard tone="order-orange" icon={<AlertTriangle size={20} />} value={0} label="Threshold Reached" onClick={() => setTab('threshold')} />
      </CompactStatRow>

      <div className="bg-white rounded-2xl border border-suzuki-line shadow-card p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-suzuki-navy">Orders Stats</h2>
          <div className="flex rounded-full bg-suzuki-mist p-0.5 text-xs font-semibold">
            {(['Month', 'Week', 'Year'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={clsx(
                  'px-3 py-1 rounded-full transition-colors',
                  period === p ? 'bg-suzuki-navy text-white' : 'text-suzuki-mute hover:text-suzuki-ink'
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <OrdersChart points={chartPoints} />
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['all', 'All'],
            ['process', 'In Process'],
            ['completed', 'Completed'],
            ['canceled', 'Canceled'],
            ['threshold', 'Threshold Reached']
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => { setTab(key); setPage(1) }}
            className={clsx(
              'rounded-xl px-4 py-2 text-sm font-bold transition-colors',
              tab === key ? 'bg-suzuki-red text-white shadow-card' : 'bg-white text-suzuki-ink border border-suzuki-line hover:bg-suzuki-mist'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-suzuki-line shadow-card overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
          <h3 className="font-bold text-suzuki-navy">Orders List</h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-suzuki-mist rounded-lg px-3 py-2 border border-suzuki-line">
              <Search size={14} className="text-suzuki-mute" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search"
                className="bg-transparent text-sm outline-none w-36"
              />
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-suzuki-blue/40 text-suzuki-blue px-3 py-2 text-xs font-semibold hover:bg-suzuki-ice"
            >
              <FileSpreadsheet size={14} /> Export Excel
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-suzuki-mist/80 text-left text-xs font-bold uppercase tracking-wide text-suzuki-mute">
                <th className="px-5 py-3">Order Date</th>
                <th className="px-4 py-3">Order Number</th>
                <th className="px-4 py-3">Retailer / Distributor</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Order Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {ordersQuery.isLoading && (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-suzuki-mute">Loading…</td></tr>
              )}
              {!ordersQuery.isLoading && filteredItems.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-suzuki-mute">
                    {tab === 'threshold' ? 'No threshold-reached orders yet.' : 'No orders found.'}
                  </td>
                </tr>
              )}
              {filteredItems.map((o) => (
                <tr key={o.id} className="border-t border-suzuki-line/80 hover:bg-suzuki-mist/40">
                  <td className="px-5 py-3.5 text-suzuki-mute">
                    {new Date(o.createdAtUtc).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3.5 font-mono text-xs font-semibold text-suzuki-ink">{o.orderNumber}</td>
                  <td className="px-4 py-3.5 text-suzuki-mute">
                    <div className="font-medium text-suzuki-ink">{o.retailerName ?? '—'}</div>
                    <div className="text-xs">{o.distributorName}</div>
                  </td>
                  <td className="px-4 py-3.5 text-suzuki-mute">{o.source}</td>
                  <td className="px-4 py-3.5 font-semibold text-suzuki-ink">
                    Rs {o.grandTotal.toLocaleString()}
                  </td>
                  <td className="px-4 py-3.5"><OrderStatusPill status={o.status} /></td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedId(o.id)}
                      className="p-1.5 rounded-lg text-suzuki-blue hover:bg-suzuki-ice"
                      title="View"
                    >
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-4 border-t border-suzuki-line flex flex-col sm:flex-row gap-3 items-center justify-between text-xs text-suzuki-mute">
          <span>
            Showing {filteredItems.length === 0 ? '00' : '01'} to{' '}
            {String(filteredItems.length).padStart(2, '0')} of {ordersQuery.data?.totalCount ?? 0} entries
          </span>
          <div className="flex items-center gap-1">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-2 py-1 rounded-lg border border-suzuki-line disabled:opacity-40">
              <ChevronLeft size={14} />
            </button>
            <button type="button" className="h-7 min-w-7 px-2 rounded-lg text-xs font-bold bg-suzuki-navy text-white">{page}</button>
            <button
              type="button"
              disabled={page >= (ordersQuery.data?.totalPages ?? 1)}
              onClick={() => setPage(page + 1)}
              className="px-2 py-1 rounded-lg border border-suzuki-line disabled:opacity-40"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {selectedId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setSelectedId(null)}>
          <div className="bg-white rounded-2xl shadow-card max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-suzuki-navy mb-4">Order Detail</h3>
            {detailQuery.isLoading && <p className="text-sm text-suzuki-mute">Loading…</p>}
            {detailQuery.data && (
              <div className="space-y-3 text-sm">
                <div><span className="text-suzuki-mute">Number:</span> <span className="font-semibold">{detailQuery.data.orderNumber}</span></div>
                <div><span className="text-suzuki-mute">Status:</span> <OrderStatusPill status={detailQuery.data.status} /></div>
                <div className="border-t border-suzuki-line pt-3">
                  <div className="font-semibold text-suzuki-navy mb-2">Products</div>
                  <ul className="space-y-1">
                    {detailQuery.data.items.map((i) => (
                      <li key={i.productSku} className="flex justify-between gap-2">
                        <span>{i.productName}</span>
                        <span className="text-suzuki-mute">{i.requestedQuantity} {i.requestedUnit}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <button type="button" onClick={() => setSelectedId(null)} className="mt-6 w-full rounded-xl bg-suzuki-navy text-white font-semibold py-2.5">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function OrderStatusPill({ status }: { status: string }) {
  let cls = 'bg-suzuki-mist text-suzuki-mute'
  let label = status
  if (COMPLETED.includes(status)) { cls = 'bg-emerald-100 text-suzuki-ok'; label = 'Completed' }
  else if (CANCELED.includes(status)) { cls = 'bg-slate-200 text-suzuki-mute'; label = 'Canceled' }
  else if (status === 'PendingDistributorApproval' || status === 'PendingPakSuzukiApproval') {
    cls = 'bg-amber-100 text-amber-800'; label = 'Pending'
  }
  else if (PROCESS.includes(status)) { cls = 'bg-rose-100 text-suzuki-red'; label = 'In Process' }

  return <span className={clsx('inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold', cls)}>{label}</span>
}

function OrdersChart({ points }: { points: number[] }) {
  const w = 720
  const h = 180
  const pad = 24
  const max = Math.max(...points, 1)
  const coords = points.map((v, i) => {
    const x = pad + (i * (w - pad * 2)) / Math.max(points.length - 1, 1)
    const y = h - pad - (v / max) * (h - pad * 1.6)
    return [x, y] as const
  })
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
  const area = `${line} L${coords[coords.length - 1][0]},${h - pad} L${coords[0][0]},${h - pad} Z`

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-44" role="img" aria-label="Orders stats chart">
      {[0.25, 0.5, 0.75, 1].map((t) => (
        <line
          key={t}
          x1={pad}
          x2={w - 8}
          y1={h - pad - t * (h - pad * 1.6)}
          y2={h - pad - t * (h - pad * 1.6)}
          stroke="#E2E8F0"
          strokeDasharray="4 4"
        />
      ))}
      <path d={area} fill="url(#ordersFill)" />
      <path d={line} fill="none" stroke="#005BAC" strokeWidth="2.5" strokeLinecap="round" />
      {coords.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill="#005BAC" />
      ))}
      <defs>
        <linearGradient id="ordersFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7EB6E8" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#7EB6E8" stopOpacity="0.02" />
        </linearGradient>
      </defs>
    </svg>
  )
}
