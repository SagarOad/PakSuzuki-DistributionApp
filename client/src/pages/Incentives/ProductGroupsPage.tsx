import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/axiosClient'
import { sameMaterialSource, sourceScopeAllows } from '@/lib/orderLaneSource'
import type { CatalogLookups, MasterProductRow } from '@/pages/Products/productWizardTypes'
import type { ProductGroupDetail, ProductGroupListRow } from './schemeTypes'

interface Paged<T> { items: T[]; totalCount: number }

export default function ProductGroupsPage({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)

  const list = useQuery({
    queryKey: ['product-groups', search],
    queryFn: async () =>
      (await api.get<Paged<ProductGroupListRow>>('/incentive-schemes/product-groups', {
        params: { search: search || undefined, pageSize: 100 }
      })).data
  })

  return (
    <div className={embedded ? 'space-y-5' : 'space-y-5 pb-10'}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-suzuki-navy">Product groups</h1>
          <p className="text-sm text-suzuki-mute mt-1">
            Named sets of Part Item Nos. Incentive schemes sum purchases across all members.
          </p>
        </div>
        <div className="flex gap-2">
          {!embedded && (
            <Link to="/incentive-schemes" className="rounded-lg bg-suzuki-ice px-4 py-2 text-sm font-bold text-suzuki-navy">
              Schemes
            </Link>
          )}
          <button
            type="button"
            onClick={() => setEditingId('new')}
            className="rounded-lg bg-suzuki-red px-4 py-2 text-sm font-bold text-white"
          >
            + New group
          </button>
        </div>
      </div>

      <input
        className="field max-w-sm"
        placeholder="Search groups…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="overflow-x-auto rounded-2xl border border-suzuki-line bg-white shadow-card">
        <table className="w-full text-sm text-left">
          <thead className="bg-suzuki-mist text-suzuki-mute text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">SKUs</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {(list.data?.items ?? []).map((g) => (
              <tr key={g.id} className="border-t border-suzuki-line">
                <td className="px-4 py-3 font-semibold text-suzuki-navy">{g.name}</td>
                <td className="px-4 py-3">{g.memberCount}</td>
                <td className="px-4 py-3">{g.isActive ? 'Yes' : 'No'}</td>
                <td className="px-4 py-3">
                  <button type="button" className="text-suzuki-blue font-bold" onClick={() => setEditingId(g.id)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {!list.isLoading && (list.data?.items.length ?? 0) === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-suzuki-mute">No product groups yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editingId && (
        <GroupEditor
          id={editingId === 'new' ? null : editingId}
          onClose={() => setEditingId(null)}
          onSaved={async () => {
            setEditingId(null)
            await qc.invalidateQueries({ queryKey: ['product-groups'] })
            if (!embedded) navigate('/product-groups')
          }}
        />
      )}
    </div>
  )
}

function GroupEditor({
  id,
  onClose,
  onSaved
}: {
  id: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [selected, setSelected] = useState<string[]>([])
  const [selectedLabels, setSelectedLabels] = useState<Record<string, string>>({})
  const [productSearch, setProductSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Cascade filters (same idea as create order / product wizard)
  const [typeId, setTypeId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [pTypeId, setPTypeId] = useState('')
  const [sourceCode, setSourceCode] = useState('')
  const [filtersReady, setFiltersReady] = useState(false)

  const lookups = useQuery({
    queryKey: ['master-catalog-lookups'],
    queryFn: async () => (await api.get<CatalogLookups>('/master-catalog/lookups')).data
  })

  const detail = useQuery({
    queryKey: ['product-group', id],
    enabled: !!id,
    queryFn: async () => (await api.get<ProductGroupDetail>(`/incentive-schemes/product-groups/${id}`)).data
  })

  const categories = useMemo(
    () => (lookups.data?.categories ?? []).filter((c) => !typeId || c.productTypeId === typeId),
    [lookups.data, typeId]
  )
  const selectedCategory = categories.find((c) => c.id === categoryId)
  const pTypes = selectedCategory?.pTypes ?? []
  const selectedPType = pTypes.find((p) => p.id === pTypeId)

  const sourceOptions = useMemo(() => {
    const all = lookups.data?.sources ?? []
    const scope = selectedPType?.sourceScope
    if (!scope?.length) return all
    return all.filter((s) => sourceScopeAllows(scope, s.code))
  }, [lookups.data, selectedPType])

  const products = useQuery({
    queryKey: ['master-products-for-group', categoryId, productSearch],
    enabled: filtersReady && !!categoryId,
    queryFn: async () =>
      (await api.get<Paged<MasterProductRow>>('/master-catalog/products', {
        params: {
          search: productSearch || undefined,
          categoryId,
          pageSize: 200
        }
      })).data
  })

  const visibleProducts = useMemo(() => {
    let rows = products.data?.items ?? []
    if (selectedPType) {
      rows = rows.filter((p) => (p.pType || '').toLowerCase() === selectedPType.code.toLowerCase())
    }
    if (sourceCode) {
      rows = rows.filter((p) => sameMaterialSource(p.source, sourceCode))
    }
    return rows
  }, [products.data, selectedPType, sourceCode])

  useEffect(() => {
    const d = detail.data
    if (!d) return
    setName(d.name)
    setDescription(d.description ?? '')
    setIsActive(d.isActive)
    setSelected(d.members.map((m) => m.productId))
    setSelectedLabels(
      Object.fromEntries(d.members.map((m) => [m.productId, `${m.partItemNo} — ${m.productName}`]))
    )
  }, [detail.data])

  const save = useMutation({
    mutationFn: async () => {
      const body = { name, description: description || null, isActive, productIds: selected }
      if (id) await api.put(`/incentive-schemes/product-groups/${id}`, body)
      else await api.post('/incentive-schemes/product-groups', body)
    },
    onSuccess: onSaved,
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string; title?: string } } })?.response?.data
      setError(msg?.detail || msg?.title || 'Could not save group.')
    }
  })

  const toggle = (p: MasterProductRow) => {
    setSelected((prev) => {
      if (prev.includes(p.id)) {
        setSelectedLabels((labels) => {
          const next = { ...labels }
          delete next[p.id]
          return next
        })
        return prev.filter((x) => x !== p.id)
      }
      setSelectedLabels((labels) => ({
        ...labels,
        [p.id]: `${p.partItemNo} — ${p.description}`
      }))
      return [...prev, p.id]
    })
  }

  const visibleIds = visibleProducts.map((p) => p.id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id))

  const selectAllVisible = () => {
    setSelected((prev) => {
      const set = new Set(prev)
      for (const p of visibleProducts) set.add(p.id)
      return [...set]
    })
    setSelectedLabels((labels) => {
      const next = { ...labels }
      for (const p of visibleProducts) next[p.id] = `${p.partItemNo} — ${p.description}`
      return next
    })
  }

  const clearVisible = () => {
    const drop = new Set(visibleIds)
    setSelected((prev) => prev.filter((id) => !drop.has(id)))
    setSelectedLabels((labels) => {
      const next = { ...labels }
      for (const id of drop) delete next[id]
      return next
    })
  }

  const resetFilters = () => {
    setTypeId('')
    setCategoryId('')
    setPTypeId('')
    setSourceCode('')
    setFiltersReady(false)
    setProductSearch('')
  }

  const canShowProducts = filtersReady && !!typeId && !!categoryId

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-card w-full max-w-3xl max-h-[92vh] overflow-y-auto p-6 space-y-4">
        <h2 className="text-lg font-extrabold text-suzuki-navy">{id ? 'Edit product group' : 'New product group'}</h2>
        {error && <div className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{error}</div>}

        <label className="block text-sm">
          <span className="font-bold text-suzuki-mute text-xs uppercase">Name</span>
          <input className="field mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="font-bold text-suzuki-mute text-xs uppercase">Description</span>
          <textarea className="field mt-1" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>

        <div className="rounded-xl border border-suzuki-line bg-suzuki-mist/40 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-extrabold text-suzuki-navy text-sm">Select products</h3>
              <p className="text-xs text-suzuki-mute mt-0.5">
                Choose type and category first (same idea as Start Order), then pick from the matching list.
              </p>
            </div>
            {filtersReady && (
              <button type="button" className="text-xs font-bold text-suzuki-blue" onClick={resetFilters}>
                Change filters
              </button>
            )}
          </div>

          {!canShowProducts ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label>
                <span className="text-[11px] font-bold uppercase text-suzuki-mute">Product type</span>
                <select
                  className="field mt-1"
                  value={typeId}
                  onChange={(e) => {
                    setTypeId(e.target.value)
                    setCategoryId('')
                    setPTypeId('')
                    setSourceCode('')
                  }}
                >
                  <option value="">Select type</option>
                  {(lookups.data?.productTypes ?? []).map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="text-[11px] font-bold uppercase text-suzuki-mute">Category</span>
                <select
                  className="field mt-1"
                  value={categoryId}
                  disabled={!typeId}
                  onChange={(e) => {
                    setCategoryId(e.target.value)
                    setPTypeId('')
                    setSourceCode('')
                  }}
                >
                  <option value="">{typeId ? 'Select category' : 'Select type first'}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="text-[11px] font-bold uppercase text-suzuki-mute">Delivery type</span>
                <select
                  className="field mt-1"
                  value={pTypeId}
                  disabled={!categoryId}
                  onChange={(e) => {
                    setPTypeId(e.target.value)
                    setSourceCode('')
                  }}
                >
                  <option value="">All delivery types</option>
                  {pTypes.map((p) => (
                    <option key={p.id} value={p.id}>{p.code} — {p.deliveryType}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="text-[11px] font-bold uppercase text-suzuki-mute">Source</span>
                <select
                  className="field mt-1"
                  value={sourceCode}
                  disabled={!categoryId}
                  onChange={(e) => setSourceCode(e.target.value)}
                >
                  <option value="">All sources</option>
                  {sourceOptions.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} — {s.name}
                      {s.isReady === false ? ' (awaiting data)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="button"
                  disabled={!typeId || !categoryId}
                  onClick={() => setFiltersReady(true)}
                  className="rounded-lg bg-suzuki-navy text-white px-4 py-2 text-sm font-bold disabled:opacity-50"
                >
                  Show products
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs text-suzuki-mute">
                Filters:{' '}
                <span className="font-semibold text-suzuki-navy">
                  {lookups.data?.productTypes.find((t) => t.id === typeId)?.name}
                  {' · '}
                  {selectedCategory?.name}
                  {selectedPType ? ` · ${selectedPType.code}` : ''}
                  {sourceCode ? ` · ${sourceCode}` : ''}
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-suzuki-mute text-xs uppercase">
                  Products ({visibleProducts.length} shown · {selected.length} selected)
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="field max-w-[11rem]"
                    placeholder="Search Part Item No…"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                  />
                  <button
                    type="button"
                    className="rounded-lg bg-suzuki-ice px-3 py-2 text-xs font-bold text-suzuki-navy"
                    disabled={visibleIds.length === 0}
                    onClick={() => (allVisibleSelected ? clearVisible() : selectAllVisible())}
                  >
                    {allVisibleSelected ? 'Clear shown' : 'Select all'}
                  </button>
                </div>
              </div>

              <div className="max-h-56 overflow-y-auto border border-suzuki-line rounded-xl divide-y divide-suzuki-line bg-white">
                {products.isLoading && (
                  <p className="px-3 py-4 text-sm text-suzuki-mute text-center">Loading products…</p>
                )}
                {!products.isLoading && visibleProducts.length === 0 && (
                  <p className="px-3 py-4 text-sm text-suzuki-mute text-center">No products match these filters.</p>
                )}
                {visibleProducts.map((p) => (
                  <label key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-suzuki-mist/50">
                    <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p)} />
                    <span className="font-mono text-xs text-suzuki-blue shrink-0">{p.partItemNo}</span>
                    <span className="text-suzuki-navy truncate flex-1">{p.description}</span>
                    <span className="text-[11px] text-suzuki-mute shrink-0">{p.source || '—'}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {selected.length > 0 && (
          <div className="rounded-xl border border-suzuki-line p-3">
            <div className="text-xs font-bold uppercase text-suzuki-mute mb-2">
              Selected in this group ({selected.length})
            </div>
            <div className="max-h-28 overflow-y-auto flex flex-wrap gap-1.5">
              {selected.map((pid) => (
                <button
                  key={pid}
                  type="button"
                  title="Remove"
                  onClick={() => {
                    setSelected((prev) => prev.filter((x) => x !== pid))
                    setSelectedLabels((labels) => {
                      const next = { ...labels }
                      delete next[pid]
                      return next
                    })
                  }}
                  className="rounded-full bg-suzuki-ice px-2.5 py-1 text-[11px] font-semibold text-suzuki-navy hover:bg-rose-50"
                >
                  {selectedLabels[pid] ?? pid.slice(0, 8)} ×
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg bg-suzuki-ice px-4 py-2 text-sm font-bold">Cancel</button>
          <button
            type="button"
            disabled={save.isPending || !name.trim() || selected.length === 0}
            onClick={() => save.mutate()}
            className="rounded-lg bg-suzuki-red text-white px-4 py-2 text-sm font-bold disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
