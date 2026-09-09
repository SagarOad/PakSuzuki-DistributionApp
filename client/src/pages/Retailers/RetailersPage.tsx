import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, Trash2, Check, X, RefreshCcw, Package, UserPlus, Power } from 'lucide-react'
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
import PlaceholderImage from '@/components/ui/PlaceholderImage'
import { downloadExcel, fetchAllFromApi, inDateRange, exportFailed } from '@/utils/excelExport'
import clsx from 'clsx'

interface RetailerRow {
  id: string
  retailerCode?: string
  name: string
  businessName: string
  mobileNumber: string
  email: string
  businessAddress: string
  distributorName: string
  distributorApprovalStatus: string
  superAdminApprovalStatus: string
  isActive?: boolean
  isBlocked?: boolean
  createdAtUtc: string
  profileImageUrl?: string | null
}

interface RetailerDetail {
  id: string
  name: string
  mobileNumber: string
  email: string
  businessAddress: string
  distributorName: string
  distributorRegionName?: string
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

export default function RetailersPage() {
  const { role } = useAuth()
  const isStaff = role === 'SuperAdmin' || role === 'Admin'
  const isDistributor = role === 'Distributor'
  const canManage = isStaff || isDistributor
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

  const setTab = (next: Tab) => {
    setPage(1)
    setParams(next === 'requests' ? { tab: 'requests' } : {})
  }

  const listQuery = useQuery({
    queryKey: ['retailers-list', search, page],
    enabled: canManage,
    queryFn: async () =>
      (await api.get<Paged<RetailerRow>>('/retailers', {
        params: { search: search || undefined, pageNumber: page, pageSize: 10 }
      })).data
  })

  const pendingQuery = useQuery({
    queryKey: ['retailers-pending', page],
    enabled: canManage,
    queryFn: async () =>
      (await api.get<Paged<RetailerRow>>('/retailers/pending', {
        params: { pageNumber: page, pageSize: 10 }
      })).data
  })

  const statsQuery = useQuery({
    queryKey: ['dashboard-superadmin'],
    enabled: isStaff,
    queryFn: async () =>
      (await api.get<{ totalRetailers: number; pendingRetailerApprovals: number }>('/dashboards/superadmin')).data
  })

  const correctionDetailQuery = useQuery({
    queryKey: ['retailer-correction-detail', correctionId],
    enabled: !!correctionId,
    queryFn: async () => (await api.get<RetailerDetail>(`/retailers/${correctionId}`)).data
  })

  const approve = useMutation({
    mutationFn: async ({ id, decision, remarks }: { id: string; decision: Decision; remarks?: string | null }) => {
      const endpoint = isStaff ? 'superadmin-approve' : 'distributor-review'
      await api.post(`/retailers/${endpoint}/${id}`, {
        decision,
        remarks: remarks ?? null
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retailers-pending'] })
      queryClient.invalidateQueries({ queryKey: ['retailers-list'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-superadmin'] })
      setCorrectionId(null)
      setCorrectionRemarks('')
    }
  })

  const removeRetailer = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/retailers/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retailers-list'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-superadmin'] })
    }
  })

  const reactivateRetailer = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/retailers/activate/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retailers-list'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-superadmin'] })
    }
  })

  const rows = tab === 'list' ? listQuery.data : pendingQuery.data
  const loading = tab === 'list' ? listQuery.isLoading : pendingQuery.isLoading
  const queryError = tab === 'list' ? listQuery.isError : pendingQuery.isError

  const visibleItems = useMemo(() => {
    let items = rows?.items ?? []
    if (statusFilter === 'active') {
      items = items.filter((r) => r.isActive && r.superAdminApprovalStatus === 'Approved')
    } else if (statusFilter === 'pending') {
      items = items.filter(
        (r) =>
          r.distributorApprovalStatus === 'PendingReview' ||
          r.superAdminApprovalStatus === 'PendingReview'
      )
    }
    if (fromDate) {
      const from = new Date(fromDate)
      items = items.filter((r) => new Date(r.createdAtUtc) >= from)
    }
    if (toDate) {
      const to = new Date(toDate)
      to.setHours(23, 59, 59, 999)
      items = items.filter((r) => new Date(r.createdAtUtc) <= to)
    }
    return items
  }, [rows?.items, statusFilter, fromDate, toDate])

  const filteredHint = useMemo(() => {
    if (!rows) return 'Showing 00 to 00 of 00 entries'
    const start = rows.totalCount === 0 ? 0 : (rows.pageNumber - 1) * 10 + 1
    const end = Math.min(rows.pageNumber * 10, rows.totalCount)
    return `Showing ${String(start).padStart(2, '0')} to ${String(end).padStart(2, '0')} of ${rows.totalCount} entries`
  }, [rows])

  function applyLocalFilters(items: RetailerRow[]) {
    let next = items
    if (statusFilter === 'active') {
      next = next.filter((r) => r.isActive && r.superAdminApprovalStatus === 'Approved')
    } else if (statusFilter === 'pending') {
      next = next.filter(
        (r) =>
          r.distributorApprovalStatus === 'PendingReview' ||
          r.superAdminApprovalStatus === 'PendingReview'
      )
    }
    return next.filter((r) => inDateRange(r.createdAtUtc, fromDate, toDate))
  }

  async function exportRetailers() {
    setExporting(true)
    try {
      const path = tab === 'list' ? '/retailers' : '/retailers/pending'
      const all = await fetchAllFromApi<RetailerRow>(path, {
        search: tab === 'list' ? (search || undefined) : undefined
      })
      const rowsToExport = applyLocalFilters(all)
      downloadExcel(
        `retailers-${tab}${fromDate ? `-from-${fromDate}` : ''}${toDate ? `-to-${toDate}` : ''}`,
        [
          { header: 'Retailer Name', value: (r) => r.name },
          { header: 'Contact Number', value: (r) => r.mobileNumber },
          { header: 'Email', value: (r) => r.email },
          { header: 'Distributor', value: (r) => r.distributorName },
          { header: 'Address', value: (r) => r.businessAddress },
          { header: 'Business Name', value: (r) => r.businessName },
          { header: 'Distributor Approval', value: (r) => r.distributorApprovalStatus },
          { header: 'Super Admin Approval', value: (r) => r.superAdminApprovalStatus },
          { header: 'Created', value: (r) => r.createdAtUtc?.slice(0, 10) ?? '' }
        ],
        rowsToExport
      )
    } catch (err) {
      exportFailed(err)
    } finally {
      setExporting(false)
    }
  }

  if (!canManage) {
    return (
      <div className="bg-white rounded-2xl border border-suzuki-line p-8 text-center text-suzuki-mute">
        Retailers management is not available for this role.
      </div>
    )
  }

  function pipelineStatus(r: RetailerRow) {
    if (r.superAdminApprovalStatus === 'Approved' && (r.isBlocked || !r.isActive)) return 'Deactivated'
    if (r.isActive && r.superAdminApprovalStatus === 'Approved') return 'Active'
    if (r.distributorApprovalStatus === 'Rejected') return 'Rejected by Distributor'
    if (r.superAdminApprovalStatus === 'Rejected') return 'Rejected'
    if (r.distributorApprovalStatus === 'SentBackForCorrection') return 'Sent Back (Distributor)'
    if (r.superAdminApprovalStatus === 'SentBackForCorrection') return 'Sent Back (Super Admin)'
    if (r.distributorApprovalStatus !== 'Approved') return tab === 'requests' ? 'Pending' : 'Awaiting Distributor'
    if (r.superAdminApprovalStatus !== 'Approved') return tab === 'requests' ? 'Pending' : 'Awaiting Super Admin'
    return r.superAdminApprovalStatus
  }

  function canStaffApprove(r: RetailerRow) {
    return isStaff
      && r.distributorApprovalStatus === 'Approved'
      && (r.superAdminApprovalStatus === 'PendingReview' || r.superAdminApprovalStatus === 'SentBackForCorrection')
  }

  function canDistributorApprove(r: RetailerRow) {
    return isDistributor
      && (r.distributorApprovalStatus === 'PendingReview' || r.distributorApprovalStatus === 'SentBackForCorrection')
  }

  const correctionSubject = correctionDetailQuery.data
    ? {
        id: correctionDetailQuery.data.id,
        name: correctionDetailQuery.data.name,
        mobileNumber: correctionDetailQuery.data.mobileNumber,
        email: correctionDetailQuery.data.email,
        location: correctionDetailQuery.data.distributorRegionName || correctionDetailQuery.data.distributorName,
        address: correctionDetailQuery.data.businessAddress,
        images: correctionDetailQuery.data.images
      }
    : null

  const totalRetailers = isStaff
    ? (statsQuery.data?.totalRetailers ?? listQuery.data?.totalCount ?? '—')
    : (listQuery.data?.totalCount ?? '—')
  const pendingCount = isStaff
    ? (statsQuery.data?.pendingRetailerApprovals ?? pendingQuery.data?.totalCount ?? '—')
    : (pendingQuery.data?.totalCount ?? '—')

  return (
    <div className="space-y-4">
      <h1 className="text-2xl sm:text-[30px] font-extrabold text-[#0B2E59] tracking-tight">Retailers List</h1>

      {(queryError || approve.isError) && (
        <div className="rounded-xl border border-suzuki-red/30 bg-red-50 px-4 py-3 text-sm text-suzuki-red">
          {approve.isError
            ? 'Approval failed. Retailer may still be waiting on the previous approval step.'
            : 'Failed to load retailers. Refresh or check that you are signed in as Super Admin / Distributor.'}
        </div>
      )}

      <StatCardRow>
        <StatCard
          tone="sky"
          icon={<Package size={22} />}
          value={totalRetailers}
          label="Total Retailers"
          onClick={() => setTab('list')}
        />
        <StatCard
          tone="request-red"
          icon={<UserPlus size={22} />}
          value={pendingCount}
          label="Retailers Requests"
          onClick={() => setTab('requests')}
        />
      </StatCardRow>

      <div className="flex flex-wrap gap-2.5 pt-1">
        <ListTabPill active={tab === 'list'} onClick={() => setTab('list')}>
          Retailers
        </ListTabPill>
        <ListTabPill active={tab === 'requests'} onClick={() => setTab('requests')}>
          Retailers Requests
        </ListTabPill>
      </div>

      <div className="pt-1">
        <DataTable
          title={tab === 'list' ? 'Retailers List' : 'Retailer Requests'}
          search={search}
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          filterBar={
            <>
              <FilterSelect
                value={statusFilter}
                onChange={(v) => { setStatusFilter(v); setPage(1) }}
                options={[
                  { value: 'all', label: 'All Retailers' },
                  { value: 'active', label: 'Active' },
                  { value: 'pending', label: 'Pending' }
                ]}
              />
              <span className="text-sm font-semibold text-[#0B2E59]">From</span>
              <DateFilterField value={fromDate} onChange={(v) => { setFromDate(v); setPage(1) }} />
              <span className="text-sm font-semibold text-[#0B2E59]">To</span>
              <DateFilterField value={toDate} onChange={(v) => { setToDate(v); setPage(1) }} />
            </>
          }
          toolbarActions={<ExportExcelButton onClick={() => void exportRetailers()} loading={exporting} />}
          columns={[
            { key: 'name', header: 'Retailer Name', wide: true },
            { key: 'contact', header: 'Contact Number' },
            { key: 'email', header: 'Email' },
            { key: 'location', header: 'Location', wide: true },
            { key: 'address', header: 'Address', wide: true },
            { key: 'status', header: 'Retailer Status' },
            { key: 'action', header: 'Action', align: 'right' }
          ]}
          loading={loading}
          empty={tab === 'requests' ? 'No pending retailer requests.' : 'No retailers found.'}
          pagination={{
            page: rows?.pageNumber ?? 1,
            totalPages: Math.max(rows?.totalPages ?? 1, 1),
            onChange: setPage,
            showingText: filteredHint
          }}
        >
          {visibleItems.map((r) => {
            const status = pipelineStatus(r)
            const showApprove = tab === 'requests' && (canStaffApprove(r) || canDistributorApprove(r))
            return (
              <tr key={r.id} className="border-b border-[#E2E4EA]/80 hover:bg-[#F5F7FB]/60">
                <td className="pl-4 pr-3 py-3.5 font-semibold text-[#0B2E59]">
                  <div className="flex items-center gap-2.5">
                    <PlaceholderImage
                      src={r.profileImageUrl}
                      alt={r.name}
                      className="h-9 w-9 shrink-0 rounded-full border border-suzuki-line bg-suzuki-mist"
                      imgClassName="h-full w-full object-cover"
                    />
                    <span>{r.name}</span>
                  </div>
                </td>
                <td className="px-3 py-3.5 text-[#64748B]">{r.mobileNumber}</td>
                <td className="px-3 py-3.5 text-[#64748B]">{r.email}</td>
                <td className="px-3 py-3.5 text-[#64748B]">{r.distributorName}</td>
                <td className="px-3 py-3.5 text-[#64748B] max-w-[200px] truncate">{r.businessAddress}</td>
                <td className="px-3 py-3.5"><StatusPill status={status} /></td>
                <td className="pl-3 pr-4 py-3.5">
                  <div className="flex justify-end gap-1.5 items-center">
                    <RequestActionButton
                      tone="view"
                      title="View"
                      onClick={() => navigate(`/retailers/${r.id}`)}
                    >
                      <Eye size={15} />
                    </RequestActionButton>
                    {showApprove ? (
                      <>
                        <RequestActionButton
                          tone="approve"
                          title="Approve"
                          onClick={() => approve.mutate({ id: r.id, decision: 'Approved' })}
                        >
                          <Check size={15} strokeWidth={2.5} />
                        </RequestActionButton>
                        <RequestActionButton
                          tone="reject"
                          title="Reject"
                          onClick={() => approve.mutate({ id: r.id, decision: 'Rejected' })}
                        >
                          <X size={15} strokeWidth={2.5} />
                        </RequestActionButton>
                        <RequestActionButton
                          tone="correct"
                          title="Send for Correction"
                          onClick={() => {
                            setCorrectionRemarks('')
                            setCorrectionId(r.id)
                          }}
                        >
                          <RefreshCcw size={14} strokeWidth={2.5} />
                        </RequestActionButton>
                      </>
                    ) : tab === 'requests' && isStaff ? (
                      <span className="text-[11px] font-semibold text-suzuki-mute">Waiting on distributor</span>
                    ) : tab === 'list' && role === 'SuperAdmin' ? (
                      <>
                        {r.superAdminApprovalStatus === 'Approved' && (r.isBlocked || !r.isActive) && (
                          <RequestActionButton
                            tone="approve"
                            title="Reactivate"
                            onClick={() => {
                              if (window.confirm(`Reactivate ${r.name}?`)) {
                                reactivateRetailer.mutate(r.id)
                              }
                            }}
                          >
                            <Power size={15} />
                          </RequestActionButton>
                        )}
                        <RequestActionButton
                          tone="reject"
                          title="Remove"
                          onClick={() => {
                            if (window.confirm(`Delete ${r.name}? They will be removed from the list and cannot log in.`)) {
                              removeRetailer.mutate(r.id)
                            }
                          }}
                        >
                          <Trash2 size={15} />
                        </RequestActionButton>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            )
          })}
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
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const ok = status === 'Active' || status === 'Approved'
  const bad = status.includes('Rejected') || status === 'Deactivated'
  const warn =
    status.includes('Awaiting') ||
    status.includes('Sent Back') ||
    status === 'Pending' ||
    status === 'PendingReview' ||
    status === 'SentBackForCorrection'
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
