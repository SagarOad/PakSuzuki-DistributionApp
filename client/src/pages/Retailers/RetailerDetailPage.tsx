import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ShoppingBasket, CheckCircle2, XCircle, Clock, MapPin,
  Search, Eye, FileSpreadsheet, ChevronLeft, ChevronRight, ArrowLeft, Pencil
} from 'lucide-react'
import { api } from '@/api/axiosClient'
import { useAuth } from '@/context/AuthContext'
import { StatCard } from '@/components/ui/StatCard'
import { ProfileChart, useChartPeriod } from '@/components/ui/ProfileChart'
import ImageGallery from '@/components/ui/ImageGallery'
import PlaceholderImage from '@/components/ui/PlaceholderImage'
import { downloadExcel, fetchAllFromApi } from '@/utils/excelExport'
import clsx from 'clsx'

interface RetailerDetail {
  id: string
  retailerCode: string
  name: string
  cnic: string
  mobileNumber: string
  email: string
  businessName: string
  ntn: string
  iban: string
  businessAddress: string
  latitude: number
  longitude: number
  distributorId: string
  distributorName: string
  distributorEmail: string
  distributorMobile: string
  distributorBusinessAddress: string
  distributorRegionName: string
  distributorLatitude: number
  distributorLongitude: number
  distributorProfileImageUrl?: string | null
  isActive: boolean
  distributorApprovalStatus: string
  superAdminApprovalStatus: string
  profileImageUrl?: string | null
  images: { id: string; storageUrl: string; fileName: string }[]
  sapBusinessPartnerCode?: string | null
}

interface ProfileStats {
  totalOrders: number
  inProcessOrders: number
  completedOrders: number
  canceledOrders: number
  salesSeries: { label: string; amount: number; orderCount: number }[]
}

interface OrderRow {
  id: string
  orderNumber: string
  retailerName?: string
  retailerLocation?: string
  distributorName: string
  status: string
  createdAtUtc: string
}

interface Paged<T> {
  items: T[]
  pageNumber: number
  totalPages: number
  totalCount: number
}

type StatusTab = 'all' | 'pending' | 'process' | 'completed' | 'canceled'

const PROCESS = [
  'ApprovedByDistributor', 'PartiallyApprovedByDistributor', 'ForwardedToPakSuzuki',
  'PendingPakSuzukiApproval', 'ApprovedByPakSuzuki', 'SubmittedToSap', 'PartiallyDelivered',
  'SentBackForModification'
]
const PENDING = ['PendingDistributorApproval']
const COMPLETED = ['Delivered', 'InvoiceConfirmed']
const CANCELED = ['Cancelled', 'RejectedByDistributor']

export default function RetailerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { role } = useAuth()
  const canEdit = role === 'SuperAdmin' || role === 'Admin'
  const [period, setPeriod] = useChartPeriod('Month')
  const [tab, setTab] = useState<StatusTab>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    mobileNumber: '',
    email: '',
    businessName: '',
    ntn: '',
    iban: '',
    businessAddress: '',
    sapBusinessPartnerCode: ''
  })

  const detailQuery = useQuery({
    queryKey: ['retailer-detail', id],
    enabled: !!id,
    queryFn: async () => (await api.get<RetailerDetail>(`/retailers/${id}`)).data
  })

  const startEdit = () => {
    const r = detailQuery.data
    if (!r) return
    setForm({
      name: r.name,
      mobileNumber: r.mobileNumber,
      email: r.email,
      businessName: r.businessName,
      ntn: r.ntn,
      iban: r.iban,
      businessAddress: r.businessAddress,
      sapBusinessPartnerCode: r.sapBusinessPartnerCode ?? ''
    })
    setSaveError(null)
    setEditing(true)
  }

  const saveEdit = useMutation({
    mutationFn: async () => {
      if (!id || !detailQuery.data) throw new Error('Missing retailer')
      await api.put(`/retailers/${id}`, {
        name: form.name.trim(),
        mobileNumber: form.mobileNumber.trim(),
        email: form.email.trim(),
        businessName: form.businessName.trim(),
        ntn: form.ntn.trim(),
        iban: form.iban.trim(),
        businessAddress: form.businessAddress.trim(),
        latitude: detailQuery.data.latitude,
        longitude: detailQuery.data.longitude,
        sapBusinessPartnerCode: form.sapBusinessPartnerCode.trim()
      })
    },
    onSuccess: async () => {
      setEditing(false)
      setSaveError(null)
      await qc.invalidateQueries({ queryKey: ['retailer-detail', id] })
      await qc.invalidateQueries({ queryKey: ['retailers-list'] })
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { detail?: string; title?: string } }; message?: string }
      setSaveError(ax.response?.data?.detail ?? ax.response?.data?.title ?? ax.message ?? 'Could not save.')
    }
  })

  const statsQuery = useQuery({
    queryKey: ['retailer-profile-stats', id, period],
    enabled: !!id,
    queryFn: async () =>
      (await api.get<ProfileStats>(`/dashboards/retailer/${id}`, { params: { period } })).data
  })

  const ordersQuery = useQuery({
    queryKey: ['retailer-orders', id, page, search],
    enabled: !!id,
    queryFn: async () =>
      (await api.get<Paged<OrderRow>>('/orders', {
        params: {
          retailerId: id,
          search: search || undefined,
          pageNumber: page,
          pageSize: 10
        }
      })).data
  })

  const r = detailQuery.data
  const stats = statsQuery.data

  const chartPoints = useMemo(
    () => (stats?.salesSeries ?? []).map((p) => ({ label: p.label, amount: Number(p.orderCount ?? p.amount) })),
    [stats]
  )

  const filteredOrders = useMemo(() => {
    let items = ordersQuery.data?.items ?? []
    if (tab === 'pending') items = items.filter((o) => PENDING.includes(o.status))
    if (tab === 'process') items = items.filter((o) => PROCESS.includes(o.status))
    if (tab === 'completed') items = items.filter((o) => COMPLETED.includes(o.status))
    if (tab === 'canceled') items = items.filter((o) => CANCELED.includes(o.status))
    return items
  }, [ordersQuery.data, tab])

  async function exportOrders() {
    if (!id || !r) return
    setExporting(true)
    try {
      const all = await fetchAllFromApi<OrderRow>('/orders', {
        retailerId: id,
        search: search || undefined
      })
      let rows = all
      if (tab === 'pending') rows = rows.filter((o) => PENDING.includes(o.status))
      if (tab === 'process') rows = rows.filter((o) => PROCESS.includes(o.status))
      if (tab === 'completed') rows = rows.filter((o) => COMPLETED.includes(o.status))
      if (tab === 'canceled') rows = rows.filter((o) => CANCELED.includes(o.status))

      downloadExcel(
        `retailer-${r.retailerCode || id}-orders-${tab}`,
        [
          { header: 'Order Date', value: (o) => new Date(o.createdAtUtc).toLocaleDateString('en-GB') },
          { header: 'Order Number', value: (o) => o.orderNumber },
          { header: 'Retailer Name', value: (o) => o.retailerName ?? r.name },
          { header: 'Retailer Location', value: (o) => o.retailerLocation ?? r.businessAddress },
          { header: 'Distributor Name', value: (o) => o.distributorName },
          { header: 'Order Status', value: (o) => o.status }
        ],
        rows
      )
    } finally {
      setExporting(false)
    }
  }

  const distMapUrl =
    r && (r.distributorLatitude || r.distributorLongitude)
      ? `https://www.openstreetmap.org/?mlat=${r.distributorLatitude}&mlon=${r.distributorLongitude}#map=15/${r.distributorLatitude}/${r.distributorLongitude}`
      : undefined

  const shopMapUrl =
    r && (r.latitude || r.longitude)
      ? `https://www.openstreetmap.org/?mlat=${r.latitude}&mlon=${r.longitude}#map=15/${r.latitude}/${r.longitude}`
      : undefined

  const hint = useMemo(() => {
    const rows = ordersQuery.data
    if (!rows) return 'Showing 00 to 00 of 00 entries'
    const start = rows.totalCount === 0 ? 0 : (rows.pageNumber - 1) * 10 + 1
    const end = Math.min(rows.pageNumber * 10, rows.totalCount)
    return `Showing ${String(start).padStart(2, '0')} to ${String(end).padStart(2, '0')} of ${rows.totalCount} entries`
  }, [ordersQuery.data])

  if (detailQuery.isLoading) {
    return <div className="text-sm text-suzuki-mute py-10 text-center">Loading retailer profile…</div>
  }

  if (detailQuery.isError || !r) {
    return (
      <div className="bg-white rounded-2xl border border-suzuki-line p-8 text-center space-y-3">
        <p className="text-suzuki-red font-semibold">Could not load retailer profile.</p>
        <button type="button" onClick={() => navigate('/retailers')} className="text-suzuki-blue font-bold text-sm">
          Back to Retailers
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-suzuki-blue hover:underline"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="text-2xl font-extrabold text-suzuki-navy">
          {r.name} <span className="text-suzuki-mute font-bold">(Retailer)</span>
        </h1>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={startEdit}
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-suzuki-red text-white text-sm font-bold px-3 py-2"
          >
            <Pencil size={14} /> Edit
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4">
        <aside className="bg-white rounded-2xl border border-suzuki-line shadow-card p-5 space-y-4 h-fit">
          <div className="flex items-center gap-3">
            <PlaceholderImage
              src={r.profileImageUrl}
              alt={r.name}
              className="h-16 w-16 shrink-0 rounded-xl border border-suzuki-line bg-suzuki-mist"
              imgClassName="h-full w-full object-cover"
            />
            <div>
              <div className="text-lg font-extrabold text-suzuki-navy leading-tight">{r.name}</div>
              <div className="text-xs text-suzuki-mute">{r.retailerCode}</div>
            </div>
          </div>

          {editing ? (
            <div className="space-y-2">
              {saveError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-700">{saveError}</div>
              )}
              {(
                [
                  ['name', 'Name'],
                  ['mobileNumber', 'Contact Number'],
                  ['email', 'Email'],
                  ['businessName', 'Business Name'],
                  ['ntn', 'NTN'],
                  ['iban', 'IBAN'],
                  ['businessAddress', 'Business Address'],
                  ['sapBusinessPartnerCode', 'SAP Business Partner Code']
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block space-y-1">
                  <span className="text-xs font-bold text-suzuki-navy">{label}</span>
                  <input
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="w-full rounded-lg border border-sky-100 bg-sky-50 px-2.5 py-2 text-sm font-semibold text-suzuki-navy outline-none focus:border-suzuki-blue"
                  />
                </label>
              ))}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setEditing(false); setSaveError(null) }}
                  className="flex-1 rounded-xl bg-sky-100 text-suzuki-navy font-bold py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saveEdit.isPending}
                  onClick={() => saveEdit.mutate()}
                  className="flex-1 rounded-xl bg-suzuki-red text-white font-bold py-2 text-sm disabled:opacity-50"
                >
                  {saveEdit.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <dl className="space-y-2 text-sm">
              <InfoRow label="CNIC" value={r.cnic} />
              <InfoRow label="Contact Number" value={r.mobileNumber} />
              <InfoRow label="Email" value={r.email} />
              <InfoRow label="Business Name" value={r.businessName} />
              <InfoRow label="NTN" value={r.ntn} />
              <InfoRow label="IBAN" value={r.iban} />
              <InfoRow label="SAP BP Code" value={r.sapBusinessPartnerCode || '—'} />
            </dl>
          )}

          <div className="rounded-xl border border-suzuki-line p-3">
            <div className="text-xs text-suzuki-mute flex gap-1.5">
              <MapPin size={14} className="shrink-0 mt-0.5" />
              <span>{r.businessAddress}</span>
            </div>
            {shopMapUrl && (
              <a
                href={shopMapUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex text-xs font-bold text-suzuki-blue hover:underline"
              >
                Go to Map
              </a>
            )}
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-suzuki-mute mb-2">
              Shop photos ({r.images?.length ?? 0})
            </div>
            <ImageGallery
              images={r.images ?? []}
              emptyText="No shop photos were submitted with this registration."
            />
          </div>

          <div
            className={clsx(
              'rounded-full text-center py-2.5 text-sm font-bold',
              r.isActive ? 'bg-emerald-100 text-suzuki-ok' : 'bg-amber-100 text-amber-800'
            )}
          >
            {r.isActive ? 'Active Account' : r.superAdminApprovalStatus}
          </div>
        </aside>

        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              tone="order-blue"
              icon={<ShoppingBasket size={20} />}
              value={stats?.totalOrders ?? '—'}
              label="Total Orders"
            />
            <StatCard
              tone="order-red"
              icon={<Clock size={20} />}
              value={stats?.inProcessOrders ?? '—'}
              label="In Process"
            />
            <StatCard
              tone="order-green"
              icon={<CheckCircle2 size={20} />}
              value={stats?.completedOrders ?? '—'}
              label="Completed"
            />
            <StatCard
              tone="order-gray"
              icon={<XCircle size={20} />}
              value={stats?.canceledOrders ?? '—'}
              label="Canceled"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
            <div className="bg-white rounded-2xl border border-suzuki-line shadow-card p-4 space-y-3">
              <h2 className="font-bold text-suzuki-navy">Dealing Distributor</h2>
              <div className="flex items-center gap-3">
                <PlaceholderImage
                  src={r.distributorProfileImageUrl}
                  alt={r.distributorName}
                  className="h-12 w-12 shrink-0 rounded-lg border border-suzuki-line bg-suzuki-mist"
                  imgClassName="h-full w-full object-cover"
                />
                <div>
                  <div className="font-extrabold text-suzuki-ink leading-tight">{r.distributorName}</div>
                  <div className="text-xs text-suzuki-mute">{r.distributorRegionName}</div>
                </div>
              </div>
              <div className="text-sm text-suzuki-mute space-y-1">
                <div className="break-all">{r.distributorEmail}</div>
                <div>{r.distributorMobile}</div>
                <div className="flex gap-1.5">
                  <MapPin size={14} className="shrink-0 mt-0.5" />
                  <span className="text-xs">{r.distributorBusinessAddress}</span>
                </div>
              </div>
              {distMapUrl && (
                <a
                  href={distMapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex text-xs font-bold text-suzuki-blue hover:underline"
                >
                  Go to Map
                </a>
              )}
              <button
                type="button"
                onClick={() => navigate(`/distributors/${r.distributorId}`)}
                className="w-full rounded-xl bg-suzuki-navy text-white text-sm font-bold py-2.5"
              >
                View Distributor
              </button>
            </div>

            <ProfileChart
              title="Orders Stats"
              points={chartPoints}
              period={period}
              onPeriodChange={setPeriod}
            />
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['all', 'All'],
              ['pending', 'Pending'],
              ['process', 'In Process'],
              ['completed', 'Completed'],
              ['canceled', 'Canceled']
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => { setTab(key); setPage(1) }}
              className={clsx(
                'rounded-xl px-5 py-2.5 text-sm font-bold transition-colors',
                tab === key
                  ? 'bg-suzuki-red text-white shadow-card'
                  : 'bg-white text-suzuki-ink border border-suzuki-line hover:bg-suzuki-mist'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-suzuki-line shadow-card overflow-hidden">
          <div className="px-5 pt-5 pb-3 flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
            <h3 className="font-bold text-suzuki-navy">Orders</h3>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 bg-suzuki-mist rounded-lg px-3 py-2 border border-suzuki-line">
                <Search size={14} className="text-suzuki-mute" />
                <input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                  placeholder="Search"
                  className="bg-transparent text-sm outline-none w-36"
                />
              </div>
              <button
                type="button"
                disabled={exporting}
                onClick={() => void exportOrders()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-suzuki-line px-3 py-2 text-xs font-semibold text-suzuki-blue disabled:opacity-50"
              >
                <FileSpreadsheet size={14} /> {exporting ? 'Exporting…' : 'Export Excel'}
              </button>
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
                  <th className="px-4 py-3">Distributor Name</th>
                  <th className="px-4 py-3">Order Status</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {ordersQuery.isLoading && (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-suzuki-mute">Loading…</td></tr>
                )}
                {!ordersQuery.isLoading && filteredOrders.length === 0 && (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-suzuki-mute">No orders found.</td></tr>
                )}
                {filteredOrders.map((o) => (
                  <tr key={o.id} className="border-t border-suzuki-line/80 hover:bg-suzuki-mist/40">
                    <td className="px-5 py-3.5 text-suzuki-mute">
                      {new Date(o.createdAtUtc).toLocaleDateString('en-GB')}
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-suzuki-ink">{o.orderNumber}</td>
                    <td className="px-4 py-3.5 text-suzuki-mute">{o.retailerName ?? r.name}</td>
                    <td className="px-4 py-3.5 text-suzuki-mute max-w-[160px] truncate">
                      {o.retailerLocation ?? r.businessAddress}
                    </td>
                    <td className="px-4 py-3.5 text-suzuki-mute">{o.distributorName}</td>
                    <td className="px-4 py-3.5"><OrderStatusPill status={o.status} /></td>
                    <td className="px-5 py-3.5 text-right">
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
              </tbody>
            </table>
          </div>

          <div className="px-5 py-4 border-t border-suzuki-line flex flex-col sm:flex-row gap-3 items-center justify-between text-xs text-suzuki-mute">
            <span>{hint}</span>
            <Pagination
              page={ordersQuery.data?.pageNumber ?? 1}
              totalPages={Math.max(ordersQuery.data?.totalPages ?? 1, 1)}
              onChange={setPage}
            />
          </div>
        </div>
      </section>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-suzuki-mute w-32 shrink-0">{label}</dt>
      <dd className="font-semibold text-suzuki-ink break-all">{value || '—'}</dd>
    </div>
  )
}

function OrderStatusPill({ status }: { status: string }) {
  const process = PROCESS.includes(status) || PENDING.includes(status)
  const done = COMPLETED.includes(status)
  const bad = CANCELED.includes(status)
  const label =
    PENDING.includes(status) ? 'Pending'
      : PROCESS.includes(status) ? 'In process'
        : COMPLETED.includes(status) ? 'Completed'
          : CANCELED.includes(status) ? 'Canceled'
            : status

  return (
    <span
      className={clsx(
        'inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold',
        process && 'bg-pink-100 text-suzuki-red',
        done && 'bg-emerald-100 text-suzuki-ok',
        bad && 'bg-suzuki-mist text-suzuki-mute',
        !process && !done && !bad && 'bg-suzuki-mist text-suzuki-mute'
      )}
    >
      {label}
    </span>
  )
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  const pages = Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1)
  return (
    <div className="flex items-center gap-1">
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} className="px-2 py-1 rounded-lg border border-suzuki-line disabled:opacity-40">
        <ChevronLeft size={14} />
      </button>
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={clsx(
            'h-7 min-w-7 px-2 rounded-lg text-xs font-bold',
            p === page ? 'bg-suzuki-navy text-white' : 'border border-suzuki-line hover:bg-suzuki-mist'
          )}
        >
          {p}
        </button>
      ))}
      <button type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)} className="px-2 py-1 rounded-lg border border-suzuki-line disabled:opacity-40">
        <ChevronRight size={14} />
      </button>
    </div>
  )
}
