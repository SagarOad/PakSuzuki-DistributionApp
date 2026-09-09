import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Pencil, Trash2 } from 'lucide-react'
import { api } from '@/api/axiosClient'
import { useAuth } from '@/context/AuthContext'
import { money, type CatalogLookups, type MasterProductRow } from './productWizardTypes'

interface PagedResult {
  items: MasterProductRow[]
  totalCount: number
}

export default function ProductList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { role } = useAuth()
  const canManage = role === 'SuperAdmin' || role === 'Admin'
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const lookups = useQuery({
    queryKey: ['master-catalog-lookups'],
    queryFn: async () => (await api.get<CatalogLookups>('/master-catalog/lookups')).data
  })

  const products = useQuery({
    queryKey: ['master-products', search, categoryId],
    queryFn: async () =>
      (await api.get<PagedResult>('/master-catalog/products', {
        params: { search: search || undefined, categoryId: categoryId || undefined, pageSize: 100 }
      })).data
  })

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => api.delete(`/master-catalog/products/${id}`),
    onSuccess: async () => {
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['master-products'] })
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { title?: string } } })?.response?.data?.title ||
        'Could not delete product.'
      setError(msg)
    }
  })

  const visibility = lookups.data?.priceVisibility
  const categories = lookups.data?.categories ?? []
  const colSpan =
    5 +
    (visibility?.canSeeCost ? 1 : 0) +
    (visibility?.canSeePurchase ? 1 : 0) +
    (visibility?.canSeeSale ? 2 : 0) +
    (canManage ? 1 : 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-suzuki-navy">Product master</h1>
          <p className="text-sm text-suzuki-mute mt-1">Lubricants are carton-based. Parts fields will appear when that catalog is seeded.</p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => navigate('/products/new')}
            className="rounded-lg bg-suzuki-red hover:bg-red-700 text-white text-sm font-bold px-4 py-2"
          >
            + Add Product
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search part number or name"
          className="field max-w-sm"
        />
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="field max-w-xs">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-navy-100 overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead className="bg-navy-100 text-navy-700 text-left">
            <tr>
              <th className="px-4 py-3">Part no.</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Pack</th>
              <th className="px-4 py-3 text-center">Discontinue</th>
              {visibility?.canSeeCost && <th className="px-4 py-3 text-right">Cost / pack</th>}
              {visibility?.canSeePurchase && <th className="px-4 py-3 text-right">Purchase / pack</th>}
              {visibility?.canSeeSale && <th className="px-4 py-3 text-right">Sale / pack</th>}
              {visibility?.canSeeSale && <th className="px-4 py-3 text-right">Sale / unit</th>}
              {canManage && <th className="px-4 py-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {products.isLoading && (
              <tr><td colSpan={colSpan} className="px-4 py-6 text-center text-navy-500">Loading…</td></tr>
            )}
            {!products.isLoading && products.data?.items.length === 0 && (
              <tr><td colSpan={colSpan} className="px-4 py-6 text-center text-navy-500">No master products yet.</td></tr>
            )}
            {products.data?.items.map((p) => (
              <tr
                key={p.id}
                className="border-t border-navy-100 hover:bg-suzuki-mist/60"
              >
                <td className="px-4 py-3 font-mono text-xs">{p.partItemNo}</td>
                <td className="px-4 py-3">{p.description}</td>
                <td className="px-4 py-3">{p.category}</td>
                <td className="px-4 py-3">{p.packLabel}</td>
                <td className="px-4 py-3 text-center">
                  <span className={p.discontinued ? 'text-suzuki-red font-bold' : 'text-suzuki-mute font-semibold'}>
                    {p.discontinued ? 'Y' : 'N'}
                  </span>
                </td>
                {visibility?.canSeeCost && <td className="px-4 py-3 text-right">{money(p.costPrice)}</td>}
                {visibility?.canSeePurchase && <td className="px-4 py-3 text-right">{money(p.purchasePrice)}</td>}
                {visibility?.canSeeSale && <td className="px-4 py-3 text-right">{money(p.salePrice)}</td>}
                {visibility?.canSeeSale && <td className="px-4 py-3 text-right">{money(p.pricePerUnit)}</td>}
                {canManage && (
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        className="p-1.5 text-suzuki-blue hover:bg-suzuki-ice rounded-lg"
                        title="Edit"
                        onClick={() => navigate(`/products/${p.id}`)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className="p-1.5 text-suzuki-navy hover:bg-rose-50 hover:text-suzuki-red rounded-lg disabled:opacity-50"
                        title="Delete"
                        disabled={deleteProduct.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete "${p.description}" (${p.partItemNo})? It will be removed from the catalog.`
                            )
                          ) {
                            deleteProduct.mutate(p.id)
                          }
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
