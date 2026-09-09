import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '@/api/axiosClient'
import { useAuth } from '@/context/AuthContext'
import { DataTable } from '@/components/ui/DataTable'
import { categoryLabel, type ShopBannerRow } from './shopTypes'

interface Paged<T> {
  items: T[]
  totalCount: number
}

/** Distributor storefront preview. Staff manage banners under Banner & Promotions. */
export default function MyShopPage() {
  const { role } = useAuth()
  const navigate = useNavigate()
  const isStaff = role === 'SuperAdmin' || role === 'Admin'
  const [headerSearch, setHeaderSearch] = useState('')
  const [categorySearch, setCategorySearch] = useState('')

  useEffect(() => {
    if (isStaff) navigate('/promotions', { replace: true })
  }, [isStaff, navigate])

  const headersQuery = useQuery({
    queryKey: ['shop-banners', 'Header', headerSearch],
    enabled: !isStaff,
    queryFn: async () =>
      (await api.get<Paged<ShopBannerRow>>('/shopbanners', {
        params: { type: 'Header', search: headerSearch || undefined, pageSize: 50 }
      })).data
  })

  const categoriesQuery = useQuery({
    queryKey: ['shop-banners', 'Category', categorySearch],
    enabled: !isStaff,
    queryFn: async () =>
      (await api.get<Paged<ShopBannerRow>>('/shopbanners', {
        params: { type: 'Category', search: categorySearch || undefined, pageSize: 50 }
      })).data
  })

  if (isStaff) {
    return (
      <p className="text-sm text-suzuki-mute">
        Redirecting to{' '}
        <Link to="/promotions" className="font-bold text-suzuki-blue hover:underline">
          Banner &amp; Promotions
        </Link>
        …
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-suzuki-navy">My Shop</h1>
        <p className="text-sm text-suzuki-mute mt-1">
          Header and category banners shown on your Start Order catalog (managed by Pak Suzuki).
        </p>
      </div>

      <DataTable
        title={<h2 className="text-lg font-bold text-suzuki-navy">Header Banner List</h2>}
        search={headerSearch}
        onSearchChange={setHeaderSearch}
        columns={[
          { key: 'image', header: 'Image' },
          { key: 'code', header: 'Code' },
          { key: 'name', header: 'Banner' },
          { key: 'action', header: 'Action' }
        ]}
        loading={headersQuery.isLoading}
        error={headersQuery.isError ? 'Failed to load banners.' : null}
        empty="No header banners yet."
      >
        {(headersQuery.data?.items ?? []).map((b) => (
          <tr key={b.id} className="border-t border-suzuki-line/80 hover:bg-suzuki-mist/40">
            <td className="px-5 py-3.5">
              {b.imageUrl ? (
                <img src={b.imageUrl} alt="" className="h-10 w-16 rounded object-cover" />
              ) : (
                '—'
              )}
            </td>
            <td className="px-4 py-3.5 text-suzuki-blue font-medium">{b.productCode}</td>
            <td className="px-4 py-3.5 text-suzuki-blue">{b.bannerName || '—'}</td>
            <td className="px-4 py-3.5 text-xs text-suzuki-mute">View only</td>
          </tr>
        ))}
      </DataTable>

      <DataTable
        title={<h2 className="text-lg font-bold text-suzuki-navy">Category Banner List</h2>}
        search={categorySearch}
        onSearchChange={setCategorySearch}
        columns={[
          { key: 'image', header: 'Image' },
          { key: 'category', header: 'Category' },
          { key: 'name', header: 'Banner' },
          { key: 'action', header: 'Action' }
        ]}
        loading={categoriesQuery.isLoading}
        error={categoriesQuery.isError ? 'Failed to load banners.' : null}
        empty="No category banners yet."
      >
        {(categoriesQuery.data?.items ?? []).map((b) => (
          <tr key={b.id} className="border-t border-suzuki-line/80 hover:bg-suzuki-mist/40">
            <td className="px-5 py-3.5">
              {b.imageUrl ? (
                <img src={b.imageUrl} alt="" className="h-10 w-16 rounded object-cover" />
              ) : (
                '—'
              )}
            </td>
            <td className="px-4 py-3.5 text-suzuki-blue">{categoryLabel(null, b.categoryName)}</td>
            <td className="px-4 py-3.5 text-suzuki-blue">{b.bannerName || '—'}</td>
            <td className="px-4 py-3.5 text-xs text-suzuki-mute">View only</td>
          </tr>
        ))}
      </DataTable>
    </div>
  )
}
