import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { api } from '@/api/axiosClient'
import { useAuth } from '@/context/AuthContext'
import { formatDate, type IncentiveListRow, type Paged } from './incentiveTypes'

export default function IncentivesPage() {
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
      </section>
    </div>
  )
}
