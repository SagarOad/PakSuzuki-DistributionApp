import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, Trash2, Check, X, RefreshCcw, Truck, UserPlus, Power } from 'lucide-react'
import { api } from '@/api/axiosClient'
import { useAuth } from '@/context/AuthContext'
import { StatCard, StatCardRow } from '@/components/ui/StatCard'
import {
  DataTable,
  ExportExcelButton,
  ListTabPill,
  FilterSelect,
  DateFilterField
} from '@/components/ui/DataTable'
import { RequestActionButton, SendForCorrectionModal } from '@/components/ui/SendForCorrectionModal'
import { DeleteDistributorModal } from '@/components/ui/DeleteDistributorModal'
import PlaceholderImage from '@/components/ui/PlaceholderImage'
import { downloadExcel, fetchAllFromApi, inDateRange, exportFailed } from '@/utils/excelExport'
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
  profileImageUrl?: string | null
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
  const [statusFilter, setStatusFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [correctionId, setCorrectionId] = useState<string | null>(null)
  const [correctionRemarks, setCorrectionRemarks] = useState('')
  const [exporting, setExporting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null)

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

  const onDistributorDeleted = () => {
    queryClient.invalidateQueries({ queryKey: ['distributors-list'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-superadmin'] })
    queryClient.invalidateQueries({ queryKey: ['retailers'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-map-markers'] })
    setDeleteTarget(null)
  }

  const reactivateDistributor = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/distributors/activate/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distributors-list'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-superadmin'] })
    }
  })

  const rows = tab === 'list' ? listQuery.data : pendingQuery.data
  const loading = tab === 'list' ? listQuery.isLoading : pendingQuery.isLoading
  const queryError = tab === 'list' ? listQuery.isError : pendingQuery.isError

  function listStatus(d: DistributorRow) {
    if (d.approvalStatus === 'Approved' && !d.isActive) return 'Deactivated'
    return d.isActive ? 'Active' : d.approvalStatus
  }

  const visibleItems = useMemo(() => {
    let items = rows?.items ?? []
    if (statusFilter === 'active') items = items.filter((d) => d.isActive)
    else if (statusFilter === 'pending') items = items.filter((d) => d.approvalStatus === 'PendingReview')
    if (fromDate) {
      const from = new Date(fromDate)
      items = items.filter((d) => new Date(d.createdAtUtc) >= from)
    }
    if (toDate) {
      const to = new Date(toDate)
      to.setHours(23, 59, 59, 999)
      items = items.filter((d) => new Date(d.createdAtUtc) <= to)
    }
    return items
  }, [rows?.items, statusFilter, fromDate, toDate])

  const filteredHint = useMemo(() => {
    if (!rows) return 'Showing 00 to 00 of 00 entries'
    const start = rows.totalCount === 0 ? 0 : (rows.pageNumber - 1) * 10 + 1
    const end = Math.min(rows.pageNumber * 10, rows.totalCount)
    return `Showing ${String(start).padStart(2, '0')} to ${String(end).padStart(2, '0')} of ${rows.totalCount} entries`
  }, [rows])

  function applyLocalFilters(items: DistributorRow[]) {
    let next = items
    if (statusFilter === 'active') next = next.filter((d) => d.isActive)
    else if (statusFilter === 'pending') next = next.filter((d) => d.approvalStatus === 'PendingReview')
    return next.filter((d) => inDateRange(d.createdAtUtc, fromDate, toDate))
  }

  async function exportDistributors() {
    setExporting(true)
    try {
      const path = tab === 'list' ? '/distributors' : '/distributors/pending'
      const all = await fetchAllFromApi<DistributorRow>(path, {
        search: tab === 'list' ? (search || undefined) : undefined
      })
      const rowsToExport = applyLocalFilters(all)
      downloadExcel(
        `distributors-${tab}${fromDate ? `-from-${fromDate}` : ''}${toDate ? `-to-${toDate}` : ''}`,
        [
          { header: 'Distributor Name', value: (d) => d.name },
          { header: 'Code', value: (d) => d.distributorCode },
          { header: 'Contact Number', value: (d) => d.mobileNumber },
          { header: 'Email', value: (d) => d.email },
          { header: 'Location', value: (d) => d.regionName },
          { header: 'Business Name', value: (d) => d.businessName },
          { header: 'Status', value: (d) => listStatus(d) },
          { header: 'Created', value: (d) => d.createdAtUtc?.slice(0, 10) ?? '' }
        ],
        rowsToExport
      )
    } catch (err) {
      exportFailed(err)
    } finally {
      setExporting(false)
    }
  }

  if (!isStaff) {
    return (
      <div className="bg-white rounded-2xl border border-suzuki-line p-8 text-center text-suzuki-mute">
        Distributors management is available to Super Admin.
      </div>
    )
  }

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

  const totalDistributors = statsQuery.data?.totalDistributors ?? listQuery.data?.totalCount ?? '—'
  const pendingDistributors = statsQuery.data?.pendingDistributorApprovals ?? pendingQuery.data?.totalCount ?? '—'

  return (
    <div className="space-y-4">
      <h1 className="text-2xl sm:text-[30px] font-extrabold text-[#0B2E59] tracking-tight">Distributors List</h1>

      {(queryError || approve.isError) && (
        <div className="rounded-xl border border-suzuki-red/30 bg-red-50 px-4 py-3 text-sm text-suzuki-red">
          {approve.isError
            ? 'Approval action failed. Try again.'
            : 'Failed to load distributors. Refresh or sign in again as Super Admin.'}
        </div>
      )}

      <StatCardRow>
        <StatCard
          tone="navy"
          icon={<Truck size={22} />}
          value={totalDistributors}
          label="Total Distributors"
          onClick={() => setTab('list')}
        />
        <StatCard
          tone="request-red"
          icon={<UserPlus size={22} />}
          value={pendingDistributors}
          label="Distributor Requests"
          onClick={() => setTab('requests')}
        />
      </StatCardRow>

      <div className="flex flex-wrap gap-2.5 pt-1">
        <ListTabPill active={tab === 'list'} onClick={() => setTab('list')}>
          Distributors
        </ListTabPill>
        <ListTabPill active={tab === 'requests'} onClick={() => setTab('requests')}>
          Distributors Requests
        </ListTabPill>
      </div>

      <div className="pt-1">
        <DataTable
          title={tab === 'list' ? 'Distributors List' : 'Distributor Requests'}
          search={search}
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          filterBar={
            <>
              <FilterSelect
                value={statusFilter}
                onChange={(v) => { setStatusFilter(v); setPage(1) }}
                options={[
                  { value: 'all', label: 'All Distributors' },
                  { value: 'active', label: 'Active' }
                ]}
              />
              <span className="text-sm font-semibold text-[#0B2E59]">From</span>
              <DateFilterField value={fromDate} onChange={(v) => { setFromDate(v); setPage(1) }} />
              <span className="text-sm font-semibold text-[#0B2E59]">To</span>
              <DateFilterField value={toDate} onChange={(v) => { setToDate(v); setPage(1) }} />
            </>
          }
          toolbarActions={<ExportExcelButton onClick={() => void exportDistributors()} loading={exporting} />}
          columns={[
            { key: 'name', header: 'Distributor Name', wide: true },
            { key: 'contact', header: 'Contact Number' },
            { key: 'email', header: 'Email' },
            { key: 'location', header: 'Location', wide: true },
            { key: 'address', header: 'Address', wide: true },
            { key: 'status', header: 'Distributor Status' },
            { key: 'action', header: 'Action', align: 'right' }
          ]}
          loading={loading}
          empty={tab === 'requests' ? 'No pending distributor requests.' : 'No distributors found.'}
          pagination={{
            page: rows?.pageNumber ?? 1,
            totalPages: Math.max(rows?.totalPages ?? 1, 1),
            onChange: setPage,
            showingText: filteredHint
          }}
        >
          {visibleItems.map((d) => (
            <tr key={d.id} className="border-b border-[#E2E4EA]/80 hover:bg-[#F5F7FB]/60">
              <td className="pl-4 pr-3 py-3.5 font-semibold text-[#0B2E59]">
                <div className="flex items-center gap-2.5">
                  <PlaceholderImage
                    src={d.profileImageUrl}
                    alt={d.name}
                    className="h-9 w-9 shrink-0 rounded-full border border-suzuki-line bg-suzuki-mist"
                    imgClassName="h-full w-full object-cover"
                  />
                  <span>{d.name}</span>
                </div>
              </td>
              <td className="px-3 py-3.5 text-[#64748B]">{d.mobileNumber}</td>
              <td className="px-3 py-3.5 text-[#64748B]">{d.email}</td>
              <td className="px-3 py-3.5 text-[#64748B]">{d.regionName}</td>
              <td className="px-3 py-3.5 text-[#64748B] max-w-[180px] truncate">{d.businessName}</td>
              <td className="px-3 py-3.5">
                <StatusPill
                  status={
                    tab === 'list'
                      ? listStatus(d)
                      : (d.approvalStatus === 'PendingReview' ? 'Pending' : d.approvalStatus)
                  }
                />
              </td>
              <td className="pl-3 pr-4 py-3.5">
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
                  ) : role === 'SuperAdmin' ? (
                    <>
                      {d.approvalStatus === 'Approved' && !d.isActive && (
                        <RequestActionButton
                          tone="approve"
                          title="Reactivate"
                          onClick={() => {
                            if (window.confirm(`Reactivate ${d.name}?`)) {
                              reactivateDistributor.mutate(d.id)
                            }
                          }}
                        >
                          <Power size={15} />
                        </RequestActionButton>
                      )}
                      <RequestActionButton
                        tone="reject"
                        title="Remove"
                        onClick={() =>
                          setDeleteTarget({
                            id: d.id,
                            label: `${d.businessName || d.name} (${d.distributorCode})`
                          })
                        }
                      >
                        <Trash2 size={15} />
                      </RequestActionButton>
                    </>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
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

      {deleteTarget && (
        <DeleteDistributorModal
          distributorId={deleteTarget.id}
          distributorLabel={deleteTarget.label}
          onBack={() => setDeleteTarget(null)}
          onDeleted={onDistributorDeleted}
        />
      )}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const ok = status === 'Active' || status === 'Approved'
  const bad = status === 'Rejected' || status === 'Deactivated'
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
