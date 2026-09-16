import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, UserRound } from 'lucide-react'
import clsx from 'clsx'
import { api } from '@/api/axiosClient'
import { AxiosError } from 'axios'

interface RegionRow {
  id: string
  name: string
  code: string
}

interface RegionalHeadRow {
  userId: string
  email: string
  userName: string
  isActive: boolean
  regions: RegionRow[]
}

type Mode = 'list' | 'create' | 'edit'

function apiErrorMessage(err: unknown, fallback: string) {
  const ax = err as AxiosError<{ detail?: string; title?: string; message?: string }>
  return ax.response?.data?.detail
    ?? ax.response?.data?.title
    ?? ax.response?.data?.message
    ?? (err as Error)?.message
    ?? fallback
}

export default function RegionalHeadsPanel({
  onMessage,
  onError
}: {
  onMessage: (msg: string | null) => void
  onError: (msg: string | null) => void
}) {
  const qc = useQueryClient()
  const [mode, setMode] = useState<Mode>('list')
  const [editing, setEditing] = useState<RegionalHeadRow | null>(null)

  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [selectedRegionIds, setSelectedRegionIds] = useState<string[]>([])

  const headsQuery = useQuery({
    queryKey: ['regional-heads'],
    queryFn: async () => (await api.get<RegionalHeadRow[]>('/regional-heads')).data
  })

  const regionsQuery = useQuery({
    queryKey: ['regions'],
    queryFn: async () => (await api.get<RegionRow[]>('/regions')).data
  })

  const regions = regionsQuery.data ?? []
  const heads = headsQuery.data ?? []

  const resetForm = () => {
    setEmail('')
    setDisplayName('')
    setPassword('')
    setNewPassword('')
    setIsActive(true)
    setSelectedRegionIds([])
    setEditing(null)
  }

  const openCreate = () => {
    resetForm()
    setMode('create')
    onMessage(null)
    onError(null)
  }

  const openEdit = (row: RegionalHeadRow) => {
    setEditing(row)
    setEmail(row.email)
    setDisplayName(row.userName)
    setPassword('')
    setNewPassword('')
    setIsActive(row.isActive)
    setSelectedRegionIds(row.regions.map((r) => r.id))
    setMode('edit')
    onMessage(null)
    onError(null)
  }

  const backToList = () => {
    resetForm()
    setMode('list')
    onMessage(null)
    onError(null)
  }

  const toggleRegion = (id: string) => {
    setSelectedRegionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const createMut = useMutation({
    mutationFn: async () => {
      await api.post('/regional-heads', {
        email: email.trim(),
        password,
        displayName: displayName.trim() || null,
        regionIds: selectedRegionIds
      })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['regional-heads'] })
      onMessage('Regional head created.')
      onError(null)
      backToList()
    },
    onError: (err) => onError(apiErrorMessage(err, 'Could not create regional head.'))
  })

  const updateMut = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error('Nothing to update')
      await api.put(`/regional-heads/${editing.userId}`, {
        regionIds: selectedRegionIds,
        isActive,
        newPassword: newPassword.trim() || null
      })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['regional-heads'] })
      onMessage('Regional head updated.')
      onError(null)
      backToList()
    },
    onError: (err) => onError(apiErrorMessage(err, 'Could not update regional head.'))
  })

  useEffect(() => {
    if (headsQuery.isError) onError('Could not load regional heads.')
  }, [headsQuery.isError])

  if (mode === 'create' || mode === 'edit') {
    const saving = createMut.isPending || updateMut.isPending
    return (
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold text-suzuki-navy">
            {mode === 'create' ? 'Add Regional Head' : 'Edit Regional Head'}
          </h2>
          <button
            type="button"
            onClick={backToList}
            className="rounded-xl bg-sky-100 text-suzuki-navy font-bold px-4 py-2 text-sm"
          >
            Back
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5 sm:col-span-2">
            <span className="text-sm font-bold text-suzuki-navy">Email</span>
            <input
              type="email"
              value={email}
              disabled={mode === 'edit'}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-sky-100 bg-sky-50 px-3.5 py-2.5 text-sm font-semibold text-suzuki-navy outline-none focus:border-suzuki-blue disabled:opacity-70"
              placeholder="name@example.com"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-bold text-suzuki-navy">Display name</span>
            <input
              type="text"
              value={displayName}
              disabled={mode === 'edit'}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-xl border border-sky-100 bg-sky-50 px-3.5 py-2.5 text-sm font-semibold text-suzuki-navy outline-none focus:border-suzuki-blue disabled:opacity-70"
              placeholder="Optional"
            />
          </label>

          {mode === 'create' ? (
            <label className="block space-y-1.5">
              <span className="text-sm font-bold text-suzuki-navy">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-sky-100 bg-sky-50 px-3.5 py-2.5 text-sm font-semibold text-suzuki-navy outline-none focus:border-suzuki-blue"
                placeholder="Min 6 characters"
              />
            </label>
          ) : (
            <label className="block space-y-1.5">
              <span className="text-sm font-bold text-suzuki-navy">New password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-xl border border-sky-100 bg-sky-50 px-3.5 py-2.5 text-sm font-semibold text-suzuki-navy outline-none focus:border-suzuki-blue"
                placeholder="Leave blank to keep"
              />
            </label>
          )}
        </div>

        {mode === 'edit' && (
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-suzuki-line text-suzuki-blue"
            />
            <span className="text-sm font-bold text-suzuki-navy">Active (can sign in)</span>
          </label>
        )}

        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-extrabold text-suzuki-navy">Assigned regions</h3>
            <p className="text-xs text-suzuki-slate mt-0.5">
              Select one or more regions this head can view.
            </p>
          </div>

          {regionsQuery.isLoading ? (
            <p className="text-sm text-suzuki-slate">Loading regions…</p>
          ) : regions.length === 0 ? (
            <p className="text-sm text-suzuki-slate">No regions found.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {regions.map((r) => {
                const checked = selectedRegionIds.includes(r.id)
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleRegion(r.id)}
                    className={clsx(
                      'flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition',
                      checked
                        ? 'border-suzuki-blue bg-suzuki-ice'
                        : 'border-suzuki-line bg-white hover:bg-suzuki-mist'
                    )}
                  >
                    <span
                      className={clsx(
                        'mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center text-[10px] font-bold',
                        checked
                          ? 'border-suzuki-blue bg-suzuki-blue text-white'
                          : 'border-suzuki-line bg-white text-transparent'
                      )}
                    >
                      ✓
                    </span>
                    <span>
                      <span className="block text-sm font-bold text-suzuki-navy">{r.name}</span>
                      <span className="block text-xs text-suzuki-slate">{r.code}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={backToList}
            className="rounded-xl bg-sky-100 text-suzuki-navy font-bold px-6 py-2.5"
          >
            CANCEL
          </button>
          <button
            type="button"
            disabled={
              saving
              || selectedRegionIds.length === 0
              || (mode === 'create' && (!email.trim() || password.length < 6))
            }
            onClick={() => (mode === 'create' ? createMut.mutate() : updateMut.mutate())}
            className="rounded-xl bg-suzuki-red text-white font-bold px-6 py-2.5 disabled:opacity-50"
          >
            {saving ? 'SAVING…' : 'SAVE'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-suzuki-navy">Regional Heads</h2>
          <p className="text-sm text-suzuki-slate mt-1">
            View-only logins for assigned regions. Manage who can see which area.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-suzuki-red text-white font-bold px-4 py-2.5 text-sm"
        >
          <Plus size={16} /> Add Regional Head
        </button>
      </div>

      <div className="rounded-2xl border border-suzuki-line bg-suzuki-mist/40 p-4 space-y-2">
        <h3 className="text-sm font-extrabold text-suzuki-navy">Available regions</h3>
        {regionsQuery.isLoading ? (
          <p className="text-sm text-suzuki-slate">Loading…</p>
        ) : regions.length === 0 ? (
          <p className="text-sm text-suzuki-slate">No regions in the system yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {regions.map((r) => (
              <span
                key={r.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-suzuki-line bg-white px-2.5 py-1 text-xs font-bold text-suzuki-navy"
              >
                {r.name}
                <span className="font-semibold text-suzuki-slate">{r.code}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {headsQuery.isLoading ? (
        <p className="text-sm text-suzuki-slate">Loading regional heads…</p>
      ) : heads.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-suzuki-line bg-white px-5 py-10 text-center">
          <UserRound className="mx-auto text-suzuki-slate mb-2" size={28} />
          <p className="text-sm font-bold text-suzuki-navy">No regional heads yet</p>
          <p className="text-sm text-suzuki-slate mt-1">Add one and assign regions.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-suzuki-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-suzuki-mist/60 text-suzuki-navy">
              <tr>
                <th className="px-4 py-3 font-extrabold">Name / Email</th>
                <th className="px-4 py-3 font-extrabold">Regions</th>
                <th className="px-4 py-3 font-extrabold">Status</th>
                <th className="px-4 py-3 font-extrabold w-20" />
              </tr>
            </thead>
            <tbody>
              {heads.map((h) => (
                <tr key={h.userId} className="border-t border-suzuki-line">
                  <td className="px-4 py-3">
                    <div className="font-bold text-suzuki-navy">{h.userName}</div>
                    <div className="text-xs text-suzuki-slate">{h.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    {h.regions.length === 0 ? (
                      <span className="text-suzuki-slate">None</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {h.regions.map((r) => (
                          <span
                            key={r.id}
                            className="rounded-md bg-suzuki-ice px-2 py-0.5 text-xs font-semibold text-suzuki-navy"
                          >
                            {r.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={clsx(
                        'inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold',
                        h.isActive
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-rose-50 text-rose-700'
                      )}
                    >
                      {h.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(h)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-suzuki-blue hover:bg-suzuki-ice font-bold text-xs"
                      title="Edit"
                    >
                      <Pencil size={14} /> Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
