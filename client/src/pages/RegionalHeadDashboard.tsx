import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ShoppingBasket, CheckCircle2, XCircle, MapPin, Truck } from 'lucide-react'
import { api } from '@/api/axiosClient'
import { StatsGraph } from '@/components/ui/StatsGraph'
import DashboardCoverageMap from '@/components/maps/DashboardCoverageMap'
import clsx from 'clsx'

interface RegionalHeadDash {
  regionNames: string[]
  totalOrders: number
  totalSales: number
  ordersByStatus: { status: string; count: number }[]
  topDistributors: {
    distributorId: string
    name: string
    totalSales: number
    orderCount: number
  }[]
}

function statusCount(rows: { status: string; count: number }[] | undefined, ...names: string[]) {
  if (!rows) return 0
  return rows.filter((r) => names.includes(r.status)).reduce((s, r) => s + r.count, 0)
}

/** View-only home for Regional Head — region stats, no approve / edit actions. */
export default function RegionalHeadDashboard() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<'Week' | 'Month' | 'Year'>('Month')

  const { data, isError, error, isLoading } = useQuery({
    queryKey: ['dashboard-regional-head'],
    queryFn: async () => (await api.get<RegionalHeadDash>('/dashboards/regional-head')).data
  })

  const inProcess = statusCount(
    data?.ordersByStatus,
    'PendingDistributorApproval',
    'PendingPakSuzukiApproval',
    'SubmittedToSap',
    'ApprovedByDistributor',
    'ForwardedToPakSuzuki',
    'ApprovedByPakSuzuki',
    'PartiallyDelivered',
    'SentBackForModification'
  )
  const completed = statusCount(data?.ordersByStatus, 'Delivered', 'InvoiceConfirmed')
  const canceled = statusCount(data?.ordersByStatus, 'Cancelled', 'RejectedByDistributor')
  const chartPoints = useMemo(() => sampleRevenue(period), [period])

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-suzuki-navy">
        <span className="font-extrabold">Regional Head — view only. </span>
        You can see stats and orders for your regions. You cannot approve, reject, or edit anything.
      </div>

      {isError && (
        <div className="rounded-xl border border-suzuki-red/30 bg-red-50 px-4 py-3 text-sm text-suzuki-red">
          Dashboard failed to load{error instanceof Error ? `: ${error.message}` : ''}.
        </div>
      )}
      {isLoading && !data && <p className="text-sm text-suzuki-mute">Loading dashboard…</p>}

      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-5 xl:min-h-[calc(100dvh-12rem)]">
        <section className="flex flex-col min-h-[280px] sm:min-h-[360px] xl:min-h-0 xl:h-full">
          <h2 className="text-lg font-bold text-suzuki-navy mb-3 shrink-0">Bird Eye View</h2>
          <DashboardCoverageMap />
        </section>

        <section className="space-y-5">
          <div>
            <h2 className="text-lg font-bold text-suzuki-navy mb-2">Your regions</h2>
            <div className="flex flex-wrap gap-2">
              {(data?.regionNames ?? []).length === 0 ? (
                <p className="text-sm text-suzuki-mute">No regions assigned yet.</p>
              ) : (
                data!.regionNames.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1 rounded-lg bg-white border border-suzuki-line px-2.5 py-1 text-xs font-bold text-suzuki-navy"
                  >
                    <MapPin size={12} />
                    {name}
                  </span>
                ))
              )}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-bold text-suzuki-navy mb-3">Order board</h2>
            <div className="grid grid-cols-2 gap-3">
              <StatChip
                icon={<ShoppingBasket size={18} className="text-suzuki-blue" />}
                value={data?.totalOrders ?? '—'}
                label="Total orders"
                onClick={() => navigate('/orders')}
              />
              <StatChip
                icon={<ShoppingBasket size={18} className="text-suzuki-red" />}
                value={inProcess}
                label="In process"
                valueClass="text-suzuki-red"
              />
              <StatChip
                icon={<CheckCircle2 size={18} className="text-suzuki-ok" />}
                value={completed}
                label="Completed"
                valueClass="text-suzuki-ok"
              />
              <StatChip
                icon={<XCircle size={18} className="text-suzuki-mute" />}
                value={canceled}
                label="Canceled"
              />
            </div>
            <p className="mt-2 text-sm font-semibold text-suzuki-navy">
              Sales:{' '}
              <span className="text-suzuki-red">
                Rs. {Number(data?.totalSales ?? 0).toLocaleString('en-PK')}
              </span>
            </p>
          </div>

          <StatsGraph
            title="Sales stats"
            points={chartPoints}
            period={period}
            onPeriodChange={setPeriod}
            ariaLabel="Regional sales chart"
            size="small"
          />
        </section>
      </div>

      <section className="bg-white rounded-2xl border border-suzuki-line shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-suzuki-line flex items-center gap-2">
          <Truck size={18} className="text-suzuki-navy" />
          <h2 className="text-lg font-extrabold text-suzuki-navy">Top distributors (your regions)</h2>
        </div>
        {(data?.topDistributors ?? []).length === 0 ? (
          <p className="px-5 py-8 text-sm text-suzuki-mute text-center">No distributor sales yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-suzuki-mist/50 text-left text-xs uppercase tracking-wide text-suzuki-mute">
                <tr>
                  <th className="px-5 py-3 font-bold">Distributor</th>
                  <th className="px-5 py-3 font-bold">Orders</th>
                  <th className="px-5 py-3 font-bold text-right">Sales</th>
                </tr>
              </thead>
              <tbody>
                {data!.topDistributors.map((d) => (
                  <tr key={d.distributorId} className="border-t border-suzuki-line/80">
                    <td className="px-5 py-3 font-semibold text-suzuki-navy">{d.name}</td>
                    <td className="px-5 py-3 text-suzuki-mute">{d.orderCount}</td>
                    <td className="px-5 py-3 text-right font-bold text-suzuki-navy">
                      Rs. {Number(d.totalSales).toLocaleString('en-PK')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function StatChip({
  icon,
  value,
  label,
  valueClass,
  onClick
}: {
  icon: React.ReactNode
  value: string | number
  label: string
  valueClass?: string
  onClick?: () => void
}) {
  const className =
    'bg-white rounded-2xl border border-suzuki-line shadow-card p-2.5 sm:p-3.5 text-left flex items-center gap-2 sm:gap-3 min-w-0 w-full'
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${className} hover:-translate-y-0.5 transition-transform`}>
        <ChipInner icon={icon} value={value} label={label} valueClass={valueClass} />
      </button>
    )
  }
  return (
    <div className={className}>
      <ChipInner icon={icon} value={value} label={label} valueClass={valueClass} />
    </div>
  )
}

function ChipInner({
  icon,
  value,
  label,
  valueClass
}: {
  icon: React.ReactNode
  value: string | number
  label: string
  valueClass?: string
}) {
  return (
    <>
      <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-suzuki-mist flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className={clsx('text-lg sm:text-xl font-extrabold text-suzuki-ink', valueClass)}>{value}</div>
        <div className="text-[10px] sm:text-[11px] font-semibold text-suzuki-mute truncate">{label}</div>
      </div>
    </>
  )
}

function sampleRevenue(period: 'Week' | 'Month' | 'Year') {
  if (period === 'Week') return [12, 18, 14, 22, 28, 24, 30]
  if (period === 'Year') return [18, 22, 20, 28, 35, 32, 40, 38, 42, 45, 48, 50]
  return [18, 28, 22, 35, 30, 42, 38, 48, 40, 45, 42]
}
