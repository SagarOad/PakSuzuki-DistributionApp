import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { api } from '@/api/axiosClient'
import { useAuth } from '@/context/AuthContext'
import { catalogFilterParams, useCart } from '@/context/CartContext'
import { ProductCard } from './ProductCard'
import { OrderLaneFilters } from './OrderLaneFilters'
import type { CatalogBanner, CatalogProductCard } from './catalogTypes'
import { categorySlug } from '@/pages/Shop/shopTypes'

interface Paged<T> {
  items: T[]
  totalCount: number
}

/** Start Order catalog: category cards (with images only) + lane filters + products. */
export default function DistributorHomePage() {
  const navigate = useNavigate()
  const { role } = useAuth()
  const { addItem, orderContext } = useCart()
  const isRetailer = role === 'Retailer'
  const filters = catalogFilterParams(orderContext)

  const categoryBannersQuery = useQuery({
    queryKey: ['catalog-banners', 'Category'],
    queryFn: async () => (await api.get<CatalogBanner[]>('/catalog/banners', { params: { type: 'Category' } })).data
  })

  const productsQuery = useQuery({
    queryKey: ['catalog-products', 'all-home', filters],
    enabled: !!orderContext,
    queryFn: async () =>
      (await api.get<Paged<CatalogProductCard>>('/catalog/products', {
        params: { pageSize: 20, ...filters }
      })).data
  })

  const categoryBanners = (categoryBannersQuery.data ?? []).filter((b) => !!b.imageUrl)

  const addFromCard = async (product: CatalogProductCard, mode: 'cart' | 'buy') => {
    if (!orderContext) return
    const detail = (
      await api.get<{
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
      }>(`/catalog/products/${product.id}`)
    ).data

    const variant = detail.variants.find((v) => v.inStock) ?? detail.variants[0]
    if (!variant) {
      navigate(`/catalog/products/${product.id}`)
      return
    }

    addItem(
      {
        productId: detail.id,
        variantId: variant.id,
        sku: detail.sku,
        name: detail.name,
        description: detail.description,
        categoryName: detail.categoryName,
        imageUrl: detail.primaryImageUrl,
        packLabel: variant.typeName,
        unitPrice: isRetailer
          ? variant.retailPrice || product.displayPrice
          : variant.distributorPrice || variant.retailPrice || product.displayPrice,
        gstPercent: variant.gstPercent != null ? Number(variant.gstPercent) : undefined,
        fedPercent: variant.fedPercent != null ? Number(variant.fedPercent) : undefined
      },
      1
    )

    if (mode === 'buy') navigate('/cart')
  }

  return (
    <div className="space-y-7 pb-8">
      {categoryBanners.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-suzuki-navy">Categories</h2>
            <p className="text-xs text-suzuki-mute mt-0.5">Pick a category or filter the catalog below</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {categoryBanners.map((b) => (
              <Link
                key={b.id}
                to={`/catalog/${categorySlug(b.categoryName || b.bannerName || 'all')}`}
                className="group rounded-2xl overflow-hidden border border-suzuki-line bg-white shadow-card hover:shadow-md transition-shadow"
              >
                <div className="aspect-[16/10] bg-suzuki-mist overflow-hidden">
                  <img
                    src={b.imageUrl}
                    alt={b.bannerName || b.categoryName}
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                  />
                </div>
                <div className="px-3 py-2.5 flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-suzuki-navy truncate">
                    {b.bannerName || b.categoryName}
                  </p>
                  <ArrowRight size={14} className="text-suzuki-mute shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-suzuki-navy">Catalog</h2>
          <p className="text-xs text-suzuki-mute mt-0.5">
            {isRetailer
              ? 'Choose your order lane below, then add packs at retail price. Orders go to your distributor.'
              : 'Choose source, delivery type, and supplier below — products for that lane appear here.'}
          </p>
        </div>

        <OrderLaneFilters compact />

        {productsQuery.isLoading ? (
          <p className="text-sm text-suzuki-mute">Loading products…</p>
        ) : !orderContext ? (
          <div className="rounded-xl border border-dashed border-suzuki-line bg-suzuki-mist/40 p-8 text-center">
            <p className="text-sm text-suzuki-mute">
              Select source, delivery type, and supplier above to load products.
            </p>
          </div>
        ) : (productsQuery.data?.items.length ?? 0) === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center space-y-1">
            <p className="text-sm font-semibold text-amber-900">No products match this lane</p>
            <p className="text-xs text-amber-800">
              Change the filters above to try another combination. You do not need to clear and start over.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {(productsQuery.data?.items ?? []).map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                onAddToCart={() => void addFromCard(p, 'cart')}
                onBuyNow={() => void addFromCard(p, 'buy')}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
