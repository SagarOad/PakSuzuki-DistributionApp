import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Package, UserPlus, ShoppingBasket, CheckCircle2, XCircle, Clock, FilePlus2, ArrowRight
} from 'lucide-react'
import { api } from '@/api/axiosClient'
import { StatCard } from '@/components/ui/StatCard'
import { StatsGraph } from '@/components/ui/StatsGraph'
import HeaderBannerCarousel from '@/components/banners/HeaderBannerCarousel'
import DashboardCoverageMap from '@/components/maps/DashboardCoverageMap'
import { useAuth } from '@/context/AuthContext'
import type { CatalogBanner } from '@/pages/Catalog/catalogTypes'
import { categorySlug } from '@/pages/Shop/shopTypes'
import clsx from 'clsx'

interface DistributorDash {
  totalRetailers: number
  totalOrders: number
  openOrders: number
  totalSales: number
  inProgressOrders: number
  cancelOrders: number
  completeOrders: number
}

interface PendingPage {
  totalCount: number
}

export default function DistributorDashboard() {
  const navigate = useNavigate()
  const { userName } = useAuth()
  const [period, setPeriod] = useState<'Week' | 'Month' | 'Year'>('Month')

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['dashboard-distributor'],
    queryFn: async () => (await api.get<DistributorDash>('/dashboards/distributor')).data
  })

  const { data: pending } = useQuery({
    queryKey: ['retailers-pending'],
    queryFn: async () => (await api.get<PendingPage>('/retailers/pending')).data
  })

  const categoryBannersQuery = useQuery({
    queryKey: ['catalog-banners', 'Category'],
    queryFn: async () =>
      (await api.get<CatalogBanner[]>('/catalog/banners', { params: { type: 'Category' } })).data
  })

  const chartPoints = useMemo(() => sampleRevenue(period), [period])
  const categoryBanners = (categoryBannersQuery.data ?? []).filter((b) => !!b.imageUrl)
  const pendingCount = pending?.totalCount ?? 0

  return (
    <div className="space-y-5 pb-8">
      {/* Actions */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-suzuki-mute">Distributor</p>
          <h1 className="text-2xl font-extrabold text-suzuki-navy mt-0.5">Dashboard</h1>
          <p className="text-sm text-suzuki-mute mt-1">Welcome back, {userName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate('/order/start')}
            className="inline-flex items-center gap-2 rounded-xl bg-suzuki-red px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700"
          >
            <FilePlus2 size={16} /> Start Order
          </button>
          <button
            type="button"
            onClick={() => navigate('/orders')}
            className="inline-flex items-center gap-2 rounded-xl bg-white border border-suzuki-line px-4 py-2.5 text-sm font-bold text-suzuki-navy hover:bg-suzuki-mist"
          >
            <ShoppingBasket size={16} /> My Orders
          </button>
          <button
            type="button"
            onClick={() => navigate('/retailers?tab=requests')}
            className="inline-flex items-center gap-2 rounded-xl bg-white border border-suzuki-line px-4 py-2.5 text-sm font-bold text-suzuki-navy hover:bg-suzuki-mist"
          >
            <UserPlus size={16} />
            Requests
            {pendingCount > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-suzuki-red text-white text-[10px] font-extrabold inline-flex items-center justify-center">
                {pendingCount > 99 ? '99+' : pendingCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Low fixed-ratio promo slider */}
      <HeaderBannerCarousel showEmpty={false} emptyHint="No promotions" />

      {isError && (
        <div className="rounded-xl border border-suzuki-red/30 bg-red-50 px-4 py-3 text-sm text-suzuki-red">
          Dashboard failed to load{error instanceof Error ? `: ${error.message}` : ''}. Refresh and try again.
        </div>
      )}
      {isLoading && !data && (
        <div className="text-sm text-suzuki-mute">Loading dashboard…</div>
      )}

      {/* Same pattern as Super Admin: map left, stats + graph right */}
      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-5 xl:min-h-[calc(100dvh-14rem)]">
        <section className="flex flex-col min-h-[280px] sm:min-h-[360px] xl:min-h-0 xl:h-full">
          <h2 className="text-lg font-bold text-suzuki-navy mb-3 shrink-0">My retailers map</h2>
          <DashboardCoverageMap
            searchPlaceholder="Search my retailers"
            emptyMessage="No retailers with a map location yet."
          />
        </section>

        <section className="space-y-5 xl:h-full">
          <div>
            <h2 className="text-lg font-bold text-suzuki-navy mb-3">Stats</h2>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                tone="sky"
                icon={<Package size={22} />}
                value={data?.totalRetailers ?? '—'}
                label="My Retailers"
                onClick={() => navigate('/retailers')}
              />
              <StatCard
                tone="request-red"
                icon={<UserPlus size={22} />}
                value={pendingCount}
                label="Retailer Requests"
                onClick={() => navigate('/retailers?tab=requests')}
              />
              <StatCard
                tone="order-blue"
                icon={<ShoppingBasket size={22} />}
                value={data?.totalOrders ?? '—'}
                label="Total Orders"
                onClick={() => navigate('/orders')}
              />
              <StatCard
                tone="navy"
                icon={<ShoppingBasket size={22} />}
                value={data?.totalSales != null ? `Rs ${Math.round(data.totalSales).toLocaleString()}` : '—'}
                label="Total Sales"
                onClick={() => navigate('/orders')}
              />
            </div>
          </div>

          <div>
            <h2 className="text-lg font-bold text-suzuki-navy mb-3">Order Board</h2>
            <div className="grid grid-cols-2 gap-3">
              <OrderChip
                icon={<Clock size={18} className="text-suzuki-red" />}
                value={data?.openOrders ?? '—'}
                label="Open Orders"
                valueClass="text-suzuki-red"
                onClick={() => navigate('/orders')}
              />
              <OrderChip
                icon={<ShoppingBasket size={18} className="text-suzuki-blue" />}
                value={data?.inProgressOrders ?? '—'}
                label="In Process"
                onClick={() => navigate('/orders?tab=process')}
              />
              <OrderChip
                icon={<CheckCircle2 size={18} className="text-suzuki-ok" />}
                value={data?.completeOrders ?? '—'}
                label="Completed"
                valueClass="text-suzuki-ok"
                onClick={() => navigate('/orders?tab=completed')}
              />
              <OrderChip
                icon={<XCircle size={18} className="text-suzuki-mute" />}
                value={data?.cancelOrders ?? '—'}
                label="Canceled"
                onClick={() => navigate('/orders?tab=canceled')}
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

      {/* Category cards — only when image exists */}
      {categoryBanners.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold text-suzuki-navy">Shop by category</h2>
              <p className="text-xs text-suzuki-mute mt-0.5">Open a category to start ordering</p>
            </div>
            <Link to="/order/start" className="text-xs font-bold text-suzuki-blue inline-flex items-center gap-1">
              Catalog <ArrowRight size={12} />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {categoryBanners.map((b) => (
              <Link
                key={b.id}
                to={`/catalog/${categorySlug(b.categoryName || b.bannerName || 'all')}`}
                className="group rounded-2xl overflow-hidden border border-suzuki-line bg-white shadow-card hover:border-suzuki-blue/40 hover:shadow-md transition-all"
              >
                <div className="aspect-[16/10] bg-suzuki-mist overflow-hidden">
                  <img
                    src={b.imageUrl}
                    alt={b.bannerName || b.categoryName}
                    className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                  />
                </div>
                <div className="px-3 py-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-suzuki-navy truncate">
                    {b.bannerName || b.categoryName}
                  </p>
                  <ArrowRight size={14} className="text-suzuki-mute shrink-0 group-hover:text-suzuki-red" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
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
      className={clsx(
        'w-full text-left rounded-2xl border border-suzuki-line bg-white shadow-card px-4 py-3.5',
        onClick && 'hover:bg-suzuki-mist/50 transition-colors'
      )}
    >
      <div className="flex items-center gap-2 mb-1">{icon}</div>
      <p className={clsx('text-xl font-extrabold text-suzuki-navy', valueClass)}>{value}</p>
      <p className="text-xs font-semibold text-suzuki-mute mt-0.5">{label}</p>
    </button>
  )
}

function sampleRevenue(period: 'Week' | 'Month' | 'Year') {
  if (period === 'Week') return [8, 14, 11, 18, 22, 16, 24]
  if (period === 'Year') return [20, 24, 22, 30, 28, 35, 32, 40, 38, 42, 45, 48]
  return [12, 18, 15, 28, 22, 32, 30, 38, 34, 40, 36, 42]
}
