import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueries, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Eye, Pencil, Plus, Search, Trash2, TrendingUp, CheckCircle2, XCircle
} from 'lucide-react'
import clsx from 'clsx'
import { api } from '@/api/axiosClient'
import { useAuth } from '@/context/AuthContext'
import { useAuthStore } from '@/context/authStore'
import {
  formatDate, formatPkr, type IncentiveDetail, type IncentiveListRow, type Paged
} from './incentiveTypes'

type DistFilter = 'all' | 'completed'

export default function IncentivesPage() {
  const { role } = useAuth()
  const isDistributor = role === 'Distributor'
  if (isDistributor) return <DistributorIncentivesView />
  return <StaffIncentivesView />
}

function DistributorIncentivesView() {
  const profileId = useAuthStore((s) => s.profileId)
  const [filter, setFilter] = useState<DistFilter>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const listQuery = useQuery({
    queryKey: ['incentives', search, page],
    queryFn: async () =>
      (await api.get<Paged<IncentiveListRow>>('/incentives', {
        params: { search: search || undefined, pageNumber: page, pageSize: 10 }
      })).data
  })

  const items = listQuery.data?.items ?? []
  const detailQueries = useQueries({
    queries: items.map((row) => ({
      queryKey: ['incentive', row.id],
      queryFn: async () => (await api.get<IncentiveDetail>(`/incentives/${row.id}`)).data,
      staleTime: 60_000
    }))
  })

  const enriched = items.map((row, i) => {
    const detail = detailQueries[i]?.data
    const mine = detail?.participants.find(
      (p) => p.kind === 'Distributor' && p.distributorId === profileId
    )
    const completed = !row.isActive || new Date(row.endDateUtc) < new Date()
    return { row, mine, completed, loading: detailQueries[i]?.isLoading }
  })

  const filtered = filter === 'completed' ? enriched.filter((e) => e.completed) : enriched

  const kpiTotal = listQuery.data?.totalCount ?? enriched.length
  const kpiCompleted = enriched.filter((e) => e.completed).length
  const kpiIncomplete = Math.max(0, kpiTotal - kpiCompleted)

  const total = listQuery.data?.totalCount ?? 0
  const totalPages = listQuery.data?.totalPages ?? 1
  const showing = useMemo(() => {
    if (filtered.length === 0) return 'Showing 00 to 00 of 0 entries'
    const from = String((page - 1) * 10 + 1).padStart(2, '0')
    const to = String((page - 1) * 10 + filtered.length).padStart(2, '0')
    return `Showing ${from} to ${to} of ${total} entries`
  }, [filtered.length, page, total])

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-suzuki-navy">My Incentives</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard
          tone="ice"
          icon={<TrendingUp size={18} />}
          value={String(kpiTotal).padStart(2, '0')}
          label="Total Incentive"
        />
        <KpiCard
          tone="white"
          icon={<CheckCircle2 size={18} className="text-emerald-600" />}
          value={String(kpiCompleted).padStart(2, '0')}
          label="Completed Incentive"
        />
        <KpiCard
          tone="white"
          icon={<XCircle size={18} className="text-suzuki-red" />}
          value={String(kpiIncomplete).padStart(2, '0')}
          label="In Completed Incentive"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          ['all', 'All'],
          ['completed', 'Completed']
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={clsx(
              'rounded-xl px-5 py-2 text-sm font-bold transition-colors',
              filter === key
                ? 'bg-suzuki-red text-white shadow-card'
                : 'bg-white text-suzuki-ink border border-suzuki-line hover:bg-suzuki-mist'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="bg-white rounded-2xl border border-suzuki-line shadow-card overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <h2 className="font-bold text-suzuki-navy">Incentives Logs</h2>
          <div className="flex items-center gap-2 bg-suzuki-mist rounded-lg px-3 py-2 border border-suzuki-line">
            <Search size={14} className="text-suzuki-mute" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search"
              className="bg-transparent text-sm outline-none w-40"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-suzuki-mist/80 text-left text-xs font-bold uppercase tracking-wide text-suzuki-mute">
                <th className="px-5 py-3">Incentive Name</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Start Date</th>
                <th className="px-4 py-3">End Date</th>
                <th className="px-4 py-3">Target PKR</th>
                <th className="px-4 py-3 min-w-[140px]">Achievement %</th>
                <th className="px-4 py-3">Incentive (PKR)</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {listQuery.isLoading && (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-suzuki-mute">Loading…</td></tr>
              )}
              {!listQuery.isLoading && filtered.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-suzuki-mute">No incentives yet.</td></tr>
              )}
              {filtered.map(({ row, mine, loading }) => (
                <tr key={row.id} className="border-t border-suzuki-line/80 hover:bg-suzuki-mist/40">
                  <td className="px-5 py-3.5 font-semibold text-suzuki-ink">{row.name}</td>
                  <td className="px-4 py-3.5 text-suzuki-mute max-w-[200px] truncate">{row.description || '—'}</td>
                  <td className="px-4 py-3.5 text-suzuki-mute">{formatDate(row.startDateUtc)}</td>
                  <td className="px-4 py-3.5 text-suzuki-mute">{formatDate(row.endDateUtc)}</td>
                  <td className="px-4 py-3.5 text-suzuki-mute">
                    {loading ? '…' : mine ? formatPkr(mine.targetValue) : '—'}
                  </td>
                  <td className="px-4 py-3.5">
                    {loading || !mine ? (
                      <span className="text-suzuki-mute">—</span>
                    ) : (
                      <AchievementBar percent={mine.achievementPercent} />
                    )}
                  </td>
                  <td className="px-4 py-3.5 font-semibold text-suzuki-ink">
                    {loading ? '…' : mine ? formatPkr(mine.incentiveAmount) : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link
                      to={`/incentives/${row.id}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-suzuki-ice text-suzuki-blue hover:bg-sky-100"
                      title="View details"
                    >
                      <Eye size={15} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pager showing={showing} page={page} totalPages={totalPages} setPage={setPage} />
      </section>
    </div>
  )
}

function StaffIncentivesView() {
  const navigate = useNavigate()
  const { role } = useAuth()
  const canEdit = role === 'SuperAdmin' || role === 'Admin'
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const listQuery = useQuery({
    queryKey: ['incentives', search, page],
    queryFn: async () =>
      (await api.get<Paged<IncentiveListRow>>('/incentives', {
        params: { search: search || undefined, pageNumber: page, pageSize: 10 }
      })).data
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/incentives/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['incentives'] })
  })

  const items = listQuery.data?.items ?? []
  const total = listQuery.data?.totalCount ?? 0
  const totalPages = listQuery.data?.totalPages ?? 1

  const showing = useMemo(() => {
    if (items.length === 0) return 'Showing 00 to 00 of 0 entries'
    const from = String((page - 1) * 10 + 1).padStart(2, '0')
    const to = String((page - 1) * 10 + items.length).padStart(2, '0')
    return `Showing ${from} to ${to} of ${total} entries`
  }, [items.length, page, total])

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-suzuki-navy">Incentive Management</h1>
        {canEdit && (
          <button
            type="button"
            onClick={() => navigate('/incentives/new')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 text-white font-bold px-4 py-2.5 hover:bg-sky-600"
          >
            <Plus size={16} /> Create
          </button>
        )}
      </div>

      <section className="bg-white rounded-2xl border border-suzuki-line shadow-card overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <h2 className="font-bold text-suzuki-navy">Recent Incentive</h2>
          <div className="flex items-center gap-2 bg-suzuki-mist rounded-lg px-3 py-2 border border-suzuki-line">
            <Search size={14} className="text-suzuki-mute" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search"
              className="bg-transparent text-sm outline-none w-40"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-suzuki-mist/80 text-left text-xs font-bold uppercase tracking-wide text-suzuki-mute">
                <th className="px-5 py-3">Incentive Name</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Start Date</th>
                <th className="px-4 py-3">End Date</th>
                <th className="px-4 py-3">Incentive Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {listQuery.isLoading && (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-suzuki-mute">Loading…</td></tr>
              )}
              {!listQuery.isLoading && items.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-suzuki-mute">No incentives yet.</td></tr>
              )}
              {items.map((row) => (
                <tr key={row.id} className="border-t border-suzuki-line/80 hover:bg-suzuki-mist/40">
                  <td className="px-5 py-3.5 font-semibold text-suzuki-ink">{row.name}</td>
                  <td className="px-4 py-3.5 text-suzuki-mute max-w-[220px] truncate">{row.description || '—'}</td>
                  <td className="px-4 py-3.5 text-suzuki-mute">{formatDate(row.startDateUtc)}</td>
                  <td className="px-4 py-3.5 text-suzuki-mute">{formatDate(row.endDateUtc)}</td>
                  <td className="px-4 py-3.5 text-suzuki-mute">{row.criteriaType}</td>
                  <td className="px-4 py-3.5">
                    <span
                      className={clsx(
                        'inline-flex rounded-full px-3 py-1 text-[11px] font-bold',
                        row.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      )}
                    >
                      {row.isActive ? 'Active' : 'In Active'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <Link to={`/incentives/${row.id}`} className="p-1.5 rounded-lg text-suzuki-blue hover:bg-suzuki-ice" title="View">
                        <Eye size={16} />
                      </Link>
                      {canEdit && (
                        <>
                          <Link to={`/incentives/${row.id}/edit`} className="p-1.5 rounded-lg text-suzuki-blue hover:bg-suzuki-ice" title="Edit">
                            <Pencil size={16} />
                          </Link>
                          <button
                            type="button"
                            className="p-1.5 rounded-lg text-suzuki-navy hover:bg-rose-50 hover:text-suzuki-red"
                            title="Delete"
                            onClick={() => {
                              if (confirm(`Delete "${row.name}"?`)) deleteMutation.mutate(row.id)
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pager showing={showing} page={page} totalPages={totalPages} setPage={setPage} />
      </section>
    </div>
  )
}

function AchievementBar({ percent }: { percent: number }) {
  const ok = percent >= 100
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <span className={clsx('text-xs font-bold', ok ? 'text-emerald-600' : 'text-orange-600')}>
        {percent.toFixed(1)}%
      </span>
      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={clsx('h-full rounded-full', ok ? 'bg-emerald-500' : 'bg-orange-400')}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  )
}

function KpiCard({
  icon, value, label, tone
}: {
  icon: ReactNode
  value: string
  label: string
  tone: 'ice' | 'white'
}) {
  return (
    <div
      className={clsx(
        'rounded-2xl border border-suzuki-line shadow-card p-4 flex items-start gap-3',
        tone === 'ice' ? 'bg-suzuki-ice' : 'bg-white'
      )}
    >
      <div className="h-9 w-9 rounded-xl bg-white/80 text-suzuki-navy flex items-center justify-center shrink-0 border border-suzuki-line/60">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-extrabold text-suzuki-navy">{value}</div>
        <div className="text-xs font-semibold text-suzuki-mute">{label}</div>
      </div>
    </div>
  )
}

function Pager({
  showing, page, totalPages, setPage
}: {
  showing: string
  page: number
  totalPages: number
  setPage: (n: number) => void
}) {
  return (
    <div className="px-5 py-4 border-t border-suzuki-line flex flex-col sm:flex-row gap-3 items-center justify-between text-xs text-suzuki-mute">
      <span>{showing}</span>
      <div className="flex items-center gap-1">
        <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-2 py-1 rounded-lg border border-suzuki-line disabled:opacity-40">
          Previous
        </button>
        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setPage(n)}
            className={clsx(
              'h-7 min-w-7 px-2 rounded-lg text-xs font-bold',
              page === n ? 'bg-suzuki-navy text-white' : 'border border-suzuki-line'
            )}
          >
            {n}
          </button>
        ))}
        <button type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="px-2 py-1 rounded-lg border border-suzuki-line disabled:opacity-40">
          Next
        </button>
      </div>
    </div>
  )
}
