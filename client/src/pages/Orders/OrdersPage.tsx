import { useEffect, useMemo, useState, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ShoppingBasket, CheckCircle2, XCircle, AlertTriangle, Clock, Eye, Pencil, Briefcase,
  Plus, MapPin, ImageIcon, Gift
} from 'lucide-react'
import { api } from '@/api/axiosClient'
import { useAuth } from '@/context/AuthContext'
import { useAuthStore } from '@/context/authStore'
import { StatCard, StatCardRow } from '@/components/ui/StatCard'
import { StatsGraph } from '@/components/ui/StatsGraph'
import { OrderTable, ExportExcelButton, DateFilterField } from '@/components/ui/DataTable'
import { downloadExcel, fetchAllFromApi, inDateRange, exportFailed } from '@/utils/excelExport'
import clsx from 'clsx'
import { COMPLETED_STATUSES, CANCELED_STATUSES, toUiStatus, formatOrderDate } from './orderTypes'

interface OrderRow {
  id: string
  orderNumber: string
  source: string
  retailerName?: string | null
  retailerLocation?: string | null
  distributorName: string
  status: string
  statusLabel?: string | null
  statusCode?: string | null
  grandTotal: number
  createdAtUtc: string
  thresholdReached: boolean
  shippedBy: string
  productSummary?: string | null
  categorySummary?: string | null
  packsSummary?: string | null
  totalUnits?: number
  statusColor?: string | null
  sapInvoiceNumber?: string | null
  pakSuzukiRemarks?: string | null
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

interface DistributorProfile {
  name: string
  cnic: string
  mobileNumber: string
  email: string
  businessName: string
  ntn: string
  iban: string
  businessAddress: string
  regionName: string
}

type OrderSection = 'retailer' | 'manufacture'
type StatusTab = 'all' | 'pending' | 'process' | 'completed' | 'canceled' | 'threshold' | 'manufacture'

const PROCESS = [
  'PendingDistributorApproval', 'PendingPakSuzukiApproval', 'SubmittedToSap',
  'ApprovedByDistributor', 'PartiallyApprovedByDistributor', 'ForwardedToPakSuzuki',
  'ApprovedByPakSuzuki', 'PartiallyDelivered', 'SentBackForModification'
]
const PENDING = ['PendingDistributorApproval', 'PendingPakSuzukiApproval', 'SentBackForModification']
const COMPLETED = COMPLETED_STATUSES
const CANCELED = CANCELED_STATUSES

function countStatuses(rows: { status: string; count: number }[] | undefined, names: string[]) {
  if (!rows) return 0
  return rows.filter((r) => names.includes(r.status)).reduce((s, r) => s + r.count, 0)
}

function isRetailerSource(source: string) {
  return source === 'RetailerOrder' || source === '0'
}

function isManufactureSource(source: string) {
  return source === 'DistributorDirectOrder' || source === '1'
}

function isActiveStatus(status: string) {
  return !COMPLETED.includes(status) && !CANCELED.includes(status)
}

function matchesStatusTab(o: OrderRow, tab: StatusTab, section: OrderSection) {
  if (tab === 'all') return true
  if (tab === 'pending') return PENDING.includes(o.status)
  if (tab === 'process') {
    // Distributor→Pak Suzuki starts as PendingPakSuzukiApproval; treat that as In Process.
    if (section === 'manufacture') return PROCESS.includes(o.status)
    return PROCESS.includes(o.status) && !PENDING.includes(o.status)
  }
  if (tab === 'completed') return COMPLETED.includes(o.status)
  if (tab === 'canceled') return CANCELED.includes(o.status)
  if (tab === 'threshold') return o.thresholdReached
  return true
}

const STATUS_TABS: StatusTab[] = ['all', 'pending', 'process', 'completed', 'canceled', 'threshold']

export default function OrdersPage() {
  const { role } = useAuth()
  if (role === 'Distributor') return <DistributorOrdersPage />
  return <StaffOrdersExperience />
}

/** Distributor My Orders: dashboard above, then separate retailer / manufacture lists. */
function DistributorOrdersPage() {
  const navigate = useNavigate()
  const listRef = useRef<HTMLDivElement>(null)
  const [params, setParams] = useSearchParams()
  const sectionParam = params.get('section')
  const tabParam = params.get('tab')
  const tab: StatusTab = STATUS_TABS.includes(tabParam as StatusTab) ? (tabParam as StatusTab) : 'all'
  const profileId = useAuthStore((s) => s.profileId)
  const userName = useAuthStore((s) => s.userName)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [period, setPeriod] = useState<'Month' | 'Week' | 'Year'>('Month')
  const [exporting, setExporting] = useState(false)

  const allOrdersQuery = useQuery({
    queryKey: ['orders-distributor-all'],
    queryFn: async () =>
      (await api.get<Paged<OrderRow>>('/orders', {
        params: { pageNumber: 1, pageSize: 200 }
      })).data
  })

  const profileQuery = useQuery({
    queryKey: ['distributor-profile', profileId],
    enabled: !!profileId,
    queryFn: async () => (await api.get<DistributorProfile>(`/distributors/${profileId}`)).data
  })

  const allItems = allOrdersQuery.data?.items ?? []
  const retailerCount = allItems.filter((o) => isRetailerSource(o.source)).length
  const manufactureCount = allItems.filter((o) => isManufactureSource(o.source)).length

  // Prefer Order To Manufacture when that is where this distributor's orders live.
  const section: OrderSection =
    sectionParam === 'manufacture'
      ? 'manufacture'
      : sectionParam === 'retailer'
        ? 'retailer'
        : manufactureCount > 0 && retailerCount === 0
          ? 'manufacture'
          : 'retailer'

  useEffect(() => {
    if (sectionParam || allOrdersQuery.isLoading) return
    const switchToManufacture = () => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('section', 'manufacture')
          return next
        },
        { replace: true }
      )
    }
    if (manufactureCount > 0 && retailerCount === 0) {
      switchToManufacture()
      return
    }
    // URL like ?tab=process with no section: open the list that actually has matches.
    if (tab !== 'all') {
      const retailerMatches = allItems.filter(
        (o) => isRetailerSource(o.source) && matchesStatusTab(o, tab, 'retailer')
      ).length
      const manufactureMatches = allItems.filter(
        (o) => isManufactureSource(o.source) && matchesStatusTab(o, tab, 'manufacture')
      ).length
      if (retailerMatches === 0 && manufactureMatches > 0) switchToManufacture()
    }
  }, [
    sectionParam,
    manufactureCount,
    retailerCount,
    allOrdersQuery.isLoading,
    tab,
    allItems,
    setParams
  ])

  const boardTotal = allItems.length
  const boardInProcess = allItems.filter((o) => isActiveStatus(o.status)).length
  const boardCompleted = allItems.filter((o) => COMPLETED.includes(o.status)).length
  const boardCanceled = allItems.filter((o) => CANCELED.includes(o.status)).length

  const items = useMemo(
    () =>
      allItems.filter((o) =>
        section === 'retailer' ? isRetailerSource(o.source) : isManufactureSource(o.source)
      ),
    [allItems, section]
  )

  const filteredItems = useMemo(() => {
    let list = items.filter((o) => matchesStatusTab(o, tab, section))
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(q) ||
          (o.retailerName ?? '').toLowerCase().includes(q) ||
          (o.retailerLocation ?? '').toLowerCase().includes(q) ||
          o.distributorName.toLowerCase().includes(q)
      )
    }
    list = list.filter((o) => inDateRange(o.createdAtUtc, fromDate, toDate))
    return list
  }, [items, tab, section, search, fromDate, toDate])

  async function exportOrders() {
    setExporting(true)
    try {
      const columns =
        section === 'retailer'
          ? [
              { header: 'Order Date', value: (o: OrderRow) => formatOrderDate(o.createdAtUtc) },
              { header: 'Order Number', value: (o: OrderRow) => o.orderNumber },
              { header: 'Retailer Name', value: (o: OrderRow) => o.retailerName ?? '' },
              { header: 'Retailer Location', value: (o: OrderRow) => o.retailerLocation ?? '' },
              { header: 'Shipped By', value: (o: OrderRow) => (o.thresholdReached ? 'Pak Suzuki' : o.shippedBy || 'Distributor') },
              { header: 'Status', value: (o: OrderRow) => o.statusLabel || toUiStatus(o.status, o.statusCode) },
              { header: 'Total (PKR)', value: (o: OrderRow) => o.grandTotal }
            ]
          : [
              { header: 'Order Date', value: (o: OrderRow) => formatOrderDate(o.createdAtUtc) },
              { header: 'Order Number', value: (o: OrderRow) => o.orderNumber },
              { header: 'Product Information', value: (o: OrderRow) => o.productSummary ?? '' },
              { header: 'Category', value: (o: OrderRow) => o.categorySummary ?? '' },
              { header: 'Packs', value: (o: OrderRow) => o.packsSummary ?? '' },
              { header: 'Unit', value: (o: OrderRow) => o.totalUnits ?? '' },
              { header: 'Status', value: (o: OrderRow) => o.statusLabel || toUiStatus(o.status, o.statusCode) },
              { header: 'Total (PKR)', value: (o: OrderRow) => o.grandTotal }
            ]

      downloadExcel(
        `orders-${section}-${tab}${fromDate ? `-from-${fromDate}` : ''}${toDate ? `-to-${toDate}` : ''}`,
        columns,
        filteredItems
      )
    } catch (err) {
      exportFailed(err)
    } finally {
      setExporting(false)
    }
  }

  const pageItems = filteredItems.slice((page - 1) * 10, page * 10)
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / 10))

  const pickSectionFor = (predicate: (o: OrderRow) => boolean): OrderSection => {
    const r = allItems.filter((o) => isRetailerSource(o.source) && predicate(o)).length
    const m = allItems.filter((o) => isManufactureSource(o.source) && predicate(o)).length
    if (m > 0 && r === 0) return 'manufacture'
    if (r > 0) return 'retailer'
    if (m > 0) return 'manufacture'
    return section
  }

  const setSection = (next: OrderSection, statusTab: StatusTab = 'all') => {
    const nextParams: Record<string, string> = { section: next }
    if (statusTab !== 'all') nextParams.tab = statusTab
    setParams(nextParams)
    setPage(1)
    setSearch('')
    requestAnimationFrame(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const setStatusTab = (statusTab: StatusTab) => {
    const next = new URLSearchParams()
    next.set('section', section)
    if (statusTab !== 'all') next.set('tab', statusTab)
    setParams(next)
    setPage(1)
  }

  const tabs: { key: StatusTab; label: string }[] =
    section === 'retailer'
      ? [
          { key: 'all', label: 'All' },
          { key: 'pending', label: 'Pending' },
          { key: 'process', label: 'In Process' },
          { key: 'completed', label: 'Completed' },
          { key: 'canceled', label: 'Canceled' },
          { key: 'threshold', label: 'Threshold Reached' }
        ]
      : [
          { key: 'all', label: 'All' },
          { key: 'process', label: 'In Process' },
          { key: 'completed', label: 'Completed' },
          { key: 'canceled', label: 'Canceled' }
        ]

  const chartPoints = useMemo(() => {
    if (period === 'Week') return [8, 14, 11, 18, 22, 16, 24]
    if (period === 'Year') return [20, 24, 22, 30, 28, 35, 32, 40, 38, 42, 45, 48]
    return [12, 18, 15, 28, 22, 32, 30, 38, 34, 40, 36, 42]
  }, [period])

  const d = profileQuery.data

  return (
    <div className="space-y-6 pb-8">
      {/* Dashboard (above lists) */}
      <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-5">
        <aside className="space-y-4">
          <section className="bg-white rounded-2xl border border-suzuki-line shadow-card p-4 space-y-3">
            <h2 className="text-sm font-extrabold text-suzuki-navy">Orders Management</h2>
            <button
              type="button"
              onClick={() => setSection('retailer')}
              className={clsx(
                'w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                section === 'retailer'
                  ? 'border-suzuki-red/40 bg-rose-50'
                  : 'border-suzuki-line bg-suzuki-mist/50 hover:bg-sky-50'
              )}
            >
              <span className="h-10 w-10 rounded-lg bg-sky-100 text-suzuki-navy inline-flex items-center justify-center relative">
                <ShoppingBasket size={18} />
                <Plus size={11} className="absolute top-1 right-1" />
              </span>
              <span>
                <span className="block font-extrabold text-suzuki-navy text-sm">Orders To Be</span>
                <span className="text-xs text-suzuki-mute">{retailerCount} retailer orders</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSection('manufacture')}
              className={clsx(
                'w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                section === 'manufacture'
                  ? 'border-suzuki-red/40 bg-rose-50'
                  : 'border-suzuki-line bg-suzuki-mist/50 hover:bg-sky-50'
              )}
            >
              <span className="h-10 w-10 rounded-lg bg-amber-100 text-suzuki-navy inline-flex items-center justify-center">
                <Briefcase size={18} />
              </span>
              <span>
                <span className="block font-extrabold text-suzuki-navy text-sm">Order To Manufacture</span>
                <span className="text-xs text-suzuki-mute">{manufactureCount} to manufacturer</span>
              </span>
            </button>
          </section>

          <section className="bg-white rounded-2xl border border-suzuki-line shadow-card p-4 space-y-3">
            <h2 className="text-sm font-extrabold text-suzuki-navy">Your Profile</h2>
            <p className="font-extrabold text-suzuki-navy">{d?.name || userName}</p>
            <ProfileLine label="CNIC" value={d?.cnic} />
            <ProfileLine label="Contact" value={d?.mobileNumber} />
            <ProfileLine label="Email" value={d?.email} />
            <ProfileLine label="Business Name" value={d?.businessName} />
            <ProfileLine label="NTN" value={d?.ntn} />
            <ProfileLine label="IBAN" value={d?.iban} />
            <div className="pt-2 border-t border-suzuki-line">
              <p className="text-xs font-bold text-suzuki-mute mb-1">Delivery Details</p>
              <p className="text-sm font-semibold text-suzuki-navy">{d?.businessAddress || '—'}</p>
              <Link to="/map" className="inline-flex items-center gap-1 text-xs font-bold text-suzuki-blue mt-2">
                <MapPin size={12} /> Go to Map
              </Link>
            </div>
            <div className="grid grid-cols-4 gap-2 pt-1">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="aspect-square rounded-lg border border-suzuki-line bg-suzuki-mist flex items-center justify-center text-suzuki-mute"
                >
                  <ImageIcon size={16} />
                </div>
              ))}
            </div>
            <div className="rounded-xl bg-emerald-100 text-emerald-800 text-center text-sm font-extrabold py-2.5">
              Active Account
            </div>
          </section>
        </aside>

        <div className="space-y-5 min-w-0">
          <div>
            <h2 className="text-lg font-extrabold text-suzuki-navy mb-3">Order Board</h2>
            <StatCardRow>
              <StatCard
                tone="order-blue"
                icon={<ShoppingBasket size={20} />}
                value={boardTotal}
                label="Total Orders"
                onClick={() => setSection(pickSectionFor(() => true), 'all')}
              />
              <StatCard
                tone="order-red"
                icon={<Clock size={20} />}
                value={boardInProcess}
                label="In Process"
                onClick={() => setSection(pickSectionFor((o) => isActiveStatus(o.status)), 'process')}
              />
              <StatCard
                tone="order-green"
                icon={<CheckCircle2 size={20} />}
                value={boardCompleted}
                label="Completed"
                onClick={() => setSection(pickSectionFor((o) => COMPLETED.includes(o.status)), 'completed')}
              />
              <StatCard
                tone="order-gray"
                icon={<XCircle size={20} />}
                value={boardCanceled}
                label="Canceled"
                onClick={() => setSection(pickSectionFor((o) => CANCELED.includes(o.status)), 'canceled')}
              />
            </StatCardRow>
            <div className="mt-3">
              <StatCard
                tone="order-orange"
                icon={<Gift size={20} />}
                value="—"
                label="Total Incentives Amount"
              />
            </div>
          </div>

          <StatsGraph
            title="Sales Stats"
            points={chartPoints}
            period={period}
            onPeriodChange={setPeriod}
            ariaLabel="Sales stats chart"
            size="large"
          />
        </div>
      </div>

      {/* Orders list (retailer vs manufacture — never mixed) */}
      <div ref={listRef} className="space-y-4 scroll-mt-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold text-suzuki-navy">
            {section === 'retailer' ? 'Orders to be (Retailor)' : 'To Manufacturer'}
          </h2>
          <div className="inline-flex rounded-xl bg-suzuki-mist p-1 text-sm font-bold">
            <button
              type="button"
              onClick={() => setSection('retailer')}
              className={clsx(
                'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg transition-colors',
                section === 'retailer' ? 'bg-white text-suzuki-red shadow-sm' : 'text-suzuki-mute hover:text-suzuki-ink'
              )}
            >
              <ShoppingBasket size={16} />
              Retailer Orders
            </button>
            <button
              type="button"
              onClick={() => setSection('manufacture')}
              className={clsx(
                'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg transition-colors',
                section === 'manufacture' ? 'bg-white text-suzuki-red shadow-sm' : 'text-suzuki-mute hover:text-suzuki-ink'
              )}
            >
              <Briefcase size={16} />
              To Manufacturer
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusTab(key)}
              className={clsx(
                'rounded-xl px-4 py-2 text-sm font-bold transition-colors',
                tab === key
                  ? 'bg-suzuki-red text-white shadow-card'
                  : 'bg-white text-suzuki-ink border border-suzuki-line hover:bg-suzuki-mist'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <OrderTable
          title="Orders List"
          search={search}
          onSearchChange={(v) => {
            setSearch(v)
            setPage(1)
          }}
          filterBar={
            <>
              <span className="text-sm font-semibold text-[#0B2E59]">From</span>
              <DateFilterField value={fromDate} onChange={(v) => { setFromDate(v); setPage(1) }} />
              <span className="text-sm font-semibold text-[#0B2E59]">To</span>
              <DateFilterField value={toDate} onChange={(v) => { setToDate(v); setPage(1) }} />
            </>
          }
          toolbarActions={<ExportExcelButton onClick={() => void exportOrders()} loading={exporting} />}
          columns={
            section === 'retailer'
              ? [
                  { key: 'date', header: 'Order Date' },
                  { key: 'number', header: 'Order Number' },
                  { key: 'party', header: 'Retailor Name', wide: true },
                  { key: 'loc', header: 'Retailor Location' },
                  { key: 'ship', header: 'Shipped By' },
                  { key: 'status', header: 'Order Status' },
                  { key: 'action', header: 'Action', align: 'right' }
                ]
              : [
                  { key: 'date', header: 'Order Date' },
                  { key: 'number', header: 'Order Number' },
                  { key: 'products', header: 'Product Information', wide: true },
                  { key: 'category', header: 'Category' },
                  { key: 'packs', header: 'Packs' },
                  { key: 'unit', header: 'Unit' },
                  { key: 'status', header: 'Order Status' },
                  { key: 'action', header: 'Action', align: 'right' }
                ]
          }
          loading={allOrdersQuery.isLoading}
          empty={
            section === 'retailer'
              ? tab === 'threshold'
                ? 'No threshold-reached retailer orders.'
                : 'No retailer orders found.'
              : 'No orders to manufacturer yet.'
          }
          pagination={{
            page,
            totalPages,
            onChange: setPage,
            variant: 'simple',
            showingText: `Showing ${pageItems.length === 0 ? '00' : '01'} to ${String(pageItems.length).padStart(2, '0')} of ${filteredItems.length} entries`
          }}
        >
          {pageItems.map((o) => {
            const canAmend = section === 'retailer' && o.status === 'PendingDistributorApproval' && !o.pakSuzukiRemarks
            const needsPakSuzukiAmendmentReview =
              (o.statusCode || o.status) === 'PendingDistributorApproval' &&
              (!!o.pakSuzukiRemarks || (o.statusLabel || '').toLowerCase().includes('amendment') || section === 'manufacture')
            return (
            <tr key={o.id} className="border-b border-[#E2E4EA]/80 hover:bg-[#F5F7FB]/60">
              <td className="pl-4 pr-3 py-3.5 text-[#64748B]">{formatOrderDate(o.createdAtUtc)}</td>
              <td className="px-3 py-3.5 font-mono text-xs font-semibold text-[#0B2E59]">{o.orderNumber}</td>
              {section === 'retailer' ? (
                <>
                  <td className="px-3 py-3.5 font-medium text-[#0B2E59]">{o.retailerName ?? '—'}</td>
                  <td className="px-3 py-3.5 text-[#64748B]">{o.retailerLocation || '—'}</td>
                  <td className="px-3 py-3.5">
                    <span
                      className={clsx(
                        'inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold',
                        o.shippedBy === 'Pak Suzuki' || o.thresholdReached
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-sky-100 text-suzuki-navy'
                      )}
                    >
                      {o.thresholdReached ? 'Pak Suzuki' : o.shippedBy || 'Distributor'}
                    </span>
                  </td>
                </>
              ) : (
                <>
                  <td className="px-3 py-3.5 font-medium text-[#0B2E59] max-w-[220px]">
                    <span className="line-clamp-2">{o.productSummary || '—'}</span>
                  </td>
                  <td className="px-3 py-3.5 text-[#64748B]">{o.categorySummary || '—'}</td>
                  <td className="px-3 py-3.5 text-[#64748B]">{o.packsSummary || '—'}</td>
                  <td className="px-3 py-3.5 font-semibold text-[#0B2E59]">{o.totalUnits ?? '—'}</td>
                </>
              )}
              <td className="px-3 py-3.5">
                <OrderStatusPill
                  status={o.status}
                  statusCode={o.statusCode}
                  statusLabel={o.statusLabel}
                  statusColor={o.statusColor}
                  manufactureView={section === 'manufacture'}
                  thresholdReached={o.thresholdReached}
                />
              </td>
              <td className="pl-3 pr-4 py-3.5 text-right whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => navigate(`/orders/${o.id}`)}
                  className="p-1.5 rounded-lg text-suzuki-blue hover:bg-suzuki-ice"
                  title="View"
                >
                  <Eye size={16} />
                </button>
                {canAmend && (
                  <button
                    type="button"
                    onClick={() => navigate(`/orders/${o.id}/amend`)}
                    className="p-1.5 rounded-lg text-suzuki-blue hover:bg-suzuki-ice"
                    title="Amend order"
                  >
                    <Pencil size={16} />
                  </button>
                )}
                {needsPakSuzukiAmendmentReview && (
                  <button
                    type="button"
                    onClick={() => navigate(`/orders/${o.id}/amend`)}
                    className="p-1.5 rounded-lg text-amber-700 hover:bg-amber-50"
                    title="New amendment — approve or change qty"
                  >
                    <Pencil size={16} />
                  </button>
                )}
              </td>
            </tr>
            )
          })}
        </OrderTable>
      </div>
    </div>
  )
}

function ProfileLine({ label, value }: { label: string; value?: string | null }) {
  return (
    <p className="text-xs text-suzuki-mute">
      {label}: <span className="font-semibold text-suzuki-navy">{value || '—'}</span>
    </p>
  )
}

function StaffOrdersExperience() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<'Month' | 'Week' | 'Year'>('Month')
  const [tab, setTab] = useState<StatusTab>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [exporting, setExporting] = useState(false)

  const dashQuery = useQuery({
    queryKey: ['dashboard-superadmin'],
    queryFn: async () => (await api.get<Dash>('/dashboards/superadmin')).data
  })

  const ordersQuery = useQuery({
    queryKey: ['orders-page', page, search],
    queryFn: async () =>
      (await api.get<Paged<OrderRow>>('/orders', {
        params: { pageNumber: page, pageSize: 50, search: search || undefined }
      })).data
  })

  const inProcess = countStatuses(dashQuery.data?.ordersByStatus, PROCESS)
  const completed = countStatuses(dashQuery.data?.ordersByStatus, COMPLETED)
  const canceled = countStatuses(dashQuery.data?.ordersByStatus, CANCELED)

  function filterStaffOrders(list: OrderRow[]) {
    let next = list
    if (tab === 'process') next = next.filter((o) => PROCESS.includes(o.status) || PENDING.includes(o.status))
    if (tab === 'completed') next = next.filter((o) => COMPLETED.includes(o.status))
    if (tab === 'canceled') next = next.filter((o) => CANCELED.includes(o.status))
    if (tab === 'threshold') {
      next = next.filter((o) => o.thresholdReached || (isRetailerSource(o.source) && o.shippedBy === 'Pak Suzuki'))
    }
    if (tab === 'manufacture') {
      next = next.filter((o) => isManufactureSource(o.source))
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      next = next.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(q) ||
          o.distributorName.toLowerCase().includes(q) ||
          (o.retailerName ?? '').toLowerCase().includes(q)
      )
    }
    return next.filter((o) => inDateRange(o.createdAtUtc, fromDate, toDate))
  }

  const filteredItems = useMemo(
    () => filterStaffOrders(ordersQuery.data?.items ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ordersQuery.data, tab, search, fromDate, toDate]
  )

  async function exportStaffOrders() {
    setExporting(true)
    try {
      const all = await fetchAllFromApi<OrderRow>('/orders', { search: search || undefined })
      const rows = filterStaffOrders(all)
      downloadExcel(
        `orders-${tab}${fromDate ? `-from-${fromDate}` : ''}${toDate ? `-to-${toDate}` : ''}`,
        [
          { header: 'Order Date', value: (o) => formatOrderDate(o.createdAtUtc) },
          { header: 'Order Number', value: (o) => o.orderNumber },
          { header: 'Retailer', value: (o) => o.retailerName ?? '' },
          { header: 'Distributor', value: (o) => o.distributorName },
          { header: 'Shipped By', value: (o) => o.shippedBy },
          { header: 'Total (PKR)', value: (o) => o.grandTotal },
          { header: 'Status', value: (o) => o.statusLabel || toUiStatus(o.status, o.statusCode) }
        ],
        rows
      )
    } catch (err) {
      exportFailed(err)
    } finally {
      setExporting(false)
    }
  }

  const chartPoints = useMemo(() => {
    if (period === 'Week') return [8, 14, 11, 18, 22, 16, 24]
    if (period === 'Year') return [20, 24, 22, 30, 28, 35, 32, 40, 38, 42, 45, 48]
    return [12, 18, 15, 28, 22, 32, 30, 38, 34, 40, 36, 42]
  }, [period])

  const staffItems = ordersQuery.data?.items ?? []
  const total = staffItems.length || dashQuery.data?.totalOrders || '—'
  const thresholdCount = staffItems.filter((o) => o.thresholdReached).length
  const manufactureCount = staffItems.filter((o) => isManufactureSource(o.source)).length

  return (
    <div className="space-y-5">
      <StatCardRow>
        <StatCard tone="order-blue" icon={<ShoppingBasket size={20} />} value={total} label="Pak Suzuki Queue" onClick={() => setTab('all')} />
        <StatCard tone="order-red" icon={<Clock size={20} />} value={inProcess} label="In Process" onClick={() => setTab('process')} />
        <StatCard tone="order-green" icon={<CheckCircle2 size={20} />} value={completed} label="Completed" onClick={() => setTab('completed')} />
        <StatCard tone="order-gray" icon={<XCircle size={20} />} value={canceled} label="Canceled" onClick={() => setTab('canceled')} />
        <StatCard tone="order-orange" icon={<AlertTriangle size={20} />} value={thresholdCount} label="Ship-to-Party" onClick={() => setTab('threshold')} />
        <StatCard tone="order-blue" icon={<Briefcase size={20} />} value={manufactureCount} label="Distributor Orders" onClick={() => setTab('manufacture')} />
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
            ['threshold', 'Ship-to-Party (Threshold)'],
            ['manufacture', 'Distributor → Manufacturer']
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key as StatusTab)
              setPage(1)
            }}
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
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        filterBar={
          <>
            <span className="text-sm font-semibold text-[#0B2E59]">From</span>
            <DateFilterField value={fromDate} onChange={(v) => { setFromDate(v); setPage(1) }} />
            <span className="text-sm font-semibold text-[#0B2E59]">To</span>
            <DateFilterField value={toDate} onChange={(v) => { setToDate(v); setPage(1) }} />
          </>
        }
        toolbarActions={<ExportExcelButton onClick={() => void exportStaffOrders()} loading={exporting} />}
        columns={[
          { key: 'date', header: 'Order Date' },
          { key: 'number', header: 'Order Number' },
          { key: 'party', header: 'Retailer / Distributor', wide: true },
          { key: 'ship', header: 'Shipped By' },
          { key: 'total', header: 'Total' },
          { key: 'status', header: 'Order Status' },
          { key: 'action', header: 'Action', align: 'right' }
        ]}
        loading={ordersQuery.isLoading}
        empty={
          tab === 'threshold'
            ? 'No Ship-to-Party (threshold) orders yet.'
            : tab === 'manufacture'
              ? 'No distributor → manufacturer orders yet.'
              : 'No Pak Suzuki queue orders found.'
        }
        pagination={{
          page,
          totalPages: ordersQuery.data?.totalPages ?? 1,
          onChange: setPage,
          variant: 'simple',
          showingText: `Showing ${filteredItems.length === 0 ? '00' : '01'} to ${String(filteredItems.length).padStart(2, '0')} of ${filteredItems.length} entries`
        }}
      >
        {filteredItems.map((o) => (
          <tr key={o.id} className="border-b border-[#E2E4EA]/80 hover:bg-[#F5F7FB]/60">
            <td className="pl-4 pr-3 py-3.5 text-[#64748B]">{formatOrderDate(o.createdAtUtc)}</td>
            <td className="px-3 py-3.5 font-mono text-xs font-semibold text-[#0B2E59]">{o.orderNumber}</td>
            <td className="px-3 py-3.5 text-[#64748B]">
              <div className="font-medium text-[#0B2E59]">{o.retailerName ?? '—'}</div>
              <div className="text-xs">{o.distributorName}</div>
            </td>
            <td className="px-3 py-3.5 text-[#64748B]">{o.shippedBy}</td>
            <td className="px-3 py-3.5 font-semibold text-[#0B2E59]">
              Rs {o.grandTotal.toLocaleString()}
            </td>
            <td className="px-3 py-3.5">
              <OrderStatusPill
                status={o.status}
                statusCode={o.statusCode}
                statusLabel={o.statusLabel}
                statusColor={o.statusColor}
                thresholdReached={o.thresholdReached}
              />
            </td>
            <td className="pl-3 pr-4 py-3.5 text-right whitespace-nowrap">
              <button
                type="button"
                onClick={() => navigate(`/orders/${o.id}`)}
                className="p-1.5 rounded-lg text-suzuki-blue hover:bg-suzuki-ice"
                title="View"
              >
                <Eye size={16} />
              </button>
              {o.status === 'PendingPakSuzukiApproval' && (
                <button
                  type="button"
                  onClick={() => navigate(`/orders/${o.id}/amend`)}
                  className="p-1.5 rounded-lg text-suzuki-blue hover:bg-suzuki-ice"
                  title="Amend"
                >
                  <Pencil size={16} />
                </button>
              )}
            </td>
          </tr>
        ))}
      </OrderTable>
    </div>
  )
}

function OrderStatusPill({
  status,
  statusCode,
  statusLabel,
  manufactureView,
  statusColor,
  thresholdReached
}: {
  status: string
  statusCode?: string | null
  statusLabel?: string | null
  manufactureView?: boolean
  statusColor?: string | null
  thresholdReached?: boolean
}) {
  const code = statusCode || status
  let ui = toUiStatus(status, statusCode)
  if (manufactureView && ui === 'Pending' && code === 'PendingPakSuzukiApproval') {
    ui = 'In Process'
  }
  const label =
    statusLabel ||
    (code === 'PendingPakSuzukiApproval' || code === 'ForwardedToPakSuzuki'
      ? 'Sent to Pak Suzuki'
      : code === 'SentBackForModification'
        ? 'Sent back for amendment'
        : code === 'PendingDistributorApproval' && (manufactureView || thresholdReached)
          ? manufactureView
            ? 'New amendment'
            : 'Threshold met — action needed'
          : code === 'SubmittedToSap' || code === 'ApprovedByPakSuzuki'
            ? manufactureView
              ? 'Pending'
              : ui
            : ui)

  const fromSap =
    statusColor === 'Green'
      ? 'bg-emerald-100 text-suzuki-ok'
      : statusColor === 'Grey'
        ? 'bg-slate-200 text-suzuki-mute'
        : statusColor === 'Yellow'
          ? 'bg-orange-100 text-orange-800'
          : statusColor === 'Red'
            ? 'bg-rose-100 text-suzuki-red'
            : null
  const cls =
    fromSap
    ?? (ui === 'Completed'
      ? 'bg-emerald-100 text-suzuki-ok'
      : ui === 'Cancelled'
        ? 'bg-slate-200 text-suzuki-mute'
        : ui === 'Delivery In Process'
          ? 'bg-orange-100 text-orange-800'
          : ui === 'Pending'
            ? 'bg-amber-100 text-amber-800'
            : 'bg-rose-100 text-suzuki-red')

  return (
    <span className={clsx('inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold max-w-[14rem] text-left leading-snug', cls)}>
      {label}
    </span>
  )
}
