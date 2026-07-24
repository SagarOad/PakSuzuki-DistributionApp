import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Package, UserPlus, ShoppingBasket, Clock, Target, ChevronRight
} from 'lucide-react'
import { api } from '@/api/axiosClient'
import { StatCard, StatCardRow } from '@/components/ui/StatCard'
import { useAuth } from '@/context/AuthContext'
import clsx from 'clsx'

interface DistributorDash {
  totalRetailers: number
  totalOrders: number
  openOrders: number
  totalSales: number
  targets: {
    targetId: string
    targetAmount: number
    achievedAmount: number
    achievementPercent: number
    periodStartUtc: string
    periodEndUtc: string
  }[]
  recentOrders: {
    id: string
    orderNumber: string
    status: string
    grandTotal: number
    createdAtUtc: string
  }[]
}

interface PendingPage {
  items: { id: string; name: string; businessName: string }[]
  totalCount: number
}

export default function DistributorDashboard() {
  const navigate = useNavigate()
  const { userName } = useAuth()

  const { data } = useQuery({
    queryKey: ['dashboard-distributor'],
    queryFn: async () => (await api.get<DistributorDash>('/dashboards/distributor')).data
  })

  const { data: pending } = useQuery({
    queryKey: ['retailers-pending'],
    queryFn: async () => (await api.get<PendingPage>('/retailers/pending')).data
  })

  const target = data?.targets?.[0]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-suzuki-navy">Distributor Dashboard</h1>
        <p className="text-sm text-suzuki-mute mt-1">Welcome back, {userName}</p>
      </div>

      <StatCardRow>
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
          value={pending?.totalCount ?? 0}
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
          tone="order-red"
          icon={<Clock size={22} />}
          value={data?.openOrders ?? '—'}
          label="Open Orders"
          onClick={() => navigate('/orders')}
        />
      </StatCardRow>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-suzuki-line shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-suzuki-navy">Pending Retailer Approvals</h2>
            <button
              type="button"
              onClick={() => navigate('/retailers?tab=requests')}
              className="text-xs font-bold text-suzuki-blue inline-flex items-center gap-1"
            >
              View all <ChevronRight size={14} />
            </button>
          </div>

          {(pending?.items.length ?? 0) === 0 && (
            <p className="text-sm text-suzuki-mute py-6 text-center">
              No retailer registration requests right now.
            </p>
          )}

          <ul className="space-y-2">
            {pending?.items.slice(0, 5).map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-suzuki-line px-4 py-3 hover:bg-suzuki-mist/50"
              >
                <div>
                  <div className="font-semibold text-suzuki-ink">{r.name}</div>
                  <div className="text-xs text-suzuki-mute">{r.businessName}</div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/retailers?tab=requests')}
                  className="rounded-lg bg-suzuki-red text-white text-xs font-bold px-3 py-1.5"
                >
                  Review
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white rounded-2xl border border-suzuki-line shadow-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target size={18} className="text-suzuki-navy" />
            <h2 className="text-lg font-bold text-suzuki-navy">Target vs Achievement</h2>
          </div>
          {target ? (
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-suzuki-mute">Achieved</span>
                <span className="font-bold text-suzuki-ink">
                  Rs {target.achievedAmount.toLocaleString()} / {target.targetAmount.toLocaleString()}
                </span>
              </div>
              <div className="h-3 rounded-full bg-suzuki-mist overflow-hidden">
                <div
                  className="h-full rounded-full bg-suzuki-navy transition-all"
                  style={{ width: `${Math.min(target.achievementPercent, 100)}%` }}
                />
              </div>
              <div className="mt-2 text-2xl font-extrabold text-suzuki-navy">
                {target.achievementPercent}%
              </div>
            </div>
          ) : (
            <p className="text-sm text-suzuki-mute py-6 text-center">No target set for this period yet.</p>
          )}

          <div className="mt-6 border-t border-suzuki-line pt-4">
            <h3 className="font-bold text-suzuki-navy mb-3">Recent Orders</h3>
            {(data?.recentOrders.length ?? 0) === 0 && (
              <p className="text-sm text-suzuki-mute text-center py-4">No recent orders.</p>
            )}
            <ul className="space-y-2">
              {data?.recentOrders.slice(0, 5).map((o) => (
                <li key={o.id} className="flex justify-between text-sm border-b border-suzuki-line/60 py-2">
                  <span className="font-mono text-xs font-semibold">{o.orderNumber}</span>
                  <span className={clsx('text-xs font-bold', o.status.includes('Pending') ? 'text-amber-700' : 'text-suzuki-mute')}>
                    {o.status}
                  </span>
                  <span className="font-semibold">Rs {o.grandTotal.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
