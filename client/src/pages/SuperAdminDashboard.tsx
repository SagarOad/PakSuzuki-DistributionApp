import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Truck, Package, UserPlus, Users, ShoppingBasket,
  CheckCircle2, XCircle, Search, Crosshair, ChevronRight
} from 'lucide-react'
import { api } from '@/api/axiosClient'
import clsx from 'clsx'

interface SuperAdminDash {
  totalOrders: number
  totalSales: number
  pendingDistributorApprovals: number
  pendingRetailerApprovals: number
  totalDistributors: number
  totalRetailers: number
  activeDistributors: number
  ordersByStatus: { status: string; count: number }[]
}

function statusCount(rows: { status: string; count: number }[] | undefined, ...names: string[]) {
  if (!rows) return 0
  return rows.filter((r) => names.includes(r.status)).reduce((s, r) => s + r.count, 0)
}

export default function SuperAdminDashboard() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<'Week' | 'Month' | 'Year'>('Month')

  const { data, isError, error, isLoading } = useQuery({
    queryKey: ['dashboard-superadmin'],
    queryFn: async () => (await api.get<SuperAdminDash>('/dashboards/superadmin')).data
  })

  const inProcess = statusCount(
    data?.ordersByStatus,
    'PendingDistributorApproval', 'PendingPakSuzukiApproval', 'SubmittedToSap',
    'ApprovedByDistributor', 'ForwardedToPakSuzuki', 'ApprovedByPakSuzuki', 'PartiallyDelivered'
  )
  const completed = statusCount(data?.ordersByStatus, 'Delivered', 'InvoiceConfirmed')
  const canceled = statusCount(data?.ordersByStatus, 'Cancelled', 'RejectedByDistributor')

  const chartPoints = useMemo(() => sampleRevenue(period), [period])

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-5">
      {isError && (
        <div className="xl:col-span-2 rounded-xl border border-suzuki-red/30 bg-red-50 px-4 py-3 text-sm text-suzuki-red">
          Dashboard failed to load{error instanceof Error ? `: ${error.message}` : ''}. Check API logs and refresh.
        </div>
      )}
      {isLoading && !data && (
        <div className="xl:col-span-2 text-sm text-suzuki-mute">Loading dashboard…</div>
      )}
      {/* Bird Eye View */}
      <section>
        <h2 className="text-lg font-bold text-suzuki-navy mb-3">Bird Eye View</h2>
        <div className="relative rounded-2xl overflow-hidden border border-suzuki-line shadow-card bg-white h-[min(640px,70vh)] min-h-[420px]">
          <iframe
            title="Pakistan coverage map"
            className="absolute inset-0 w-full h-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            src="https://www.openstreetmap.org/export/embed.html?bbox=60.5%2C23.5%2C77.5%2C37.2&layer=mapnik&marker=30.3753%2C69.3451"
          />
          <div className="absolute top-4 left-4 right-4 max-w-sm">
            <div className="flex items-center gap-2 bg-white/95 backdrop-blur rounded-xl shadow-card border border-white px-3 py-2.5">
              <Search size={16} className="text-suzuki-mute shrink-0" />
              <input
                placeholder="Search"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-suzuki-mute"
              />
              <button type="button" className="text-suzuki-blue p-1" aria-label="Current location">
                <Crosshair size={16} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Right column */}
      <section className="space-y-5">
        <div>
          <h2 className="text-lg font-bold text-suzuki-navy mb-3">Stats</h2>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              tone="navy"
              icon={<Truck size={22} />}
              value={data?.totalDistributors ?? '—'}
              label="Total Distributors"
              onClick={() => navigate('/distributors')}
            />
            <StatCard
              tone="sky"
              icon={<Package size={22} />}
              value={data?.totalRetailers ?? '—'}
              label="Total Retailers"
              onClick={() => navigate('/retailers')}
            />
            <StatCard
              tone="request-red"
              icon={<UserPlus size={22} />}
              value={data?.pendingDistributorApprovals ?? '—'}
              label="Distributor Requests"
              onClick={() => navigate('/distributors?tab=requests')}
            />
            <StatCard
              tone="request-blue"
              icon={<Users size={22} />}
              value={data?.pendingRetailerApprovals ?? '—'}
              label="Retailers Requests"
              onClick={() => navigate('/retailers?tab=requests')}
            />
          </div>
        </div>

        <div>
          <h2 className="text-lg font-bold text-suzuki-navy mb-3">Order Board</h2>
          <div className="grid grid-cols-2 gap-3">
            <OrderChip
              icon={<ShoppingBasket size={18} className="text-suzuki-blue" />}
              value={data?.totalOrders ?? '—'}
              label="Total Orders"
              onClick={() => navigate('/orders')}
            />
            <OrderChip
              icon={<ShoppingBasket size={18} className="text-suzuki-red" />}
              value={inProcess}
              label="In Process"
              valueClass="text-suzuki-red"
            />
            <OrderChip
              icon={<CheckCircle2 size={18} className="text-suzuki-ok" />}
              value={completed}
              label="Completed"
              valueClass="text-suzuki-ok"
            />
            <OrderChip
              icon={<XCircle size={18} className="text-suzuki-mute" />}
              value={canceled}
              label="Canceled"
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-suzuki-line shadow-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-suzuki-navy">Sales Stats</h2>
            <div className="flex rounded-full bg-suzuki-mist p-0.5 text-xs font-semibold">
              {(['Week', 'Month', 'Year'] as const).map((p) => (
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
          <SalesChart points={chartPoints} />
        </div>
      </section>
    </div>
  )
}

function StatCard({
  tone, icon, value, label, onClick
}: {
  tone: 'navy' | 'sky' | 'request-red' | 'request-blue'
  icon: React.ReactNode
  value: string | number
  label: string
  onClick?: () => void
}) {
  const tones = {
    navy: 'bg-suzuki-navy text-white',
    sky: 'bg-suzuki-ice text-suzuki-navy',
    'request-red': 'bg-white text-suzuki-red border border-suzuki-line',
    'request-blue': 'bg-white text-suzuki-navy border border-suzuki-line'
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'rounded-2xl p-4 text-left shadow-card transition-transform hover:-translate-y-0.5',
        tones[tone]
      )}
    >
      <div className="flex items-start justify-between">
        <div className="opacity-90">{icon}</div>
        <span className={clsx('stat-arrow', tone === 'navy' ? 'bg-white/20' : 'bg-black/5')}>
          <ChevronRight size={14} />
        </span>
      </div>
      <div className="mt-3 text-3xl font-extrabold tracking-tight">{value}</div>
      <div className={clsx('mt-1 text-xs font-semibold', tone.includes('request') || tone === 'sky' ? 'opacity-80' : 'opacity-90')}>
        {label}
      </div>
    </button>
  )
}

function OrderChip({
  icon, value, label, valueClass, onClick
}: {
  icon: React.ReactNode
  value: string | number
  label: string
  valueClass?: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-white rounded-2xl border border-suzuki-line shadow-card p-3.5 text-left flex items-center gap-3 hover:-translate-y-0.5 transition-transform"
    >
      <div className="h-10 w-10 rounded-xl bg-suzuki-mist flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className={clsx('text-xl font-extrabold text-suzuki-ink', valueClass)}>{value}</div>
        <div className="text-[11px] font-semibold text-suzuki-mute truncate">{label}</div>
      </div>
      <ChevronRight size={16} className="text-suzuki-mute shrink-0" />
    </button>
  )
}

function sampleRevenue(period: 'Week' | 'Month' | 'Year') {
  if (period === 'Week') return [12, 18, 14, 22, 28, 24, 30]
  if (period === 'Year') return [18, 22, 20, 28, 35, 32, 40, 38, 42, 45, 48, 50]
  return [18, 28, 22, 35, 30, 42, 38, 48, 40, 45, 42]
}

function SalesChart({ points }: { points: number[] }) {
  const w = 360
  const h = 160
  const pad = 28
  const max = Math.max(...points, 1)
  const labels = points.length <= 7
    ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].slice(0, points.length)
    : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].slice(0, points.length)

  const coords = points.map((v, i) => {
    const x = pad + (i * (w - pad * 2)) / Math.max(points.length - 1, 1)
    const y = h - pad - (v / max) * (h - pad * 2)
    return [x, y] as const
  })

  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
  const area = `${line} L${coords[coords.length - 1][0]},${h - pad} L${coords[0][0]},${h - pad} Z`

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-44" role="img" aria-label="Sales revenue chart">
      {[0.25, 0.5, 0.75, 1].map((t) => (
        <line
          key={t}
          x1={pad}
          x2={w - 8}
          y1={h - pad - t * (h - pad * 2)}
          y2={h - pad - t * (h - pad * 2)}
          stroke="#E2E8F0"
          strokeDasharray="4 4"
        />
      ))}
      <path d={area} fill="url(#salesFill)" />
      <path d={line} fill="none" stroke="#005BAC" strokeWidth="2.5" strokeLinecap="round" />
      {coords.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3.5" fill="#005BAC" />
      ))}
      {labels.map((label, i) => (
        <text
          key={label + i}
          x={coords[i][0]}
          y={h - 8}
          textAnchor="middle"
          className="fill-suzuki-mute"
          style={{ fontSize: 9, fontWeight: 600 }}
        >
          {label}
        </text>
      ))}
      <defs>
        <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7EB6E8" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#7EB6E8" stopOpacity="0.02" />
        </linearGradient>
      </defs>
    </svg>
  )
}
