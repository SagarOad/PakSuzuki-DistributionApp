import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ShoppingBasket, CheckCircle2, XCircle, AlertTriangle, Clock, Eye
} from 'lucide-react'
import { api } from '@/api/axiosClient'
import { StatCard, StatCardRow } from '@/components/ui/StatCard'
import { StatsGraph } from '@/components/ui/StatsGraph'
import { OrderTable, ExportExcelButton, DateFilterField } from '@/components/ui/DataTable'
import clsx from 'clsx'
import { COMPLETED_STATUSES, CANCELED_STATUSES, toUiStatus } from './orderTypes'

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
  'ApprovedByPakSuzuki', 'PartiallyDelivered', 'SentBackForModification'
]
const COMPLETED = COMPLETED_STATUSES
const CANCELED = CANCELED_STATUSES

export default function OrdersPage() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<'Month' | 'Week' | 'Year'>('Month')
  const [tab, setTab] = useState<StatusTab>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

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
      <StatCardRow>
        <StatCard tone="order-blue" icon={<ShoppingBasket size={20} />} value={total} label="Total Orders" onClick={() => setTab('all')} />
        <StatCard tone="order-red" icon={<Clock size={20} />} value={inProcess} label="In Process" onClick={() => setTab('process')} />
        <StatCard tone="order-green" icon={<CheckCircle2 size={20} />} value={completed} label="Completed" onClick={() => setTab('completed')} />
        <StatCard tone="order-gray" icon={<XCircle size={20} />} value={canceled} label="Canceled" onClick={() => setTab('canceled')} />
        <StatCard tone="order-orange" icon={<AlertTriangle size={20} />} value={0} label="Threshold Reached" onClick={() => setTab('threshold')} />
      </StatCardRow>

      <StatsGraph
        title="Orders Stats"
        points={chartPoints}
        period={period}
        onPeriodChange={setPeriod}
        ariaLabel="Orders stats chart"
        size="large"
      />

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

      <OrderTable
        title="Orders List"
        search={search}
        onSearchChange={setSearch}
        filterBar={
          <>
            <span className="text-sm font-semibold text-[#0B2E59]">From</span>
            <DateFilterField value={fromDate} onChange={setFromDate} />
            <span className="text-sm font-semibold text-[#0B2E59]">To</span>
            <DateFilterField value={toDate} onChange={setToDate} />
          </>
        }
        toolbarActions={<ExportExcelButton />}
        columns={[
          { key: 'date', header: 'Order Date' },
          { key: 'number', header: 'Order Number' },
          { key: 'party', header: 'Retailer / Distributor', wide: true },
          { key: 'source', header: 'Source' },
          { key: 'total', header: 'Total' },
          { key: 'status', header: 'Order Status' },
          { key: 'action', header: 'Action', align: 'right' }
        ]}
        loading={ordersQuery.isLoading}
        empty={tab === 'threshold' ? 'No threshold-reached orders yet.' : 'No orders found.'}
        pagination={{
          page,
          totalPages: ordersQuery.data?.totalPages ?? 1,
          onChange: setPage,
          variant: 'simple',
          showingText: `Showing ${filteredItems.length === 0 ? '00' : '01'} to ${String(filteredItems.length).padStart(2, '0')} of ${ordersQuery.data?.totalCount ?? 0} entries`
        }}
      >
        {filteredItems.map((o) => (
          <tr key={o.id} className="border-b border-[#E2E4EA]/80 hover:bg-[#F5F7FB]/60">
            <td className="pl-4 pr-3 py-3.5 text-[#64748B]">
              {new Date(o.createdAtUtc).toLocaleDateString()}
            </td>
            <td className="px-3 py-3.5 font-mono text-xs font-semibold text-[#0B2E59]">{o.orderNumber}</td>
            <td className="px-3 py-3.5 text-[#64748B]">
              <div className="font-medium text-[#0B2E59]">{o.retailerName ?? '—'}</div>
              <div className="text-xs">{o.distributorName}</div>
            </td>
            <td className="px-3 py-3.5 text-[#64748B]">{o.source}</td>
            <td className="px-3 py-3.5 font-semibold text-[#0B2E59]">
              Rs {o.grandTotal.toLocaleString()}
            </td>
            <td className="px-3 py-3.5"><OrderStatusPill status={o.status} /></td>
            <td className="pl-3 pr-4 py-3.5 text-right">
              <button
                type="button"
                onClick={() => navigate(`/orders/${o.id}`)}
                className="p-1.5 rounded-lg text-suzuki-blue hover:bg-suzuki-ice"
                title="View"
              >
                <Eye size={16} />
              </button>
            </td>
          </tr>
        ))}
      </OrderTable>

    </div>
  )
}

function OrderStatusPill({ status }: { status: string }) {
  const ui = toUiStatus(status)
  const cls =
    ui === 'Completed'
      ? 'bg-emerald-100 text-suzuki-ok'
      : ui === 'Cancelled'
        ? 'bg-slate-200 text-suzuki-mute'
        : ui === 'Delivery In Process'
          ? 'bg-orange-100 text-orange-800'
          : ui === 'Pending'
            ? 'bg-amber-100 text-amber-800'
            : 'bg-rose-100 text-suzuki-red'

  return <span className={clsx('inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold', cls)}>{ui}</span>
}
