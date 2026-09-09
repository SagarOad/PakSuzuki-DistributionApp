import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Truck, Package, UserPlus, Users, ShoppingBasket,
  CheckCircle2, XCircle, ChevronRight
} from 'lucide-react'
import { api } from '@/api/axiosClient'
import { StatCard } from '@/components/ui/StatCard'
import { StatsGraph } from '@/components/ui/StatsGraph'
import DashboardCoverageMap from '@/components/maps/DashboardCoverageMap'
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
    <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-5 xl:min-h-[calc(100dvh-10.5rem)]">
      {isError && (
        <div className="xl:col-span-2 rounded-xl border border-suzuki-red/30 bg-red-50 px-4 py-3 text-sm text-suzuki-red">
          Dashboard failed to load{error instanceof Error ? `: ${error.message}` : ''}. Check API logs and refresh.
        </div>
      )}
      {isLoading && !data && (
        <div className="xl:col-span-2 text-sm text-suzuki-mute">Loading dashboard…</div>
      )}
      {/* Bird Eye View */}
      <section className="flex flex-col min-h-[280px] sm:min-h-[360px] xl:min-h-0 xl:h-full">
        <h2 className="text-lg font-bold text-suzuki-navy mb-3 shrink-0">Bird Eye View</h2>
        <DashboardCoverageMap />
      </section>

      {/* Right column */}
      <section className="space-y-5 xl:h-full">
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

        <StatsGraph
          title="Sales Stats"
          points={chartPoints}
          period={period}
          onPeriodChange={setPeriod}
          ariaLabel="Sales revenue chart"
          size="small"
        />
      </section>
    </div>
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
      className="bg-white rounded-2xl border border-suzuki-line shadow-card p-2.5 sm:p-3.5 text-left flex items-center gap-2 sm:gap-3 hover:-translate-y-0.5 transition-transform min-w-0"
    >
      <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-suzuki-mist flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className={clsx('text-lg sm:text-xl font-extrabold text-suzuki-ink', valueClass)}>{value}</div>
        <div className="text-[10px] sm:text-[11px] font-semibold text-suzuki-mute truncate">{label}</div>
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
