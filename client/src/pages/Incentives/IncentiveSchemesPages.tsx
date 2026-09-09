import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/axiosClient'
import {
  dateInput,
  money,
  type ProductGroupListRow,
  type SchemeDetail,
  type SchemeEvaluation,
  type SchemeListRow,
  type SchemeType
} from './schemeTypes'

interface Paged<T> { items: T[]; totalCount: number }

export default function IncentiveSchemesPage() {
  const [search, setSearch] = useState('')
  const list = useQuery({
    queryKey: ['incentive-schemes', search],
    queryFn: async () =>
      (await api.get<Paged<SchemeListRow>>('/incentive-schemes', {
        params: { search: search || undefined, pageSize: 100 }
      })).data
  })

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-suzuki-navy">Incentive schemes</h1>
          <p className="text-sm text-suzuki-mute mt-1">
            Slab / percent-of-sales / tracking schemes on product groups. Periods and rates are admin-configured.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/product-groups" className="rounded-lg bg-suzuki-ice px-4 py-2 text-sm font-bold text-suzuki-navy">
            Product groups
          </Link>
          <Link to="/incentive-schemes/new" className="rounded-lg bg-suzuki-red px-4 py-2 text-sm font-bold text-white">
            + New scheme
          </Link>
        </div>
      </div>

      <SignatoriesPanel />

      <input className="field max-w-sm" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />

      <div className="overflow-x-auto rounded-2xl border border-suzuki-line bg-white shadow-card">
        <table className="w-full text-sm text-left">
          <thead className="bg-suzuki-mist text-suzuki-mute text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Product group</th>
              <th className="px-4 py-3">Distributors</th>
              <th className="px-4 py-3">Current period</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {(list.data?.items ?? []).map((s) => (
              <tr key={s.id} className="border-t border-suzuki-line">
                <td className="px-4 py-3 font-semibold text-suzuki-navy">{s.name}</td>
                <td className="px-4 py-3">{s.schemeType}</td>
                <td className="px-4 py-3">{s.productGroupName}</td>
                <td className="px-4 py-3">{s.participantCount ?? '—'}</td>
                <td className="px-4 py-3 text-xs">
                  {dateInput(s.currentPeriodStartUtc)} → {dateInput(s.currentPeriodEndUtc)}
                </td>
                <td className="px-4 py-3">{s.isActive ? 'Yes' : 'No'}</td>
                <td className="px-4 py-3 space-x-3">
                  <Link to={`/incentive-schemes/${s.id}`} className="font-bold text-suzuki-blue">View</Link>
                  <Link to={`/incentive-schemes/${s.id}/edit`} className="font-bold text-suzuki-blue">Edit</Link>
                </td>
              </tr>
            ))}
            {!list.isLoading && (list.data?.items.length ?? 0) === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-suzuki-mute">No schemes yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SignatoriesPanel() {
  const [preparedBy, setPreparedBy] = useState('')
  const [checkedBy, setCheckedBy] = useState('')
  const [approvedBy, setApprovedBy] = useState('')
  const [saved, setSaved] = useState(false)

  const q = useQuery({
    queryKey: ['incentive-signatories'],
    queryFn: async () =>
      (await api.get<{ preparedBy?: string | null; checkedBy?: string | null; approvedBy?: string | null }>(
        '/incentive-schemes/signatories'
      )).data
  })

  useEffect(() => {
    if (!q.data) return
    setPreparedBy(q.data.preparedBy ?? '')
    setCheckedBy(q.data.checkedBy ?? '')
    setApprovedBy(q.data.approvedBy ?? '')
  }, [q.data])

  const save = useMutation({
    mutationFn: async () => {
      await api.put('/incentive-schemes/signatories', { preparedBy, checkedBy, approvedBy })
    },
    onSuccess: () => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  })

  return (
    <section className="bg-white rounded-2xl border border-suzuki-line shadow-card p-4 sm:p-5">
      <h2 className="font-extrabold text-suzuki-navy mb-1">PDF signatories</h2>
      <p className="text-xs text-suzuki-mute mb-3">Names printed on distributor incentive reports.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label>
          <span className="text-[11px] font-bold uppercase text-suzuki-mute">Prepared by</span>
          <input className="field mt-1" value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} />
        </label>
        <label>
          <span className="text-[11px] font-bold uppercase text-suzuki-mute">Checked by</span>
          <input className="field mt-1" value={checkedBy} onChange={(e) => setCheckedBy(e.target.value)} />
        </label>
        <label>
          <span className="text-[11px] font-bold uppercase text-suzuki-mute">Approved by</span>
          <input className="field mt-1" value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={save.isPending}
          onClick={() => save.mutate()}
          className="rounded-lg bg-suzuki-navy text-white px-4 py-2 text-sm font-bold disabled:opacity-50"
        >
          Save names
        </button>
        {saved && <span className="text-sm text-emerald-600 font-semibold">Saved</span>}
      </div>
    </section>
  )
}

type SlabDraft = { targetLiters: string; ratePerLiter: string; fixedBonusPkr: string; sortOrder: number; previewIncentive?: number; previewCartons?: number | null }

export function IncentiveSchemeFormPage() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [productGroupId, setProductGroupId] = useState('')
  const [schemeType, setSchemeType] = useState<SchemeType>('Slab')
  const [currentStart, setCurrentStart] = useState('')
  const [currentEnd, setCurrentEnd] = useState('')
  const [percentRate, setPercentRate] = useState('12')
  const [isActive, setIsActive] = useState(true)
  const [selectedDistributorIds, setSelectedDistributorIds] = useState<string[]>([])
  const [selectedDistributorLabels, setSelectedDistributorLabels] = useState<Record<string, string>>({})
  const [distributorSearch, setDistributorSearch] = useState('')
  const [slabs, setSlabs] = useState<SlabDraft[]>([
    { targetLiters: '', ratePerLiter: '', fixedBonusPkr: '80000', sortOrder: 0 }
  ])
  const [error, setError] = useState<string | null>(null)

  const groups = useQuery({
    queryKey: ['product-groups-all'],
    queryFn: async () =>
      (await api.get<Paged<ProductGroupListRow>>('/incentive-schemes/product-groups', { params: { pageSize: 200 } })).data
  })

  const distributors = useQuery({
    queryKey: ['distributors-for-scheme', distributorSearch],
    queryFn: async () =>
      (await api.get<Paged<{ id: string; name: string; distributorCode: string; businessName: string; regionName: string }>>(
        '/distributors',
        { params: { search: distributorSearch || undefined, pageSize: 200 } }
      )).data
  })

  const detail = useQuery({
    queryKey: ['incentive-scheme', id],
    enabled: !isNew,
    queryFn: async () => (await api.get<SchemeDetail>(`/incentive-schemes/${id}`)).data
  })

  useEffect(() => {
    const d = detail.data
    if (!d) return
    setName(d.name)
    setDescription(d.description ?? '')
    setProductGroupId(d.productGroupId)
    setSchemeType(d.schemeType as SchemeType)
    setCurrentStart(dateInput(d.currentPeriodStartUtc))
    setCurrentEnd(dateInput(d.currentPeriodEndUtc))
    setPercentRate(d.percentOfSalesRate != null ? String(d.percentOfSalesRate) : '12')
    setIsActive(d.isActive)
    setSelectedDistributorIds((d.distributors ?? []).map((x) => x.distributorId))
    setSelectedDistributorLabels(
      Object.fromEntries((d.distributors ?? []).map((x) => [x.distributorId, `${x.distributorName} (${x.distributorCode})`]))
    )
    setSlabs(
      d.slabs.length
        ? d.slabs.map((s) => ({
            targetLiters: String(s.targetLiters),
            ratePerLiter: String(s.ratePerLiter),
            fixedBonusPkr: String(s.fixedBonusPkr),
            sortOrder: s.sortOrder,
            previewIncentive: s.computedIncentivePkr,
            previewCartons: s.computedCartons
          }))
        : [{ targetLiters: '', ratePerLiter: '', fixedBonusPkr: '80000', sortOrder: 0 }]
    )
  }, [detail.data])

  const slabKey = slabs.map((s) => `${s.targetLiters}|${s.ratePerLiter}|${s.fixedBonusPkr}`).join(';')
  const litersPerCarton = detail.data?.groupLitersPerCarton ?? 0

  // Live preview: total incentive locally; cartons when we know liters/carton (edit) or via preview API.
  useEffect(() => {
    if (schemeType !== 'Slab') return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        const next = await Promise.all(
          slabs.map(async (row) => {
            const target = Number(row.targetLiters)
            const rate = Number(row.ratePerLiter)
            const bonus = Number(row.fixedBonusPkr)
            if (!(target > 0) || Number.isNaN(rate) || Number.isNaN(bonus)) {
              return { ...row, previewIncentive: undefined, previewCartons: undefined }
            }
            const incentive = Math.round((target * rate + bonus) * 100) / 100
            if (litersPerCarton > 0) {
              return {
                ...row,
                previewIncentive: incentive,
                previewCartons: Math.round((target / litersPerCarton) * 10000) / 10000
              }
            }
            if (!productGroupId) {
              return { ...row, previewIncentive: incentive, previewCartons: undefined }
            }
            try {
              const { data } = await api.post<{ computedIncentivePkr: number; computedCartons?: number | null }>(
                '/incentive-schemes/preview-slab',
                {
                  targetLiters: target,
                  ratePerLiter: rate,
                  fixedBonusPkr: bonus,
                  productGroupId
                }
              )
              return {
                ...row,
                previewIncentive: data.computedIncentivePkr,
                previewCartons: data.computedCartons
              }
            } catch {
              return { ...row, previewIncentive: incentive, previewCartons: undefined }
            }
          })
        )
        if (!cancelled) setSlabs(next)
      })()
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [schemeType, productGroupId, slabKey, litersPerCarton])

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name,
        description: description || null,
        productGroupId,
        schemeType,
        currentPeriodStartUtc: currentStart,
        currentPeriodEndUtc: currentEnd,
        percentOfSalesRate: schemeType === 'PercentOfSales' ? Number(percentRate) || 0 : null,
        isActive,
        distributorIds: selectedDistributorIds,
        slabs:
          schemeType === 'Slab'
            ? slabs.map((s, i) => ({
                targetLiters: Number(s.targetLiters),
                ratePerLiter: Number(s.ratePerLiter),
                fixedBonusPkr: Number(s.fixedBonusPkr) || 0,
                sortOrder: i
              }))
            : []
      }
      if (isNew) {
        const { data } = await api.post<{ id: string }>('/incentive-schemes', body)
        return data.id
      }
      await api.put(`/incentive-schemes/${id}`, body)
      return id!
    },
    onSuccess: async (schemeId) => {
      await qc.invalidateQueries({ queryKey: ['incentive-schemes'] })
      navigate(`/incentive-schemes/${schemeId}`)
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string; title?: string } } })?.response?.data
      setError(msg?.detail || msg?.title || 'Could not save scheme.')
    }
  })

  const updateSlab = (index: number, patch: Partial<SlabDraft>) =>
    setSlabs((p) => p.map((s, i) => (i === index ? { ...s, ...patch } : s)))

  return (
    <div className="space-y-5 pb-10 max-w-5xl">
      <button type="button" onClick={() => navigate('/incentive-schemes')} className="text-sm font-semibold text-suzuki-blue">
        ← Back
      </button>
      <div>
        <h1 className="text-2xl font-extrabold text-suzuki-navy">{isNew ? 'New incentive scheme' : 'Edit scheme'}</h1>
        <p className="text-sm text-suzuki-mute mt-1">
          Configure period, product group, and slab targets. Total incentive and cartons calculate automatically.
        </p>
      </div>
      {error && <div className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{error}</div>}

      <section className="bg-white rounded-2xl border border-suzuki-line shadow-card p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="sm:col-span-2">
          <span className="text-xs font-bold uppercase text-suzuki-mute">Name</span>
          <input className="field mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Inc Dist 2W/4W Apr–Sep 2026" />
        </label>
        <label className="sm:col-span-2">
          <span className="text-xs font-bold uppercase text-suzuki-mute">Description</span>
          <textarea className="field mt-1" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label>
          <span className="text-xs font-bold uppercase text-suzuki-mute">Product group</span>
          <select className="field mt-1" value={productGroupId} onChange={(e) => setProductGroupId(e.target.value)}>
            <option value="">Select group</option>
            {(groups.data?.items ?? []).map((g) => (
              <option key={g.id} value={g.id}>{g.name} ({g.memberCount} SKUs)</option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-xs font-bold uppercase text-suzuki-mute">Scheme type</span>
          <select className="field mt-1" value={schemeType} onChange={(e) => setSchemeType(e.target.value as SchemeType)}>
            <option value="Slab">Slab</option>
            <option value="PercentOfSales">Percent of sales</option>
            <option value="TrackingOnly">Tracking only</option>
          </select>
        </label>
        <label>
          <span className="text-xs font-bold uppercase text-suzuki-mute">Period from</span>
          <input type="date" className="field mt-1" value={currentStart} onChange={(e) => setCurrentStart(e.target.value)} />
        </label>
        <label>
          <span className="text-xs font-bold uppercase text-suzuki-mute">Period to</span>
          <input type="date" className="field mt-1" value={currentEnd} onChange={(e) => setCurrentEnd(e.target.value)} />
        </label>
        {schemeType === 'PercentOfSales' && (
          <label>
            <span className="text-xs font-bold uppercase text-suzuki-mute">Percent of total sales (%)</span>
            <input
              className="field mt-1"
              value={percentRate}
              onChange={(e) => setPercentRate(e.target.value)}
              placeholder="12"
            />
            <span className="text-[11px] text-suzuki-mute">Example: 12 = payout is 12% of group purchase value in the period.</span>
          </label>
        )}
        <label className="inline-flex items-center gap-2 self-end pb-2">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
      </section>

      <section className="bg-white rounded-2xl border border-suzuki-line shadow-card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-extrabold text-suzuki-navy">Distributors</h2>
            <p className="text-xs text-suzuki-mute mt-0.5">
              Only selected distributors are part of this scheme ({selectedDistributorIds.length} selected).
            </p>
          </div>
          <div className="flex gap-2">
            <input
              className="field max-w-xs"
              placeholder="Search distributors…"
              value={distributorSearch}
              onChange={(e) => setDistributorSearch(e.target.value)}
            />
            <button
              type="button"
              className="rounded-lg bg-suzuki-ice px-3 py-2 text-xs font-bold text-suzuki-navy"
              onClick={() => {
                const rows = distributors.data?.items ?? []
                setSelectedDistributorIds((prev) => [...new Set([...prev, ...rows.map((d) => d.id)])])
                setSelectedDistributorLabels((prev) => {
                  const next = { ...prev }
                  for (const d of rows) next[d.id] = `${d.name} (${d.distributorCode})`
                  return next
                })
              }}
            >
              Select shown
            </button>
            <button
              type="button"
              className="rounded-lg bg-suzuki-ice px-3 py-2 text-xs font-bold text-suzuki-navy"
              onClick={() => {
                setSelectedDistributorIds([])
                setSelectedDistributorLabels({})
              }}
            >
              Clear
            </button>
          </div>
        </div>
        <div className="max-h-56 overflow-y-auto border border-suzuki-line rounded-xl divide-y divide-suzuki-line">
          {(distributors.data?.items ?? []).map((d) => (
            <label key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-suzuki-mist/50">
              <input
                type="checkbox"
                checked={selectedDistributorIds.includes(d.id)}
                onChange={() => {
                  const label = `${d.name} (${d.distributorCode})`
                  setSelectedDistributorIds((prev) => {
                    if (prev.includes(d.id)) {
                      setSelectedDistributorLabels((labels) => {
                        const next = { ...labels }
                        delete next[d.id]
                        return next
                      })
                      return prev.filter((x) => x !== d.id)
                    }
                    setSelectedDistributorLabels((labels) => ({ ...labels, [d.id]: label }))
                    return [...prev, d.id]
                  })
                }}
              />
              <span className="font-semibold text-suzuki-navy">{d.name}</span>
              <span className="text-xs text-suzuki-mute font-mono">{d.distributorCode}</span>
              <span className="text-xs text-suzuki-mute truncate">{d.regionName}</span>
            </label>
          ))}
          {!distributors.isLoading && (distributors.data?.items.length ?? 0) === 0 && (
            <p className="px-3 py-4 text-sm text-suzuki-mute text-center">No distributors found.</p>
          )}
        </div>
        {selectedDistributorIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedDistributorIds.map((did) => (
              <button
                key={did}
                type="button"
                className="rounded-full bg-suzuki-ice px-2.5 py-1 text-[11px] font-semibold text-suzuki-navy"
                onClick={() => {
                  setSelectedDistributorIds((prev) => prev.filter((x) => x !== did))
                  setSelectedDistributorLabels((labels) => {
                    const next = { ...labels }
                    delete next[did]
                    return next
                  })
                }}
              >
                {selectedDistributorLabels[did] ?? did.slice(0, 8)} ×
              </button>
            ))}
          </div>
        )}
      </section>

      {schemeType === 'Slab' && (
        <section className="bg-white rounded-2xl border border-suzuki-line shadow-card p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-extrabold text-suzuki-navy">Slab targets</h2>
              <p className="text-xs text-suzuki-mute mt-0.5">
                Enter target liters, rate/liter, and fixed bonus. Cartons and total incentive calculate automatically.
              </p>
            </div>
            <button
              type="button"
              className="text-sm font-bold text-suzuki-blue shrink-0"
              onClick={() =>
                setSlabs((prev) => [
                  ...prev,
                  {
                    targetLiters: '',
                    ratePerLiter: '',
                    fixedBonusPkr: prev[0]?.fixedBonusPkr || '80000',
                    sortOrder: prev.length
                  }
                ])
              }
            >
              + Add slab
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-suzuki-line">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-suzuki-mist text-xs uppercase text-suzuki-mute">
                <tr>
                  <th className="text-left px-3 py-2">Target (Liters)</th>
                  <th className="text-left px-3 py-2">Total Oil Cartons</th>
                  <th className="text-left px-3 py-2">Total Incentive (PKR)</th>
                  <th className="text-left px-3 py-2">Rate / L</th>
                  <th className="text-left px-3 py-2">Fixed bonus (promo cash)</th>
                  <th className="text-left px-3 py-2">Incentive details</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {slabs.map((row, index) => {
                  const details =
                    row.ratePerLiter !== '' || row.fixedBonusPkr !== ''
                      ? `Promotional Material Cash + Incentive @ Rs. ${row.ratePerLiter || '—'} per Liter`
                      : '—'
                  return (
                    <tr key={index} className="border-t border-suzuki-line align-top">
                      <td className="px-3 py-2">
                        <input
                          className="field"
                          value={row.targetLiters}
                          onChange={(e) => updateSlab(index, { targetLiters: e.target.value })}
                          placeholder="2508"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="field bg-suzuki-mist font-semibold">
                          {row.previewCartons != null ? Math.round(row.previewCartons).toLocaleString() : '—'}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="field bg-suzuki-mist font-semibold text-suzuki-navy">
                          {row.previewIncentive != null ? money(row.previewIncentive) : '—'}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="field"
                          value={row.ratePerLiter}
                          onChange={(e) => updateSlab(index, { ratePerLiter: e.target.value })}
                          placeholder="100"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="field"
                          value={row.fixedBonusPkr}
                          onChange={(e) => updateSlab(index, { fixedBonusPkr: e.target.value })}
                          placeholder="80000"
                        />
                      </td>
                      <td className="px-3 py-2 text-xs text-suzuki-mute max-w-[14rem]">{details}</td>
                      <td className="px-3 py-2">
                        {slabs.length > 1 && (
                          <button
                            type="button"
                            className="text-xs font-bold text-rose-600"
                            onClick={() => setSlabs((p) => p.filter((_, i) => i !== index))}
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-suzuki-mute">
            Check: 2,508 L × 100 + 80,000 = 330,800 PKR · cartons ≈ 2,508 ÷ 12 = 209 (when group pack is 12 L/carton).
          </p>
        </section>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => navigate('/incentive-schemes')} className="rounded-lg bg-suzuki-ice px-5 py-2.5 text-sm font-bold">Cancel</button>
        <button
          type="button"
          disabled={save.isPending || selectedDistributorIds.length === 0}
          onClick={() => save.mutate()}
          className="rounded-lg bg-suzuki-red text-white px-5 py-2.5 text-sm font-bold disabled:opacity-50"
        >
          Save scheme
        </button>
      </div>
    </div>
  )
}

export function IncentiveSchemeDetailPage() {
  const { id } = useParams()
  const detail = useQuery({
    queryKey: ['incentive-scheme', id],
    enabled: !!id,
    queryFn: async () => (await api.get<SchemeDetail>(`/incentive-schemes/${id}`)).data
  })
  const evaluation = useQuery({
    queryKey: ['incentive-scheme-eval', id],
    enabled: !!id,
    queryFn: async () => (await api.get<SchemeEvaluation>(`/incentive-schemes/${id}/evaluate`)).data
  })

  const scheme = detail.data
  const evalData = evaluation.data

  const downloadPdf = async (distributorId: string) => {
    const res = await api.get(`/incentive-schemes/${id}/report/${distributorId}.pdf`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = `incentive-${distributorId}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (detail.isLoading) return <p className="text-sm text-suzuki-mute py-10 text-center">Loading…</p>
  if (!scheme) return <p className="text-sm text-suzuki-mute py-10 text-center">Scheme not found.</p>

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/incentive-schemes" className="text-sm font-semibold text-suzuki-blue">← Schemes</Link>
          <h1 className="text-2xl font-extrabold text-suzuki-navy mt-1">{scheme.name}</h1>
          <p className="text-sm text-suzuki-mute">
            {scheme.schemeType} · {scheme.productGroupName} · {dateInput(scheme.currentPeriodStartUtc)} → {dateInput(scheme.currentPeriodEndUtc)}
            {(scheme.distributors?.length ?? 0) > 0
              ? ` · ${scheme.distributors.length} distributor${scheme.distributors.length === 1 ? '' : 's'}`
              : ''}
          </p>
        </div>
        <Link to={`/incentive-schemes/${scheme.id}/edit`} className="rounded-lg bg-suzuki-red text-white px-4 py-2 text-sm font-bold">
          Edit
        </Link>
      </div>

      {(scheme.distributors?.length ?? 0) > 0 && (
        <section className="bg-white rounded-2xl border border-suzuki-line shadow-card p-5">
          <h2 className="font-extrabold text-suzuki-navy mb-3">Participating distributors</h2>
          <div className="flex flex-wrap gap-2">
            {scheme.distributors.map((d) => (
              <span
                key={d.distributorId}
                className="rounded-full bg-suzuki-ice px-3 py-1 text-xs font-semibold text-suzuki-navy"
              >
                {d.distributorName} <span className="text-suzuki-mute font-mono">({d.distributorCode})</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {scheme.schemeType === 'Slab' && (
        <section className="bg-white rounded-2xl border border-suzuki-line shadow-card p-5 overflow-x-auto">
          <h2 className="font-extrabold text-suzuki-navy mb-3">Slabs</h2>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-suzuki-mute">
              <tr>
                <th className="text-left py-2">Target L</th>
                <th className="text-left py-2">Rate/L</th>
                <th className="text-left py-2">Fixed</th>
                <th className="text-left py-2">Cartons</th>
                <th className="text-left py-2">Incentive</th>
              </tr>
            </thead>
            <tbody>
              {scheme.slabs.map((s) => (
                <tr key={s.id} className="border-t border-suzuki-line">
                  <td className="py-2">{s.targetLiters}</td>
                  <td className="py-2">{s.ratePerLiter}</td>
                  <td className="py-2">{money(s.fixedBonusPkr)}</td>
                  <td className="py-2">{s.computedCartons ?? '—'}</td>
                  <td className="py-2 font-semibold">{money(s.computedIncentivePkr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-suzuki-mute mt-2">Group liters/carton: {scheme.groupLitersPerCarton || '—'}</p>
        </section>
      )}

      <section className="bg-white rounded-2xl border border-suzuki-line shadow-card p-5 overflow-x-auto">
        <h2 className="font-extrabold text-suzuki-navy mb-3">Live evaluation (per distributor)</h2>
        {evaluation.isLoading ? (
          <p className="text-sm text-suzuki-mute">Calculating from orders…</p>
        ) : (
          <table className="min-w-[900px] w-full text-sm">
            <thead className="text-xs uppercase text-suzuki-mute">
              <tr>
                <th className="text-left py-2">Distributor</th>
                <th className="text-right py-2">Current L</th>
                <th className="text-right py-2">Avg/mo</th>
                <th className="text-right py-2">Incentive</th>
                <th className="text-right py-2">PDF</th>
              </tr>
            </thead>
            <tbody>
              {(evalData?.distributors ?? []).map((d) => (
                <tr key={d.distributorId} className="border-t border-suzuki-line">
                  <td className="py-2 font-semibold text-suzuki-navy">
                    {d.distributorName}
                    <div className="text-xs font-normal text-suzuki-mute">{d.distributorCode}</div>
                  </td>
                  <td className="py-2 text-right">{d.currentLiters.toLocaleString()}</td>
                  <td className="py-2 text-right">{d.avgPerClosedMonth?.toLocaleString() ?? '—'}</td>
                  <td className="py-2 text-right font-semibold">
                    {money(d.qualifyingIncentivePkr ?? d.percentOfSalesIncentivePkr)}
                  </td>
                  <td className="py-2 text-right">
                    <button type="button" className="font-bold text-suzuki-blue" onClick={() => void downloadPdf(d.distributorId)}>
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
