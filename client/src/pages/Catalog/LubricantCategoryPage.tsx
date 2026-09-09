import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/axiosClient'
import { catalogFilterParams, useCart } from '@/context/CartContext'
import { ProductCard } from './ProductCard'
import { OrderLaneFilters } from './OrderLaneFilters'
import type { CatalogBanner, CatalogProductCard } from './catalogTypes'

interface Paged<T> {
  items: T[]
  totalCount: number
}

const CATEGORY_META: Record<string, { title: string; apiCategory: string }> = {
  'engine-oil': { title: 'Engine Oil', apiCategory: 'Engine Oil' },
  'gear-oil': { title: 'Gear Oil', apiCategory: 'Gear Oil' },
  chemical: { title: 'Chemical', apiCategory: 'Chemical' },
  chemicals: { title: 'Chemical', apiCategory: 'Chemical' },
  parts: { title: 'Parts', apiCategory: 'Parts' },
  'motor-car': { title: 'Engine Oil', apiCategory: 'Engine Oil' },
  'motor-bike': { title: 'Gear Oil', apiCategory: 'Gear Oil' },
  'motor-oil': { title: 'Engine Oil', apiCategory: 'Engine Oil' },
  all: { title: 'All Lubricants', apiCategory: 'All' }
}

export default function LubricantCategoryPage() {
  const { categoryKey = 'all' } = useParams()
  const navigate = useNavigate()
  const { addItem, orderContext } = useCart()
  const meta = CATEGORY_META[categoryKey] ?? CATEGORY_META.all
  const filters = catalogFilterParams(orderContext)

  const bannersQuery = useQuery({
    queryKey: ['catalog-banners', 'Header', meta.apiCategory],
    queryFn: async () => (await api.get<CatalogBanner[]>('/catalog/banners', { params: { type: 'Header' } })).data
  })

  const productsQuery = useQuery({
    queryKey: ['catalog-products', meta.apiCategory, filters],
    enabled: !!orderContext,
    queryFn: async () =>
      (await api.get<Paged<CatalogProductCard>>('/catalog/products', {
        params: {
          category: meta.apiCategory === 'All' ? undefined : meta.apiCategory,
          pageSize: 48,
          ...filters
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
    if (!orderContext) return
    const detail = (await api.get<{
      id: string
      sku: string
      name: string
      description?: string | null
      categoryName?: string | null
      primaryImageUrl?: string | null
      variants: {
        id: string
        typeName: string
        distributorPrice: number
        retailPrice: number
        inStock: boolean
        gstPercent?: number | null
        fedPercent?: number | null
      }[]
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
      unitPrice: variant.distributorPrice || variant.retailPrice || product.displayPrice,
      gstPercent: variant.gstPercent != null ? Number(variant.gstPercent) : undefined,
      fedPercent: variant.fedPercent != null ? Number(variant.fedPercent) : undefined
    })
    if (mode === 'buy') navigate('/cart')
  }

  return (
    <div className="space-y-6 pb-8">
      <section className="relative rounded-2xl overflow-hidden min-h-[160px] sm:min-h-[200px] bg-[#0b1f4a] shadow-card">
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

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-xl sm:text-2xl font-extrabold text-suzuki-navy">{meta.title}</h2>
        </div>

        <OrderLaneFilters compact />

        {!orderContext ? (
          <div className="rounded-xl border border-dashed border-suzuki-line bg-suzuki-mist/40 p-8 text-center">
            <p className="text-sm text-suzuki-mute">
              Select source, delivery type, and supplier above to load products.
            </p>
          </div>
        ) : productsQuery.isLoading ? (
          <p className="text-sm text-suzuki-mute">Loading products…</p>
        ) : (productsQuery.data?.items.length ?? 0) === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center space-y-1">
            <p className="text-sm font-semibold text-amber-900">No products match this lane</p>
            <p className="text-xs text-amber-800">
              Change the filters above — you do not need to clear and restart.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
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
