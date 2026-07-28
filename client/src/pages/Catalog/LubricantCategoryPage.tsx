import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/axiosClient'
import { useCart } from '@/context/CartContext'
import { ProductCard } from './ProductCard'
import type { CatalogBanner, CatalogProductCard } from './catalogTypes'

interface Paged<T> {
  items: T[]
  totalCount: number
}

const CATEGORY_META: Record<string, { title: string; apiCategory: string }> = {
  'motor-car': { title: 'Lubricant Motor Car', apiCategory: 'Motor Car' },
  'motor-bike': { title: 'Lubricant Motor Bike', apiCategory: 'Motor Bike' },
  all: { title: 'All Lubricant', apiCategory: 'All' }
}

export default function LubricantCategoryPage() {
  const { categoryKey = 'all' } = useParams()
  const navigate = useNavigate()
  const { addItem } = useCart()
  const meta = CATEGORY_META[categoryKey] ?? CATEGORY_META.all

  const bannersQuery = useQuery({
    queryKey: ['catalog-banners', 'Header', meta.apiCategory],
    queryFn: async () => (await api.get<CatalogBanner[]>('/catalog/banners', { params: { type: 'Header' } })).data
  })

  const productsQuery = useQuery({
    queryKey: ['catalog-products', meta.apiCategory],
    queryFn: async () =>
      (await api.get<Paged<CatalogProductCard>>('/catalog/products', {
        params: {
          category: meta.apiCategory === 'All' ? undefined : meta.apiCategory,
          pageSize: 48
        }
      })).data
  })

  const banner =
    (bannersQuery.data ?? []).find((b) =>
      meta.apiCategory === 'All'
        ? true
        : new RegExp(meta.apiCategory.replace(' ', '\\s*'), 'i').test(b.categoryName || b.bannerName || '')
    ) ?? bannersQuery.data?.[0]

  const quickAdd = async (product: CatalogProductCard, mode: 'cart' | 'buy') => {
    const detail = (await api.get<{
      id: string
      sku: string
      name: string
      description?: string | null
      categoryName?: string | null
      primaryImageUrl?: string | null
      variants: { id: string; typeName: string; distributorPrice: number; retailPrice: number; inStock: boolean }[]
    }>(`/catalog/products/${product.id}`)).data

    const variant = detail.variants.find((v) => v.inStock) ?? detail.variants[0]
    if (!variant) return

    addItem({
      productId: detail.id,
      variantId: variant.id,
      sku: detail.sku,
      name: detail.name,
      description: detail.description,
      categoryName: detail.categoryName,
      imageUrl: detail.primaryImageUrl,
      packLabel: variant.typeName,
      unitPrice: variant.distributorPrice || variant.retailPrice || product.displayPrice
    })
    if (mode === 'buy') navigate('/cart')
  }

  return (
    <div className="space-y-6 pb-8">
      <section className="relative rounded-2xl overflow-hidden min-h-[200px] sm:min-h-[260px] bg-[#0b1f4a] shadow-card">
        {banner?.imageUrl ? (
          <img
            src={banner.imageUrl}
            alt={banner.bannerName || meta.title}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col justify-center px-8 bg-gradient-to-r from-[#0b1f4a] via-[#123a7a] to-[#1a56b0]">
            <h1 className="text-2xl sm:text-3xl font-black text-white">{meta.title}</h1>
            <p className="mt-2 text-sm text-white/80">Upload a matching header banner in My Shop</p>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl sm:text-2xl font-extrabold text-suzuki-navy mb-4">{meta.title}</h2>
        {productsQuery.isLoading ? (
          <p className="text-sm text-suzuki-mute">Loading products…</p>
        ) : (productsQuery.data?.items.length ?? 0) === 0 ? (
          <p className="text-sm text-suzuki-mute">No products in this category yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {(productsQuery.data?.items ?? []).map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                onAddToCart={() => void quickAdd(p, 'cart')}
                onBuyNow={() => void quickAdd(p, 'buy')}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
