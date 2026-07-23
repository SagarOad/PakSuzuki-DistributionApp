import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Pencil, Trash2 } from 'lucide-react'
import { api } from '@/api/axiosClient'
import { useAuth } from '@/context/AuthContext'
import {
  DataTable,
  ImportFileButton,
  PrimaryAddButton
} from '@/components/ui/DataTable'
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

      <DataTable
        title={<h2 className="text-lg font-bold text-suzuki-navy">Header Banner List</h2>}
        search={headerSearch}
        onSearchChange={setHeaderSearch}
        toolbarActions={
          canEdit ? (
            <PrimaryAddButton
              label="+ Add Header Banner"
              onClick={() => navigate('/shop/header-banners/new')}
            />
          ) : null
        }
        columns={[
          { key: 'code', header: 'Product Code' },
          { key: 'name', header: 'Product Name' },
          { key: 'category', header: 'Category' },
          { key: 'action', header: 'Action' }
        ]}
        loading={headersQuery.isLoading}
        error={headersQuery.isError ? 'Failed to load header banners.' : null}
        empty="No header banners yet."
      >
        {(headersQuery.data?.items ?? []).map((b) => (
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
      </DataTable>

      <DataTable
        title={<h2 className="text-lg font-bold text-suzuki-navy">Category Banner</h2>}
        search={categorySearch}
        onSearchChange={setCategorySearch}
        toolbarActions={
          canEdit ? (
            <PrimaryAddButton
              label="+ Add Category Banner"
              onClick={() => navigate('/shop/category-banners/new')}
            />
          ) : null
        }
        columns={[
          { key: 'code', header: 'Product Code' },
          { key: 'name', header: 'Banner Name' },
          { key: 'category', header: 'Category' },
          { key: 'action', header: 'Action' }
        ]}
        loading={categoriesQuery.isLoading}
        error={categoriesQuery.isError ? 'Failed to load category banners.' : null}
        empty="No category banners yet."
      >
        {(categoriesQuery.data?.items ?? []).map((b) => (
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
      </DataTable>

      <DataTable
        title={<h2 className="text-lg font-bold text-suzuki-navy">Products List</h2>}
        headerActions={
          <ImportFileButton
            label="Import Products"
            title={importHint}
            disabled={!canEdit}
            onFile={onImport}
          />
        }
        search={productSearch}
        onSearchChange={setProductSearch}
        toolbarActions={
          canEdit ? (
            <PrimaryAddButton
              label="+ Add Product"
              onClick={() => navigate('/shop/products/new')}
            />
          ) : null
        }
        columns={[
          { key: 'code', header: 'Product Code' },
          { key: 'name', header: 'Product Name' },
          { key: 'category', header: 'Category' },
          { key: 'units', header: 'Units' },
          { key: 'action', header: 'Action' }
        ]}
        loading={productsQuery.isLoading}
        error={productsQuery.isError ? 'Failed to load products.' : null}
        empty="No products yet."
      >
        {(productsQuery.data?.items ?? []).map((p) => (
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
      </DataTable>

      {!canEdit && (
        <p className="text-xs text-suzuki-mute">
          Viewing catalog only. Contact an admin to add banners or products.
        </p>
      )}
    </div>
  )
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
