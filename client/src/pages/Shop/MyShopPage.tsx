import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Pencil, Search, Trash2, Upload } from 'lucide-react'
import { api } from '@/api/axiosClient'
import { useAuth } from '@/context/AuthContext'
import { categoryLabel, type ShopBannerRow, type ShopProductRow } from './shopTypes'

interface Paged<T> {
  items: T[]
  totalCount: number
}

export default function MyShopPage() {
  const { role } = useAuth()
  const canEdit = role === 'SuperAdmin' || role === 'Admin'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [headerSearch, setHeaderSearch] = useState('')
  const [categorySearch, setCategorySearch] = useState('')
  const [productSearch, setProductSearch] = useState('')

  const headersQuery = useQuery({
    queryKey: ['shop-banners', 'Header', headerSearch],
    queryFn: async () =>
      (await api.get<Paged<ShopBannerRow>>('/shopbanners', {
        params: { type: 'Header', search: headerSearch || undefined, pageSize: 50 }
      })).data
  })

  const categoriesQuery = useQuery({
    queryKey: ['shop-banners', 'Category', categorySearch],
    queryFn: async () =>
      (await api.get<Paged<ShopBannerRow>>('/shopbanners', {
        params: { type: 'Category', search: categorySearch || undefined, pageSize: 50 }
      })).data
  })

  const productsQuery = useQuery({
    queryKey: ['shop-products', productSearch],
    queryFn: async () =>
      (await api.get<Paged<ShopProductRow>>('/products', {
        params: { search: productSearch || undefined, pageSize: 50 }
      })).data
  })

  const deleteBanner = useMutation({
    mutationFn: async (id: string) => api.delete(`/shopbanners/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shop-banners'] })
  })

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => api.delete(`/shop/products/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shop-products'] })
  })

  const importHint = useMemo(
    () => 'Import accepts JSON rows via POST /api/products/bulk-upload (Admin).',
    []
  )

  const onImport = async (file: File | null) => {
    if (!file || !canEdit) return
    const text = await file.text()
    const rows = JSON.parse(text)
    await api.post('/products/bulk-upload', rows)
    await qc.invalidateQueries({ queryKey: ['shop-products'] })
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-suzuki-navy">My Shop</h1>

      <ShopSection
        title="Header Banner List"
        search={headerSearch}
        onSearch={setHeaderSearch}
        addLabel="+ Add Header Banner"
        onAdd={() => navigate('/shop/header-banners/new')}
        canEdit={canEdit}
        loading={headersQuery.isLoading}
        error={headersQuery.isError ? 'Failed to load header banners.' : null}
        columns={['Product Code', 'Product Name', 'Category', 'Action']}
        rows={(headersQuery.data?.items ?? []).map((b) => (
          <tr key={b.id} className="border-t border-suzuki-line/80 hover:bg-suzuki-mist/40">
            <td className="px-5 py-3.5 text-suzuki-blue font-medium">{b.productCode}</td>
            <td className="px-4 py-3.5 text-suzuki-blue">{b.productName || '—'}</td>
            <td className="px-4 py-3.5 text-suzuki-blue">{b.categoryName}</td>
            <td className="px-4 py-3.5">
              <RowActions
                canEdit={canEdit}
                onEdit={() => navigate(`/shop/header-banners/${b.id}`)}
                onDelete={() => {
                  if (confirm('Delete this header banner?')) deleteBanner.mutate(b.id)
                }}
              />
            </td>
          </tr>
        ))}
        empty="No header banners yet."
      />

      <ShopSection
        title="Category Banner"
        search={categorySearch}
        onSearch={setCategorySearch}
        addLabel="+ Add Category Banner"
        onAdd={() => navigate('/shop/category-banners/new')}
        canEdit={canEdit}
        loading={categoriesQuery.isLoading}
        error={categoriesQuery.isError ? 'Failed to load category banners.' : null}
        columns={['Product Code', 'Banner Name', 'Category', 'Action']}
        rows={(categoriesQuery.data?.items ?? []).map((b) => (
          <tr key={b.id} className="border-t border-suzuki-line/80 hover:bg-suzuki-mist/40">
            <td className="px-5 py-3.5 text-suzuki-blue font-medium">{b.productCode}</td>
            <td className="px-4 py-3.5 text-suzuki-blue">{b.bannerName || '—'}</td>
            <td className="px-4 py-3.5 text-suzuki-blue">{b.categoryName}</td>
            <td className="px-4 py-3.5">
              <RowActions
                canEdit={canEdit}
                onEdit={() => navigate(`/shop/category-banners/${b.id}`)}
                onDelete={() => {
                  if (confirm('Delete this category banner?')) deleteBanner.mutate(b.id)
                }}
              />
            </td>
          </tr>
        ))}
        empty="No category banners yet."
      />

      <section className="bg-white rounded-2xl border border-suzuki-line shadow-card overflow-hidden">
        <div className="px-5 pt-5 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-suzuki-navy">Products List</h2>
          {canEdit && (
            <label className="inline-flex items-center gap-1.5 rounded-lg border border-suzuki-red/50 text-suzuki-red px-3 py-2 text-xs font-semibold hover:bg-red-50 cursor-pointer">
              <Upload size={14} />
              Import Products
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                title={importHint}
                onChange={(e) => void onImport(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
        </div>
        <ShopSection
          embedded
          title=""
          search={productSearch}
          onSearch={setProductSearch}
          addLabel="+ Add Product"
          onAdd={() => navigate('/shop/products/new')}
          canEdit={canEdit}
          loading={productsQuery.isLoading}
          error={productsQuery.isError ? 'Failed to load products.' : null}
          columns={['Product Code', 'Product Name', 'Category', 'Units', 'Action']}
          rows={(productsQuery.data?.items ?? []).map((p) => (
            <tr key={p.id} className="border-t border-suzuki-line/80 hover:bg-suzuki-mist/40">
              <td className="px-5 py-3.5 text-suzuki-blue font-medium">{p.sku}</td>
              <td className="px-4 py-3.5 text-suzuki-blue">{p.name}</td>
              <td className="px-4 py-3.5 text-suzuki-blue">{categoryLabel(p.category, p.categoryName)}</td>
              <td className="px-4 py-3.5 text-suzuki-blue">{p.units ?? 0}</td>
              <td className="px-4 py-3.5">
                <RowActions
                  canEdit={canEdit}
                  onEdit={() => navigate(`/shop/products/${p.id}`)}
                  onDelete={() => {
                    if (confirm('Delete this product?')) deleteProduct.mutate(p.id)
                  }}
                />
              </td>
            </tr>
          ))}
          empty="No products yet."
        />
      </section>

      {!canEdit && (
        <p className="text-xs text-suzuki-mute">
          Viewing catalog only. Contact an admin to add banners or products.
        </p>
      )}
    </div>
  )
}

function ShopSection({
  title,
  search,
  onSearch,
  addLabel,
  onAdd,
  canEdit,
  loading,
  error,
  columns,
  rows,
  empty,
  embedded
}: {
  title: string
  search: string
  onSearch: (v: string) => void
  addLabel: string
  onAdd: () => void
  canEdit: boolean
  loading: boolean
  error: string | null
  columns: string[]
  rows: React.ReactNode
  empty: string
  embedded?: boolean
}) {
  const body = (
    <>
      {(title || !embedded) && title ? (
        <h2 className="text-lg font-bold text-suzuki-navy mb-3 px-5 pt-5">{title}</h2>
      ) : null}
      <div className="px-5 pb-3 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex items-center gap-2 bg-suzuki-mist rounded-lg px-3 py-2 border border-suzuki-line flex-1 max-w-md">
          <Search size={14} className="text-suzuki-mute" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search"
            className="bg-transparent outline-none text-sm w-full text-suzuki-ink"
          />
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center justify-center rounded-lg bg-suzuki-blue text-white px-4 py-2 text-sm font-semibold hover:bg-suzuki-navy"
          >
            {addLabel}
          </button>
        )}
      </div>
      {error && (
        <div className="mx-5 mb-3 rounded-lg border border-suzuki-red/30 bg-red-50 px-3 py-2 text-sm text-suzuki-red">
          {error}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-suzuki-mist/80 text-left text-xs font-bold uppercase tracking-wide text-suzuki-mute">
              {columns.map((c) => (
                <th key={c} className="px-5 py-3">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={columns.length} className="px-5 py-10 text-center text-suzuki-mute">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && Array.isArray(rows) && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-5 py-10 text-center text-suzuki-mute">
                  {empty}
                </td>
              </tr>
            )}
            {!loading && rows}
          </tbody>
        </table>
      </div>
    </>
  )

  if (embedded) return <div>{body}</div>
  return <section className="bg-white rounded-2xl border border-suzuki-line shadow-card overflow-hidden">{body}</section>
}

function RowActions({
  canEdit,
  onEdit,
  onDelete
}: {
  canEdit: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  if (!canEdit) {
    return (
      <button type="button" onClick={onEdit} className="text-suzuki-blue text-xs font-semibold">
        View
      </button>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onEdit} className="p-1.5 rounded-lg text-suzuki-blue hover:bg-suzuki-ice" title="Edit">
        <Pencil size={16} />
      </button>
      <button type="button" onClick={onDelete} className="p-1.5 rounded-lg text-suzuki-red hover:bg-red-50" title="Delete">
        <Trash2 size={16} />
      </button>
    </div>
  )
}
