import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList, CheckCircle2, XCircle, Clock, Eye } from 'lucide-react'
import { api } from '@/api/axiosClient'
import { StatCard, StatCardRow } from '@/components/ui/StatCard'
import {
  OrderTable, ExportExcelButton, DateFilterField, FilterSelect, ListTabPill
} from '@/components/ui/DataTable'
import { downloadExcel, fetchAllFromApi, exportFailed } from '@/utils/excelExport'
import clsx from 'clsx'
import {
  claimStatusLabel,
  formatClaimDate,
  type ClaimListRow,
  type ClaimStats,
  type Paged
} from './claimTypes'

type StatusTab = 'all' | 'process' | 'completed' | 'canceled'

export default function ClaimsPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<StatusTab>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [claimFilter, setClaimFilter] = useState('all')
  const [exporting, setExporting] = useState(false)

  const statusParam = useMemo(() => {
    if (tab === 'process') return 'InProcess'
    if (tab === 'completed') return 'Completed'
    if (tab === 'canceled') return 'Cancelled'
    return undefined
  }, [tab])

  const statsQuery = useQuery({
    queryKey: ['claims-stats'],
    queryFn: async () => (await api.get<ClaimStats>('/claims/stats')).data
  })

  const listQuery = useQuery({
    queryKey: ['claims', page, statusParam, search, fromDate, toDate],
    queryFn: async () =>
      (await api.get<Paged<ClaimListRow>>('/claims', {
        params: {
          pageNumber: page,
          pageSize: 10,
          status: statusParam,
          search: search || undefined,
          from: fromDate || undefined,
          to: toDate || undefined
        }
      })).data
  })

  const stats = statsQuery.data
  const items = useMemo(() => {
    let list = listQuery.data?.items ?? []
    if (claimFilter === 'with-order') list = list.filter((c) => !!c.orderNumber)
    if (claimFilter === 'no-order') list = list.filter((c) => !c.orderNumber)
    return list
  }, [listQuery.data?.items, claimFilter])

  async function exportClaims() {
    setExporting(true)
    try {
      const all = await fetchAllFromApi<ClaimListRow>('/claims', {
        status: statusParam,
        search: search || undefined,
        from: fromDate || undefined,
        to: toDate || undefined
      })
      let rows = all
      if (claimFilter === 'with-order') rows = rows.filter((c) => !!c.orderNumber)
      if (claimFilter === 'no-order') rows = rows.filter((c) => !c.orderNumber)

      downloadExcel(
        `claims-${tab}${fromDate ? `-from-${fromDate}` : ''}${toDate ? `-to-${toDate}` : ''}`,
        [
          { header: 'Claims Date', value: (c) => formatClaimDate(c.createdAtUtc) },
          { header: 'Order Number', value: (c) => c.orderNumber ?? '' },
          { header: 'Distributor Name', value: (c) => c.distributorName },
          { header: 'Claims Status', value: (c) => claimStatusLabel(c.status) }
        ],
        rows
      )
    } catch (err) {
      exportFailed(err)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-suzuki-navy">Claims</h1>

      <StatCardRow>
        <StatCard
          tone="order-blue"
          icon={<ClipboardList size={20} />}
          value={stats?.total ?? '—'}
          label="Total Claims"
          onClick={() => { setTab('all'); setPage(1) }}
        />
        <StatCard
          tone="order-red"
          icon={<Clock size={20} />}
          value={stats?.inProcess ?? '—'}
          label="In Process"
          onClick={() => { setTab('process'); setPage(1) }}
        />
        <StatCard
          tone="order-green"
          icon={<CheckCircle2 size={20} />}
          value={stats?.completed ?? '—'}
          label="Completed"
          onClick={() => { setTab('completed'); setPage(1) }}
        />
        <StatCard
          tone="order-gray"
          icon={<XCircle size={20} />}
          value={stats?.cancelled ?? '—'}
          label="Canceled"
          onClick={() => { setTab('canceled'); setPage(1) }}
        />
      </StatCardRow>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['all', 'All'],
            ['process', 'In Process'],
            ['completed', 'Completed'],
            ['canceled', 'Canceled']
          ] as const
        ).map(([key, label]) => (
          <ListTabPill
            key={key}
            active={tab === key}
            onClick={() => { setTab(key); setPage(1) }}
          >
            {label}
          </ListTabPill>
        ))}
      </div>

      <OrderTable
        title="Claims List"
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        filterBar={
          <>
            <FilterSelect
              value={claimFilter}
              onChange={setClaimFilter}
              options={[
                { value: 'all', label: 'All Claims' },
                { value: 'with-order', label: 'With Order' },
                { value: 'no-order', label: 'No Order' }
              ]}
            />
            <span className="text-sm font-semibold text-[#0B2E59]">From</span>
            <DateFilterField value={fromDate} onChange={(v) => { setFromDate(v); setPage(1) }} />
            <span className="text-sm font-semibold text-[#0B2E59]">To</span>
            <DateFilterField value={toDate} onChange={(v) => { setToDate(v); setPage(1) }} />
          </>
        }
        toolbarActions={<ExportExcelButton onClick={() => void exportClaims()} loading={exporting} />}
        columns={[
          { key: 'date', header: 'Claims Date' },
          { key: 'number', header: 'Order Number' },
          { key: 'distributor', header: 'Distributor Name', wide: true },
          { key: 'status', header: 'Claims Status' },
          { key: 'action', header: 'Action', align: 'right' }
        ]}
        loading={listQuery.isLoading}
        empty="No claims found."
        pagination={{
          page,
          totalPages: listQuery.data?.totalPages ?? 1,
          onChange: setPage,
          variant: 'full',
          showingText: `Showing ${items.length === 0 ? '00' : '01'} to ${String(items.length).padStart(2, '0')} of ${listQuery.data?.totalCount ?? 0} entries`
        }}
      >
        {items
          .filter((c) => {
            if (claimFilter === 'with-order') return !!c.orderNumber
            if (claimFilter === 'no-order') return !c.orderNumber
            return true
          })
          .map((c) => (
            <tr key={c.id} className="border-b border-[#E2E4EA]/80 hover:bg-[#F5F7FB]/60">
              <td className="pl-4 pr-3 py-3.5 text-[#64748B]">{formatClaimDate(c.createdAtUtc)}</td>
              <td className="px-3 py-3.5 font-mono text-xs font-semibold text-[#0B2E59]">
                {c.orderNumber ?? '—'}
              </td>
              <td className="px-3 py-3.5 font-medium text-[#0B2E59]">{c.distributorName}</td>
              <td className="px-3 py-3.5"><ClaimStatusPill status={c.status} /></td>
              <td className="pl-3 pr-4 py-3.5 text-right">
                <button
                  type="button"
                  onClick={() => navigate(`/claims/${c.id}`)}
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

export function ClaimStatusPill({ status }: { status: string }) {
  const label = claimStatusLabel(status)
  const cls =
    status === 'Completed'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'Cancelled'
        ? 'bg-slate-200 text-slate-600'
        : 'bg-rose-100 text-rose-700'

  return (
    <span className={clsx('inline-flex rounded-full px-3 py-1 text-[11px] font-bold', cls)}>
      {label}
    </span>
  )
}
