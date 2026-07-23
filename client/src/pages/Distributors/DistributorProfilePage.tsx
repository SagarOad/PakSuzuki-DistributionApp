import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ShoppingBasket, CheckCircle2, XCircle, Clock, Package, MapPin,
  Search, Eye, FileSpreadsheet, ChevronLeft, ChevronRight, ArrowLeft, ImageIcon
} from 'lucide-react'
import { api } from '@/api/axiosClient'
import { StatCard } from '@/components/ui/StatCard'
import { ProfileChart, useChartPeriod } from '@/components/ui/ProfileChart'
import clsx from 'clsx'

interface DistributorDetail {
  id: string
  distributorCode: string
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
  regionName: string
  approvalStatus: string
  isActive: boolean
  images: { id: string; storageUrl: string; fileName: string }[]
}

interface ProfileStats {
  totalOrders: number
  inProcessOrders: number
  completedOrders: number
  canceledOrders: number
  totalRetailers: number
  totalSales: number
  salesSeries: { label: string; amount: number; orderCount: number }[]
}

interface RetailerRow {
  id: string
  name: string
  mobileNumber: string
  email: string
  businessAddress: string
  distributorName: string
  isActive?: boolean
  superAdminApprovalStatus: string
  distributorApprovalStatus: string
}

interface Paged<T> {
  items: T[]
  pageNumber: number
  totalPages: number
  totalCount: number
}

export default function DistributorProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [period, setPeriod] = useChartPeriod('Month')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const detailQuery = useQuery({
    queryKey: ['distributor-detail', id],
    enabled: !!id,
    queryFn: async () => (await api.get<DistributorDetail>(`/distributors/${id}`)).data
  })

  const statsQuery = useQuery({
    queryKey: ['distributor-profile-stats', id, period],
    enabled: !!id,
    queryFn: async () =>
      (await api.get<ProfileStats>(`/dashboards/distributor/${id}`, { params: { period } })).data
  })

  const retailersQuery = useQuery({
    queryKey: ['distributor-retailers', id, search, page],
    enabled: !!id,
    queryFn: async () =>
      (await api.get<Paged<RetailerRow>>('/retailers', {
        params: {
          distributorId: id,
          search: search || undefined,
          pageNumber: page,
          pageSize: 10
        }
      })).data
  })

  const d = detailQuery.data
  const stats = statsQuery.data
  const mapUrl =
    d && (d.latitude || d.longitude)
      ? `https://www.openstreetmap.org/?mlat=${d.latitude}&mlon=${d.longitude}#map=15/${d.latitude}/${d.longitude}`
      : undefined

  const chartPoints = useMemo(
    () => (stats?.salesSeries ?? []).map((p) => ({ label: p.label, amount: Number(p.amount) })),
    [stats]
  )

  const filteredHint = useMemo(() => {
    const rows = retailersQuery.data
    if (!rows) return 'Showing 00 to 00 of 00 entries'
    const start = rows.totalCount === 0 ? 0 : (rows.pageNumber - 1) * 10 + 1
    const end = Math.min(rows.pageNumber * 10, rows.totalCount)
    return `Showing ${String(start).padStart(2, '0')} to ${String(end).padStart(2, '0')} of ${rows.totalCount} entries`
  }, [retailersQuery.data])

  if (detailQuery.isLoading) {
    return <div className="text-sm text-suzuki-mute py-10 text-center">Loading distributor profile…</div>
  }

  if (detailQuery.isError || !d) {
    return (
      <div className="bg-white rounded-2xl border border-suzuki-line p-8 text-center space-y-3">
        <p className="text-suzuki-red font-semibold">Could not load distributor profile.</p>
        <button type="button" onClick={() => navigate('/distributors')} className="text-suzuki-blue font-bold text-sm">
          Back to Distributors
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/distributors')}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-suzuki-blue hover:underline"
        >
          <ArrowLeft size={16} /> Distributors
        </button>
        <h1 className="text-2xl font-extrabold text-suzuki-navy">{d.name}</h1>
        <span className="text-sm text-suzuki-mute">({d.distributorCode})</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-5">
        {/* Left profile card */}
        <aside className="bg-white rounded-2xl border border-suzuki-line shadow-card p-5 space-y-4 h-fit">
          <div>
            <div className="text-xl font-extrabold text-suzuki-navy">{d.name}</div>
            <dl className="mt-3 space-y-2 text-sm">
              <InfoRow label="CNIC" value={d.cnic} />
              <InfoRow label="Contact Number" value={d.mobileNumber} />
              <InfoRow label="Email" value={d.email} />
              <InfoRow label="Business Name" value={d.businessName} />
              <InfoRow label="NTN" value={d.ntn} />
              <InfoRow label="IBAN" value={d.iban} />
            </dl>
          </div>

          <div className="rounded-xl border border-suzuki-line p-3">
            <div className="font-bold text-suzuki-ink">{d.businessName}</div>
            <div className="mt-1 text-xs text-suzuki-mute flex gap-1.5">
              <MapPin size={14} className="shrink-0 mt-0.5" />
              <span>{d.businessAddress || d.regionName}</span>
            </div>
            {mapUrl && (
              <a
                href={mapUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex text-xs font-bold text-suzuki-blue hover:underline"
              >
                Go to Map
              </a>
            )}
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-suzuki-mute mb-2">Attachments</div>
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 4 }).map((_, i) => {
                const img = d.images?.[i]
                return (
                  <div
                    key={img?.id ?? `placeholder-${i}`}
                    className="aspect-square rounded-lg border border-suzuki-line bg-suzuki-mist flex items-center justify-center overflow-hidden"
                  >
                    {img?.storageUrl ? (
                      <img src={img.storageUrl} alt={img.fileName || ''} className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon size={18} className="text-suzuki-mute" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div
            className={clsx(
              'rounded-full text-center py-2.5 text-sm font-bold',
              d.isActive ? 'bg-emerald-100 text-suzuki-ok' : 'bg-amber-100 text-amber-800'
            )}
          >
            {d.isActive ? 'Active Account' : d.approvalStatus}
          </div>
        </aside>

        {/* Right: stats + chart */}
        <section className="space-y-5">
          <div>
            <h2 className="text-lg font-bold text-suzuki-navy mb-3">Distributor Order Record</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard
                tone="order-blue"
                icon={<ShoppingBasket size={20} />}
                value={stats?.totalOrders ?? '—'}
                label="Total Orders"
                onClick={() => navigate(`/orders?distributorId=${id}`)}
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
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
            <button
              type="button"
              onClick={() => document.getElementById('retailers-under')?.scrollIntoView({ behavior: 'smooth' })}
              className="rounded-2xl bg-suzuki-red text-white p-5 text-left shadow-card hover:-translate-y-0.5 transition-transform min-h-[120px]"
            >
              <Package size={22} className="opacity-90" />
              <div className="mt-4 text-4xl font-extrabold leading-none">{stats?.totalRetailers ?? '—'}</div>
              <div className="mt-2 text-sm font-semibold opacity-90">Retailors Under This Distributor</div>
            </button>

            <ProfileChart
              title="Sales Stats"
              points={chartPoints}
              period={period}
              onPeriodChange={setPeriod}
            />
          </div>
        </section>
      </div>

      {/* Retailers under this distributor */}
      <section id="retailers-under" className="space-y-3">
        <h2 className="text-lg font-bold text-suzuki-navy">Retailors Under this Distributor</h2>
        <div className="bg-white rounded-2xl border border-suzuki-line shadow-card overflow-hidden">
          <div className="px-5 pt-5 pb-3 flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
            <h3 className="font-bold text-suzuki-navy">Retailors List</h3>
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
                className="inline-flex items-center gap-1.5 rounded-lg border border-suzuki-line px-3 py-2 text-xs font-semibold text-suzuki-blue"
              >
                <FileSpreadsheet size={14} /> Export Excel
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-suzuki-mist/80 text-left text-xs font-bold uppercase tracking-wide text-suzuki-mute">
                  <th className="px-5 py-3">Retailor Name</th>
                  <th className="px-4 py-3">Contact Number</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Address</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {retailersQuery.isLoading && (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-suzuki-mute">Loading…</td></tr>
                )}
                {!retailersQuery.isLoading && (retailersQuery.data?.items.length ?? 0) === 0 && (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-suzuki-mute">No retailers under this distributor.</td></tr>
                )}
                {retailersQuery.data?.items.map((r) => (
                  <tr key={r.id} className="border-t border-suzuki-line/80 hover:bg-suzuki-mist/40">
                    <td className="px-5 py-3.5 font-semibold text-suzuki-ink">{r.name}</td>
                    <td className="px-4 py-3.5 text-suzuki-mute">{r.mobileNumber}</td>
                    <td className="px-4 py-3.5 text-suzuki-mute">{r.email}</td>
                    <td className="px-4 py-3.5 text-suzuki-mute">{d.regionName}</td>
                    <td className="px-4 py-3.5 text-suzuki-mute max-w-[200px] truncate">{r.businessAddress}</td>
                    <td className="px-4 py-3.5">
                      <StatusPill status={r.isActive ? 'Active' : r.superAdminApprovalStatus} />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        to={`/retailers/${r.id}`}
                        className="inline-flex p-1.5 rounded-lg text-suzuki-blue hover:bg-suzuki-ice"
                        title="View"
                      >
                        <Eye size={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-4 border-t border-suzuki-line flex flex-col sm:flex-row gap-3 items-center justify-between text-xs text-suzuki-mute">
            <span>{filteredHint}</span>
            <Pagination
              page={retailersQuery.data?.pageNumber ?? 1}
              totalPages={Math.max(retailersQuery.data?.totalPages ?? 1, 1)}
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

function StatusPill({ status }: { status: string }) {
  const ok = status === 'Active' || status === 'Approved'
  return (
    <span
      className={clsx(
        'inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold',
        ok ? 'bg-emerald-100 text-suzuki-ok' : 'bg-amber-100 text-amber-800'
      )}
    >
      {status}
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
