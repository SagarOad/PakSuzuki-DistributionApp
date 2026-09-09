import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarDays, FileSpreadsheet, Package, Search, ShoppingBasket, Target, Truck, Eye, BarChart3
} from 'lucide-react'
import clsx from 'clsx'
import { api } from '@/api/axiosClient'
import { useAuth } from '@/context/AuthContext'
import { useAuthStore } from '@/context/authStore'
import { downloadExcel } from '@/utils/excelExport'
import { formatDate, formatPkr, type IncentiveDetail } from './incentiveTypes'

interface OrderRow {
  id: string
  orderNumber: string
  source: string
  retailerName?: string | null
  retailerLocation?: string | null
  distributorName: string
  status: string
  grandTotal: number
  createdAtUtc: string
  shippedBy: string
}

interface PagedOrders {
  items: OrderRow[]
  pageNumber: number
  totalPages: number
  totalCount: number
}

type Tab = 'all' | 'distributors' | 'retailers'

export default function IncentiveDetailPage() {
  const { role } = useAuth()
  if (role === 'Distributor') return <DistributorIncentiveDetail />
  return <StaffIncentiveDetail />
}

function DistributorIncentiveDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const profileId = useAuthStore((s) => s.profileId)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const detailQuery = useQuery({
    queryKey: ['incentive', id],
    enabled: !!id,
    queryFn: async () => (await api.get<IncentiveDetail>(`/incentives/${id}`)).data
  })

  const d = detailQuery.data
  const mine = d?.participants.find(
    (p) => p.kind === 'Distributor' && p.distributorId === profileId
  )

  const ordersQuery = useQuery({
    queryKey: ['incentive-orders', id, d?.startDateUtc, d?.endDateUtc],
    enabled: !!d,
    queryFn: async () =>
      (await api.get<PagedOrders>('/orders', {
        params: { pageNumber: 1, pageSize: 50, source: 'RetailerOrder' }
      })).data
  })

  const orders = useMemo(() => {
    let items = ordersQuery.data?.items ?? []
    if (d) {
      const start = new Date(d.startDateUtc).getTime()
      const end = new Date(d.endDateUtc).getTime()
      items = items.filter((o) => {
        const t = new Date(o.createdAtUtc).getTime()
        return t >= start && t <= end
      })
    }
    if (statusFilter !== 'all') {
      items = items.filter((o) => statusBucket(o.status) === statusFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(q) ||
          (o.retailerName ?? '').toLowerCase().includes(q) ||
          (o.retailerLocation ?? '').toLowerCase().includes(q)
      )
    }
    return items
  }, [ordersQuery.data, d, search, statusFilter])

  if (detailQuery.isLoading) {
    return <p className="text-sm text-suzuki-mute py-16 text-center">Loading…</p>
  }

  if (!d) {
    return (
      <div className="py-16 text-center space-y-3">
        <p className="text-sm text-suzuki-mute">Incentive not found.</p>
        <button type="button" onClick={() => navigate('/incentives')} className="text-suzuki-blue font-semibold text-sm">
          Back
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-8">
      <h1 className="text-2xl font-extrabold text-suzuki-navy">{d.name}</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          tone="ice"
          icon={<BarChart3 size={18} />}
          value={String(ordersQuery.data?.totalCount ?? orders.length).padStart(2, '0')}
          label="Total Orders"
        />
        <Kpi
          icon={<CalendarDays size={18} />}
          value={formatDate(d.endDateUtc)}
          label="End Date"
          valueClass="text-suzuki-red"
        />
        <Kpi
          icon={<Target size={18} />}
          value={formatPkr(mine?.targetValue ?? d.totalTarget)}
          label="Total Incentive Target To Achieve"
        />
        <Kpi
          icon={<ShoppingBasket size={18} />}
          value={`${(mine?.achievementPercent ?? d.achievementRate).toFixed(0)}%`}
          label="Achievement Rate"
          valueClass={(mine?.achievementPercent ?? d.achievementRate) >= 100 ? 'text-emerald-600' : 'text-suzuki-navy'}
        />
      </div>

      <section className="bg-white rounded-2xl border border-suzuki-line shadow-card overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
          <h2 className="font-bold text-suzuki-navy">Orders List</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-suzuki-line bg-white px-3 py-2 text-xs font-semibold text-suzuki-ink"
            >
              <option value="all">All Orders</option>
              <option value="pending">Pending</option>
              <option value="process">In Process</option>
              <option value="completed">Completed</option>
            </select>
            <button
              type="button"
              onClick={() =>
                downloadExcel(
                  `incentive-${d.name}-orders`,
                  [
                    { header: 'Order Date', value: (o) => formatDate(o.createdAtUtc) },
                    { header: 'Order Number', value: (o) => o.orderNumber },
                    { header: 'Retailer Name', value: (o) => o.retailerName ?? '' },
                    { header: 'Retailer Location', value: (o) => o.retailerLocation ?? '' },
                    { header: 'Shipped By', value: (o) => o.shippedBy },
                    { header: 'Status', value: (o) => o.status },
                    { header: 'Total (PKR)', value: (o) => o.grandTotal }
                  ],
                  orders
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-suzuki-blue/40 text-suzuki-blue px-3 py-2 text-xs font-semibold hover:bg-suzuki-ice"
            >
              <FileSpreadsheet size={14} /> Export Excel
            </button>
            <div className="flex items-center gap-2 bg-suzuki-mist rounded-lg px-3 py-2 border border-suzuki-line">
              <Search size={14} className="text-suzuki-mute" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search"
                className="bg-transparent text-sm outline-none w-32"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-suzuki-mist/80 text-left text-xs font-bold uppercase tracking-wide text-suzuki-mute">
                <th className="px-5 py-3">Order Date</th>
                <th className="px-4 py-3">Order Number</th>
                <th className="px-4 py-3">Retailor Name</th>
                <th className="px-4 py-3">Retailor Location</th>
                <th className="px-4 py-3">Shipped By</th>
                <th className="px-4 py-3">Order Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {ordersQuery.isLoading && (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-suzuki-mute">Loading…</td></tr>
              )}
              {!ordersQuery.isLoading && orders.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-suzuki-mute">No orders in this incentive period.</td></tr>
              )}
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-suzuki-line/80 hover:bg-suzuki-mist/40">
                  <td className="px-5 py-3.5 text-suzuki-mute">{formatOrderDate(o.createdAtUtc)}</td>
                  <td className="px-4 py-3.5 font-semibold text-suzuki-ink">{o.orderNumber}</td>
                  <td className="px-4 py-3.5 text-suzuki-ink">{o.retailerName || '—'}</td>
                  <td className="px-4 py-3.5 text-suzuki-mute max-w-[180px] truncate">{o.retailerLocation || '—'}</td>
                  <td className="px-4 py-3.5 text-suzuki-mute">{o.shippedBy || shippedByLabel(o)}</td>
                  <td className="px-4 py-3.5"><StatusBadge status={o.status} /></td>
                  <td className="px-5 py-3.5 text-right">
                    <Link
                      to={`/orders/${o.id}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-suzuki-ice text-suzuki-blue hover:bg-sky-100"
                    >
                      <Eye size={15} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function StaffIncentiveDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { role } = useAuth()
  const canAct = role === 'SuperAdmin' || role === 'Admin'
  const qc = useQueryClient()

  const [tab, setTab] = useState<Tab>('all')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'achievement' | 'remaining'>('achievement')

  const detailQuery = useQuery({
    queryKey: ['incentive', id],
    enabled: !!id,
    queryFn: async () => (await api.get<IncentiveDetail>(`/incentives/${id}`)).data
  })

  const sendMutation = useMutation({
    mutationFn: async (participantId: string) =>
      api.post(`/incentives/${id}/participants/${participantId}/send-for-approval`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['incentive', id] })
  })

  const d = detailQuery.data

  const rows = useMemo(() => {
    let items = d?.participants ?? []
    if (tab === 'distributors') items = items.filter((p) => p.kind === 'Distributor')
    if (tab === 'retailers') items = items.filter((p) => p.kind === 'Retailer')
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter((p) => p.name.toLowerCase().includes(q) || p.regionName.toLowerCase().includes(q))
    }
    const sorted = [...items]
    if (sortBy === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name))
    if (sortBy === 'achievement') sorted.sort((a, b) => b.achievementPercent - a.achievementPercent)
    if (sortBy === 'remaining') sorted.sort((a, b) => a.remaining - b.remaining)
    return sorted
  }, [d, tab, search, sortBy])

  if (detailQuery.isLoading) {
    return <p className="text-sm text-suzuki-mute py-16 text-center">Loading…</p>
  }

  if (!d) {
    return (
      <div className="py-16 text-center space-y-3">
        <p className="text-sm text-suzuki-mute">Incentive not found.</p>
        <button type="button" onClick={() => navigate('/incentives')} className="text-suzuki-blue font-semibold text-sm">
          Back
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-suzuki-navy">{d.name}</h1>
        {canAct && (
          <button
            type="button"
            onClick={() => navigate(`/incentives/${d.id}/edit`)}
            className="text-sm font-semibold text-suzuki-blue hover:underline"
          >
            Edit program
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi icon={<Target size={18} />} label="Total Incentive Target" value={formatPkr(d.totalTarget)} />
        <Kpi icon={<ShoppingBasket size={18} />} label="Achievement Rate" value={`${d.achievementRate}%`} />
        <Kpi icon={<Truck size={18} />} label="Total Distributors" value={String(d.distributorCount).padStart(2, '0')} />
        <Kpi icon={<Package size={18} />} label="Total Retailers" value={String(d.retailerCount).padStart(2, '0')} />
        <Kpi icon={<CalendarDays size={18} />} label="End Date" value={formatDate(d.endDateUtc)} />
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          ['all', 'All'],
          ['distributors', 'Distributors'],
          ['retailers', 'Retailors']
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={clsx(
              'rounded-xl px-4 py-2 text-sm font-bold transition-colors',
              tab === key ? 'bg-suzuki-red text-white shadow-card' : 'bg-white text-suzuki-ink border border-suzuki-line hover:bg-suzuki-mist'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="bg-white rounded-2xl border border-suzuki-line shadow-card overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
          <h2 className="font-bold text-suzuki-navy">Live Tracking</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="rounded-lg border border-suzuki-line bg-white px-3 py-2 text-xs font-semibold text-suzuki-ink"
            >
              <option value="achievement">Sort By: Achievement</option>
              <option value="name">Sort By: Name</option>
              <option value="remaining">Sort By: Remaining</option>
            </select>
            <button
              type="button"
              onClick={() =>
                downloadExcel(
                  `incentive-${d.name}-tracking-${tab}`,
                  [
                    { header: 'Name', value: (p) => p.name },
                    { header: 'Kind', value: (p) => p.kind },
                    { header: 'Region', value: (p) => p.regionName },
                    { header: 'Target PKR', value: (p) => p.targetValue },
                    { header: 'Achieved PKR', value: (p) => p.achievedValue },
                    { header: 'Achievement %', value: (p) => p.achievementPercent },
                    { header: 'Remaining', value: (p) => p.remaining },
                    { header: 'Incentive %', value: (p) => p.incentivePercent },
                    { header: 'Incentive PKR', value: (p) => p.incentiveAmount },
                    { header: 'Approval Status', value: (p) => p.approvalStatus }
                  ],
                  rows
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-suzuki-blue/40 text-suzuki-blue px-3 py-2 text-xs font-semibold hover:bg-suzuki-ice"
            >
              <FileSpreadsheet size={14} /> Export Excel
            </button>
            <div className="flex items-center gap-2 bg-suzuki-mist rounded-lg px-3 py-2 border border-suzuki-line">
              <Search size={14} className="text-suzuki-mute" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search"
                className="bg-transparent text-sm outline-none w-32"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-suzuki-mist/80 text-left text-xs font-bold uppercase tracking-wide text-suzuki-mute">
                <th className="px-5 py-3">{tab === 'retailers' ? 'Retailor Name' : 'Distributor Name'}</th>
                <th className="px-4 py-3">Target PKR</th>
                <th className="px-4 py-3">Achieved (PKR)</th>
                <th className="px-4 py-3 min-w-[140px]">Achievement %</th>
                <th className="px-4 py-3">Remaining</th>
                <th className="px-4 py-3">Incentive %</th>
                <th className="px-4 py-3">Incentive (PKR)</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-suzuki-mute">No participants in this view.</td></tr>
              )}
              {rows.map((p) => (
                <tr key={p.id} className="border-t border-suzuki-line/80 hover:bg-suzuki-mist/40">
                  <td className="px-5 py-3.5 font-semibold text-suzuki-ink">
                    {p.name}
                    <div className="text-[11px] font-medium text-suzuki-mute">{p.kind} · {p.regionName}</div>
                  </td>
                  <td className="px-4 py-3.5 text-suzuki-mute">{p.targetValue.toLocaleString('en-PK')}</td>
                  <td className="px-4 py-3.5 text-suzuki-mute">{p.achievedValue.toLocaleString('en-PK')}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className={clsx('text-xs font-bold', p.achievementPercent >= 100 ? 'text-emerald-600' : 'text-orange-600')}>
                        {p.achievementPercent.toFixed(1)}%
                      </span>
                      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden min-w-[60px]">
                        <div
                          className={clsx('h-full rounded-full', p.achievementPercent >= 100 ? 'bg-emerald-500' : 'bg-orange-400')}
                          style={{ width: `${Math.min(p.achievementPercent, 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-suzuki-mute">{p.remaining.toLocaleString('en-PK')}</td>
                  <td className="px-4 py-3.5 text-suzuki-mute">{p.incentivePercent}%</td>
                  <td className="px-4 py-3.5 font-semibold text-suzuki-ink">{p.incentiveAmount.toLocaleString('en-PK')}</td>
                  <td className="px-5 py-3.5 text-right">
                    {canAct && p.approvalStatus === 'Pending' ? (
                      <button
                        type="button"
                        disabled={sendMutation.isPending}
                        onClick={() => sendMutation.mutate(p.id)}
                        className="rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1.5 hover:bg-emerald-200 disabled:opacity-50"
                      >
                        Send For Approval
                      </button>
                    ) : (
                      <span className="text-xs font-semibold text-suzuki-mute">{p.approvalStatus}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Kpi({
  icon, label, value, tone = 'white', valueClass
}: {
  icon: ReactNode
  label: string
  value: string
  tone?: 'white' | 'ice'
  valueClass?: string
}) {
  return (
    <div
      className={clsx(
        'rounded-2xl border border-suzuki-line shadow-card p-4 flex items-start gap-3',
        tone === 'ice' ? 'bg-suzuki-ice' : 'bg-white'
      )}
    >
      <div className="h-9 w-9 rounded-xl bg-white/90 text-suzuki-navy flex items-center justify-center shrink-0 border border-suzuki-line/50">
        {icon}
      </div>
      <div className="min-w-0">
        <div className={clsx('text-lg font-extrabold truncate', valueClass ?? 'text-suzuki-navy')}>{value}</div>
        <div className="text-[11px] font-semibold text-suzuki-mute leading-snug">{label}</div>
      </div>
    </div>
  )
}

function statusBucket(status: string): 'pending' | 'process' | 'completed' | 'other' {
  if (/Delivered|Completed|ApprovedBy/i.test(status)) return 'completed'
  if (/Pending|SentBack/i.test(status)) return 'pending'
  return 'process'
}

function StatusBadge({ status }: { status: string }) {
  const bucket = statusBucket(status)
  const label =
    bucket === 'completed' ? 'Completed' : bucket === 'pending' ? 'Pending' : 'In Process'
  return (
    <span
      className={clsx(
        'inline-flex rounded-full px-3 py-1 text-[11px] font-bold',
        bucket === 'completed' && 'bg-emerald-100 text-emerald-700',
        bucket === 'pending' && 'bg-orange-100 text-orange-700',
        bucket === 'process' && 'bg-pink-100 text-pink-700',
        bucket === 'other' && 'bg-slate-100 text-slate-600'
      )}
    >
      {label}
    </span>
  )
}

function formatOrderDate(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}

function shippedByLabel(o: OrderRow) {
  if (/Pak\s*Suzuki/i.test(o.shippedBy) || /ShipToParty|Forwarded/i.test(o.source + o.status)) return 'Pak Suzuki'
  return o.shippedBy || 'Distributor'
}
