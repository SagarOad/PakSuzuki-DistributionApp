import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle2, Pencil, Trash2 } from 'lucide-react'
import { api } from '@/api/axiosClient'
import {
  INCENTIVE_CRITERIA,
  formatPkr,
  parseIncentivePercent,
  parseSlabRange,
  slabLabel,
  type IncentiveCriteria,
  type IncentiveDetail,
  type IncentiveSlab,
  type Paged
} from './incentiveTypes'

interface DistRow {
  id: string
  name: string
  regionName: string
}

interface RetRow {
  id: string
  name: string
  regionName: string
  distributorApprovalStatus: string
  superAdminApprovalStatus: string
  isActive: boolean
}

type Step = 1 | 2

const fieldClass =
  'w-full rounded-xl border border-suzuki-line bg-slate-50 px-3.5 py-2.5 text-sm text-suzuki-ink outline-none placeholder:text-suzuki-mute/70 focus:border-suzuki-blue focus:bg-white'

export default function IncentiveFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id && id !== 'new')
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>(1)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [criteriaType, setCriteriaType] = useState<IncentiveCriteria>('Amount')
  const [slabs, setSlabs] = useState<IncentiveSlab[]>([])
  const [slabRange, setSlabRange] = useState('')
  const [slabPct, setSlabPct] = useState('')
  const [editingSlabIdx, setEditingSlabIdx] = useState<number | null>(null)
  const [slabError, setSlabError] = useState<string | null>(null)

  const [selectedDist, setSelectedDist] = useState<Record<string, boolean>>({})
  const [selectedRet, setSelectedRet] = useState<Record<string, { selected: boolean; target: string }>>({})
  const [distTargets, setDistTargets] = useState<Record<string, string>>({})
  const [distSearch, setDistSearch] = useState('')
  const [retSearch, setRetSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{
    id: string
    name: string
    criteriaType: string
    totalTarget: number
    distributorCount: number
    retailerCount: number
  } | null>(null)

  const detailQuery = useQuery({
    queryKey: ['incentive', id],
    enabled: isEdit,
    queryFn: async () => (await api.get<IncentiveDetail>(`/incentives/${id}`)).data
  })

  useEffect(() => {
    const d = detailQuery.data
    if (!d) return
    setName(d.name)
    setDescription(d.description ?? '')
    setCriteriaType((INCENTIVE_CRITERIA.includes(d.criteriaType as IncentiveCriteria)
      ? d.criteriaType
      : 'Amount') as IncentiveCriteria)
    setStartDate(d.startDateUtc.slice(0, 10))
    setEndDate(d.endDateUtc.slice(0, 10))
    setSlabs(d.slabs)
    const distSel: Record<string, boolean> = {}
    const distT: Record<string, string> = {}
    const retSel: Record<string, { selected: boolean; target: string }> = {}
    for (const p of d.participants) {
      if (p.distributorId) {
        distSel[p.distributorId] = true
        distT[p.distributorId] = String(p.targetValue)
      }
      if (p.retailerId) {
        retSel[p.retailerId] = { selected: true, target: String(p.targetValue) }
      }
    }
    setSelectedDist(distSel)
    setDistTargets(distT)
    setSelectedRet(retSel)
  }, [detailQuery.data])

  const distQuery = useQuery({
    queryKey: ['incentive-pick-distributors'],
    queryFn: async () => (await api.get<DistRow[]>('/distributors/approved')).data
  })

  const retQuery = useQuery({
    queryKey: ['incentive-pick-retailers'],
    queryFn: async () =>
      (await api.get<Paged<RetRow>>('/retailers', { params: { pageSize: 200 } })).data
  })

  const distributors = useMemo(() => {
    const q = distSearch.trim().toLowerCase()
    return (distQuery.data ?? []).filter(
      (d) => !q || d.name.toLowerCase().includes(q) || d.regionName.toLowerCase().includes(q)
    )
  }, [distQuery.data, distSearch])

  const retailers = useMemo(() => {
    const q = retSearch.trim().toLowerCase()
    return (retQuery.data?.items ?? [])
      .filter((r) => r.isActive && r.distributorApprovalStatus === 'Approved' && r.superAdminApprovalStatus === 'Approved')
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.regionName.toLowerCase().includes(q))
  }, [retQuery.data, retSearch])

  const addOrUpdateSlab = () => {
    const range = parseSlabRange(slabRange)
    const pct = parseIncentivePercent(slabPct)
    if (!range) {
      setSlabError('Enter achievement range like 80% - 90%')
      return
    }
    if (pct == null) {
      setSlabError('Enter a valid incentive %')
      return
    }
    setSlabError(null)
    setError(null)
    const next: IncentiveSlab = {
      minPercent: range.min,
      maxPercent: range.max,
      incentivePercent: pct
    }
    if (editingSlabIdx != null) {
      setSlabs((prev) => prev.map((s, i) => (i === editingSlabIdx ? next : s)))
      setEditingSlabIdx(null)
    } else {
      setSlabs((prev) => [...prev, next].sort((a, b) => a.minPercent - b.minPercent))
    }
    setSlabRange('')
    setSlabPct('')
  }

  const buildParticipants = () => {
    const list: { distributorId?: string; retailerId?: string; targetValue: number }[] = []
    for (const [distId, on] of Object.entries(selectedDist)) {
      if (!on) continue
      const target = Number(distTargets[distId] || 0)
      if (target <= 0) throw new Error('Set a target (PKR) for each selected distributor.')
      list.push({ distributorId: distId, targetValue: target })
    }
    for (const [retId, row] of Object.entries(selectedRet)) {
      if (!row.selected) continue
      const target = Number(row.target || 0)
      if (target <= 0) throw new Error('Set a target (PKR) for each selected retailer.')
      list.push({ retailerId: retId, targetValue: target })
    }
    if (list.length === 0) throw new Error('Select at least one distributor or retailer.')
    return list
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const participants = buildParticipants()
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        criteriaType,
        startDateUtc: new Date(startDate).toISOString(),
        endDateUtc: new Date(endDate).toISOString(),
        isActive: true,
        slabs,
        participants
      }
      if (isEdit) {
        await api.put(`/incentives/${id}`, body)
        return id!
      }
      const { data } = await api.post<{ id: string }>('/incentives', body)
      return data.id
    },
    onSuccess: (savedId) => {
      const participants = (() => {
        try { return buildParticipants() } catch { return [] }
      })()
      setSuccess({
        id: savedId,
        name: name.trim(),
        criteriaType,
        totalTarget: participants.reduce((s, p) => s + p.targetValue, 0),
        distributorCount: participants.filter((p) => p.distributorId).length,
        retailerCount: participants.filter((p) => p.retailerId).length
      })
    },
    onError: (e: unknown) => {
      setError((e as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
        ?? (e as Error)?.message
        ?? 'Could not save incentive.')
    }
  })

  const goNext = () => {
    if (!name.trim()) { setError('Incentive name is required.'); return }
    if (!startDate || !endDate) { setError('Select start and end dates.'); return }
    if (new Date(endDate) <= new Date(startDate)) { setError('End date must be after start date.'); return }
    if (slabs.length === 0) { setError('Add at least one achievement slab.'); return }
    setError(null)
    setStep(2)
  }

  const onCreate = () => {
    try {
      buildParticipants()
      setError(null)
      saveMutation.mutate()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (isEdit && detailQuery.isLoading) {
    return <p className="text-sm text-suzuki-mute py-16 text-center">Loading…</p>
  }

  return (
    <div className="space-y-5 pb-8">
      <h1 className="text-2xl font-extrabold text-suzuki-navy">
        {isEdit ? 'Edit Incentive Program' : 'Create Incentive Program'}
      </h1>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      {step === 1 && (
        <section className="bg-white rounded-2xl border border-suzuki-line shadow-card p-6 md:p-8 space-y-5">
          <Field label="Incentive Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} placeholder="May Sale Incentive" />
          </Field>
          <Field label="Description">
            <input value={description} onChange={(e) => setDescription(e.target.value)} className={fieldClass} placeholder="Type Here" />
          </Field>
          <Field label="Select Validation">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={fieldClass} aria-label="Select Date" />
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={fieldClass} aria-label="End Date" />
            </div>
          </Field>
          <Field label="Incentive Type">
            <select value={criteriaType} onChange={(e) => setCriteriaType(e.target.value as IncentiveCriteria)} className={fieldClass}>
              {INCENTIVE_CRITERIA.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>

          <div className="space-y-3 pt-1">
            <div className="text-sm font-bold text-suzuki-navy">Add Achievement Slabs</div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_220px_auto] gap-3 items-stretch">
              <input
                value={slabRange}
                onChange={(e) => { setSlabRange(e.target.value); setSlabError(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOrUpdateSlab() } }}
                className={fieldClass}
                placeholder="Type Here"
              />
              <input
                value={slabPct}
                onChange={(e) => { setSlabPct(e.target.value); setSlabError(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOrUpdateSlab() } }}
                className={fieldClass}
                placeholder="Enter Incentive %"
              />
              <button
                type="button"
                onClick={addOrUpdateSlab}
                className="rounded-xl bg-sky-100 text-suzuki-navy font-bold px-8 py-2.5 hover:bg-sky-200 whitespace-nowrap"
              >
                {editingSlabIdx != null ? 'Update' : 'Add'}
              </button>
            </div>
            {slabError && <p className="text-xs font-semibold text-rose-600">{slabError}</p>}

            <div className="overflow-x-auto rounded-xl border border-suzuki-line">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs font-bold text-suzuki-mute">
                    <th className="px-4 py-3">Achievement</th>
                    <th className="px-4 py-3">Incentive %</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {slabs.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-suzuki-mute">
                        No slabs yet. Example: Type <span className="font-semibold text-suzuki-ink">80% - 90%</span> and <span className="font-semibold text-suzuki-ink">2</span>, then Add.
                      </td>
                    </tr>
                  )}
                  {slabs.map((s, idx) => (
                    <tr key={`${s.minPercent}-${s.maxPercent}-${s.incentivePercent}-${idx}`} className="border-t border-suzuki-line">
                      <td className="px-4 py-3 font-semibold text-suzuki-ink">{slabLabel(s)}</td>
                      <td className="px-4 py-3 text-suzuki-mute">{s.incentivePercent}%</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            className="p-1.5 text-suzuki-blue hover:bg-suzuki-ice rounded-lg"
                            title="Edit"
                            onClick={() => {
                              setEditingSlabIdx(idx)
                              setSlabRange(slabLabel(s))
                              setSlabPct(String(s.incentivePercent))
                              setSlabError(null)
                            }}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            className="p-1.5 text-suzuki-navy hover:bg-rose-50 hover:text-suzuki-red rounded-lg"
                            title="Delete"
                            onClick={() => {
                              setSlabs((prev) => prev.filter((_, i) => i !== idx))
                              if (editingSlabIdx === idx) {
                                setEditingSlabIdx(null)
                                setSlabRange('')
                                setSlabPct('')
                              }
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => navigate('/incentives')} className="rounded-xl bg-sky-100 text-suzuki-navy font-bold px-8 py-2.5">
              CANCEL
            </button>
            <button type="button" onClick={goNext} className="rounded-xl bg-suzuki-red text-white font-bold px-8 py-2.5">
              NEXT
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <PickerCard title="Select Distributor(s)" search={distSearch} onSearch={setDistSearch} placeholder="Search Distributor">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-suzuki-mist/80 text-left text-xs font-bold text-suzuki-mute">
                    <th className="px-3 py-2 w-10" />
                    <th className="px-3 py-2">Distributor Name</th>
                    <th className="px-3 py-2">Region</th>
                    <th className="px-3 py-2">Targets (PKR)</th>
                  </tr>
                </thead>
                <tbody>
                  {distributors.map((d) => (
                    <tr key={d.id} className="border-t border-suzuki-line/80">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={!!selectedDist[d.id]}
                          onChange={(e) => setSelectedDist((prev) => ({ ...prev, [d.id]: e.target.checked }))}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-suzuki-ink">{d.name}</td>
                      <td className="px-3 py-2 text-suzuki-mute">{d.regionName}</td>
                      <td className="px-3 py-2">
                        <input
                          disabled={!selectedDist[d.id]}
                          value={distTargets[d.id] ?? ''}
                          onChange={(e) => setDistTargets((prev) => ({ ...prev, [d.id]: e.target.value }))}
                          placeholder="PKR 000"
                          className={`${fieldClass} py-1.5 text-xs max-w-[8rem]`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PickerCard>

            <PickerCard title="Select Retailor(s)" search={retSearch} onSearch={setRetSearch} placeholder="Search Retailor">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-suzuki-mist/80 text-left text-xs font-bold text-suzuki-mute">
                    <th className="px-3 py-2 w-10" />
                    <th className="px-3 py-2">Retailor Name</th>
                    <th className="px-3 py-2">Region</th>
                    <th className="px-3 py-2">Targets (PKR)</th>
                  </tr>
                </thead>
                <tbody>
                  {retailers.map((r) => {
                    const row = selectedRet[r.id] ?? { selected: false, target: '' }
                    return (
                      <tr key={r.id} className="border-t border-suzuki-line/80">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={(e) =>
                              setSelectedRet((prev) => ({
                                ...prev,
                                [r.id]: { selected: e.target.checked, target: prev[r.id]?.target ?? '' }
                              }))
                            }
                          />
                        </td>
                        <td className="px-3 py-2 font-medium text-suzuki-ink">{r.name}</td>
                        <td className="px-3 py-2 text-suzuki-mute">{r.regionName}</td>
                        <td className="px-3 py-2">
                          <input
                            disabled={!row.selected}
                            value={row.target}
                            onChange={(e) =>
                              setSelectedRet((prev) => ({
                                ...prev,
                                [r.id]: { selected: true, target: e.target.value }
                              }))
                            }
                            placeholder="PKR 000"
                            className={`${fieldClass} py-1.5 text-xs max-w-[8rem]`}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </PickerCard>
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setStep(1)} className="rounded-xl bg-sky-100 text-suzuki-navy font-bold px-8 py-2.5">
              BACK
            </button>
            <button
              type="button"
              disabled={saveMutation.isPending}
              onClick={onCreate}
              className="rounded-xl bg-suzuki-red text-white font-bold px-8 py-2.5 disabled:opacity-50"
            >
              {isEdit ? 'SAVE' : 'CREATE'}
            </button>
          </div>
        </section>
      )}

      {success && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-card w-full max-w-md p-8 text-center">
            <h3 className="text-xl font-extrabold text-suzuki-ink mb-4">Incentive Activate</h3>
            <div className="mx-auto h-16 w-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
              <CheckCircle2 size={36} />
            </div>
            <div className="text-lg font-extrabold text-suzuki-navy">{success.name}</div>
            <p className="text-sm text-suzuki-mute mt-2">
              Incentive program is now active for selected Distributor and retailers
            </p>
            <div className="mt-4 text-sm text-suzuki-mute">
              Type: <span className="font-semibold text-suzuki-ink">{success.criteriaType}</span>
            </div>
            <div className="mt-1 text-sm text-suzuki-mute">
              Total Target:{' '}
              <span className="text-xl font-extrabold text-suzuki-navy">{formatPkr(success.totalTarget)}</span>
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <span className="rounded-full bg-sky-100 text-suzuki-navy text-xs font-bold px-3 py-1.5">
                Total Distributors : {String(success.distributorCount).padStart(2, '0')}
              </span>
              <span className="rounded-full bg-slate-100 text-suzuki-mute text-xs font-bold px-3 py-1.5">
                Total Retailors : {String(success.retailerCount).padStart(2, '0')}
              </span>
            </div>
            <button
              type="button"
              onClick={() => navigate(`/incentives/${success.id}`)}
              className="mt-6 w-full rounded-xl bg-suzuki-red text-white font-extrabold py-3"
            >
              GO TO HOME
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="block space-y-1.5">
      <div className="text-sm font-bold text-suzuki-navy">{label}</div>
      {children}
    </div>
  )
}

function PickerCard({
  title,
  search,
  onSearch,
  placeholder,
  children
}: {
  title: string
  search: string
  onSearch: (v: string) => void
  placeholder: string
  children: ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-suzuki-line shadow-card overflow-hidden">
      <div className="px-4 pt-4 pb-3 flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
        <h2 className="font-bold text-suzuki-navy">{title}</h2>
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
          className="rounded-lg border border-suzuki-line bg-suzuki-mist px-3 py-2 text-sm outline-none w-full sm:w-48"
        />
      </div>
      <div className="max-h-[420px] overflow-auto border-t border-suzuki-line">{children}</div>
    </div>
  )
}
