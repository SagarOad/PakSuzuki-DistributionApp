import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Truck, UserPlus, Search, Eye, Trash2, Check, X, RefreshCcw,
  FileSpreadsheet, ChevronLeft, ChevronRight
} from 'lucide-react'
import { api } from '@/api/axiosClient'
import { useAuth } from '@/context/AuthContext'
import { CompactStatCard, CompactStatRow } from '@/components/ui/CompactStatCards'
import { RequestActionButton, SendForCorrectionModal } from '@/components/ui/SendForCorrectionModal'
import clsx from 'clsx'

interface DistributorRow {
  id: string
  distributorCode: string
  name: string
  businessName: string
  regionName: string
  approvalStatus: string
  isActive: boolean
  email: string
  mobileNumber: string
  createdAtUtc: string
}

interface DistributorDetail {
  id: string
  name: string
  mobileNumber: string
  email: string
  businessAddress: string
  regionName: string
  approvalStatus: string
  isActive: boolean
  approvalRemarks?: string
  images?: { id: string; storageUrl: string; fileName: string }[]
}

interface Paged<T> {
  items: T[]
  pageNumber: number
  totalPages: number
  totalCount: number
}

type Tab = 'list' | 'requests'
type Decision = 'Approved' | 'Rejected' | 'SentBackForCorrection'

export default function DistributorsPage() {
  const { role } = useAuth()
  const isStaff = role === 'SuperAdmin' || role === 'Admin'
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') === 'requests' ? 'requests' : 'list') as Tab
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [correctionId, setCorrectionId] = useState<string | null>(null)
  const [correctionRemarks, setCorrectionRemarks] = useState('')

  const setTab = (next: Tab) => {
    setPage(1)
    setParams(next === 'requests' ? { tab: 'requests' } : {})
  }

  const listQuery = useQuery({
    queryKey: ['distributors-list', search, page],
    enabled: isStaff,
    queryFn: async () =>
      (await api.get<Paged<DistributorRow>>('/distributors', {
        params: { search: search || undefined, pageNumber: page, pageSize: 10 }
      })).data
  })

  const pendingQuery = useQuery({
    queryKey: ['distributors-pending', page],
    enabled: isStaff,
    queryFn: async () =>
      (await api.get<Paged<DistributorRow>>('/distributors/pending', {
        params: { pageNumber: page, pageSize: 10 }
      })).data
  })

  const statsQuery = useQuery({
    queryKey: ['dashboard-superadmin'],
    enabled: isStaff,
    queryFn: async () =>
      (await api.get<{
        totalDistributors: number
        pendingDistributorApprovals: number
      }>('/dashboards/superadmin')).data
  })

  const correctionDetailQuery = useQuery({
    queryKey: ['distributor-correction-detail', correctionId],
    enabled: !!correctionId,
    queryFn: async () => (await api.get<DistributorDetail>(`/distributors/${correctionId}`)).data
  })

  const approve = useMutation({
    mutationFn: async ({ id, decision, remarks }: { id: string; decision: Decision; remarks?: string | null }) => {
      await api.post(`/distributors/approve/${id}`, {
        decision,
        remarks: remarks ?? null
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distributors-pending'] })
      queryClient.invalidateQueries({ queryKey: ['distributors-list'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-superadmin'] })
      setCorrectionId(null)
      setCorrectionRemarks('')
    }
  })

  const rows = tab === 'list' ? listQuery.data : pendingQuery.data
  const loading = tab === 'list' ? listQuery.isLoading : pendingQuery.isLoading
  const queryError = tab === 'list' ? listQuery.isError : pendingQuery.isError
  const filteredHint = useMemo(() => {
    if (!rows) return 'Showing 00 to 00 of 00 entries'
    const start = rows.totalCount === 0 ? 0 : (rows.pageNumber - 1) * 10 + 1
    const end = Math.min(rows.pageNumber * 10, rows.totalCount)
    return `Showing ${String(start).padStart(2, '0')} to ${String(end).padStart(2, '0')} of ${rows.totalCount} entries`
  }, [rows])

  if (!isStaff) {
    return (
      <div className="bg-white rounded-2xl border border-suzuki-line p-8 text-center text-suzuki-mute">
        Distributors management is available to Super Admin.
      </div>
    )
  }

  const totalDistributors = statsQuery.data?.totalDistributors ?? listQuery.data?.totalCount ?? '—'
  const pendingDistributors = statsQuery.data?.pendingDistributorApprovals ?? pendingQuery.data?.totalCount ?? '—'
  const correctionSubject = correctionDetailQuery.data
    ? {
        id: correctionDetailQuery.data.id,
        name: correctionDetailQuery.data.name,
        mobileNumber: correctionDetailQuery.data.mobileNumber,
        email: correctionDetailQuery.data.email,
        location: correctionDetailQuery.data.regionName,
        address: correctionDetailQuery.data.businessAddress,
        images: correctionDetailQuery.data.images
      }
    : null

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-suzuki-navy">Distributors</h1>

      {(queryError || approve.isError) && (
        <div className="rounded-xl border border-suzuki-red/30 bg-red-50 px-4 py-3 text-sm text-suzuki-red">
          {approve.isError
            ? 'Approval action failed. Try again.'
            : 'Failed to load distributors. Refresh or sign in again as Super Admin.'}
        </div>
      )}

      <CompactStatRow>
        <CompactStatCard
          tone="navy"
          icon={<Truck size={22} />}
          value={totalDistributors}
          label="Total Distributors"
          onClick={() => setTab('list')}
        />
        <CompactStatCard
          tone="request-red"
          icon={<UserPlus size={22} />}
          value={pendingDistributors}
          label="Distributor Requests"
          onClick={() => setTab('requests')}
        />
      </CompactStatRow>

      <div>
        <h2 className="text-lg font-bold text-suzuki-navy mb-3">Distributor List</h2>
        <div className="flex gap-2">
          <TabPill active={tab === 'list'} onClick={() => setTab('list')}>Distributors</TabPill>
          <TabPill active={tab === 'requests'} onClick={() => setTab('requests')}>
            Distributor Requests
          </TabPill>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-suzuki-line shadow-card overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
          <h3 className="font-bold text-suzuki-navy">
            {tab === 'list' ? 'Distributor Log' : 'Distributor Requests'}
          </h3>
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
              className="inline-flex items-center gap-1.5 rounded-lg border border-suzuki-line px-3 py-2 text-xs font-semibold text-suzuki-blue hover:bg-suzuki-ice"
            >
              <FileSpreadsheet size={14} /> Export Excel
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-suzuki-mist/80 text-left text-xs font-bold uppercase tracking-wide text-suzuki-mute">
                <th className="px-5 py-3">Distributor Name</th>
                <th className="px-4 py-3">Contact Number</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">{tab === 'requests' ? 'Address' : 'Business'}</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-suzuki-mute">Loading…</td>
                </tr>
              )}
              {!loading && (rows?.items.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-suzuki-mute">
                    {tab === 'requests' ? 'No pending distributor requests.' : 'No distributors found.'}
                  </td>
                </tr>
              )}
              {rows?.items.map((d) => (
                <tr key={d.id} className="border-t border-suzuki-line/80 hover:bg-suzuki-mist/40">
                  <td className="px-5 py-3.5 font-semibold text-suzuki-ink">{d.name}</td>
                  <td className="px-4 py-3.5 text-suzuki-mute">{d.mobileNumber}</td>
                  <td className="px-4 py-3.5 text-suzuki-mute">{d.email}</td>
                  <td className="px-4 py-3.5 text-suzuki-mute">{d.regionName}</td>
                  <td className="px-4 py-3.5 text-suzuki-mute max-w-[180px] truncate">{d.businessName}</td>
                  <td className="px-4 py-3.5">
                    <StatusPill
                      status={
                        tab === 'list'
                          ? (d.isActive ? 'Active' : d.approvalStatus)
                          : (d.approvalStatus === 'PendingReview' ? 'Pending' : d.approvalStatus)
                      }
                    />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-1.5">
                      <RequestActionButton
                        tone="view"
                        title="View"
                        onClick={() => navigate(`/distributors/${d.id}`)}
                      >
                        <Eye size={15} />
                      </RequestActionButton>
                      {tab === 'requests' ? (
                        <>
                          <RequestActionButton
                            tone="approve"
                            title="Approve"
                            onClick={() => approve.mutate({ id: d.id, decision: 'Approved' })}
                          >
                            <Check size={15} strokeWidth={2.5} />
                          </RequestActionButton>
                          <RequestActionButton
                            tone="reject"
                            title="Reject"
                            onClick={() => approve.mutate({ id: d.id, decision: 'Rejected' })}
                          >
                            <X size={15} strokeWidth={2.5} />
                          </RequestActionButton>
                          <RequestActionButton
                            tone="correct"
                            title="Send for Correction"
                            onClick={() => {
                              setCorrectionRemarks('')
                              setCorrectionId(d.id)
                            }}
                          >
                            <RefreshCcw size={14} strokeWidth={2.5} />
                          </RequestActionButton>
                        </>
                      ) : (
                        <RequestActionButton tone="view" title="Remove" onClick={() => undefined}>
                          <Trash2 size={15} />
                        </RequestActionButton>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-4 border-t border-suzuki-line flex flex-col sm:flex-row gap-3 items-center justify-between text-xs text-suzuki-mute">
          <span>{filteredHint}</span>
          <Pagination
            page={rows?.pageNumber ?? 1}
            totalPages={Math.max(rows?.totalPages ?? 1, 1)}
            onChange={setPage}
          />
        </div>
      </div>

      {correctionId && (
        <SendForCorrectionModal
          subject={correctionSubject}
          loading={correctionDetailQuery.isLoading}
          remarks={correctionRemarks}
          submitting={approve.isPending}
          onRemarksChange={setCorrectionRemarks}
          onBack={() => {
            setCorrectionId(null)
            setCorrectionRemarks('')
          }}
          onSend={() =>
            approve.mutate({
              id: correctionId,
              decision: 'SentBackForCorrection',
              remarks: correctionRemarks.trim()
            })
          }
        />
      )}
    </div>
  )
}

function TabPill({
  active, onClick, children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'rounded-xl px-5 py-2.5 text-sm font-bold transition-colors',
        active ? 'bg-suzuki-red text-white shadow-card' : 'bg-white text-suzuki-ink border border-suzuki-line hover:bg-suzuki-mist'
      )}
    >
      {children}
    </button>
  )
}

function StatusPill({ status }: { status: string }) {
  const ok = status === 'Active' || status === 'Approved'
  const bad = status === 'Rejected'
  const warn = status === 'SentBackForCorrection' || status === 'PendingReview' || status === 'Pending'
  return (
    <span
      className={clsx(
        'inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold',
        ok && 'bg-emerald-100 text-suzuki-ok',
        bad && 'bg-red-100 text-suzuki-red',
        warn && 'bg-amber-100 text-amber-800',
        !ok && !bad && !warn && 'bg-suzuki-mist text-suzuki-mute'
      )}
    >
      {status}
    </span>
  )
}

function Pagination({
  page, totalPages, onChange
}: {
  page: number
  totalPages: number
  onChange: (p: number) => void
}) {
  const pages = Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1)
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="px-2 py-1 rounded-lg border border-suzuki-line disabled:opacity-40"
      >
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
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className="px-2 py-1 rounded-lg border border-suzuki-line disabled:opacity-40"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  )
}
