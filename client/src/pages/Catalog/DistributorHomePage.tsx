import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { api } from '@/api/axiosClient'
import { useCart } from '@/context/CartContext'
import { ProductCard } from './ProductCard'
import type { CatalogBanner, CatalogProductCard } from './catalogTypes'

interface Paged<T> {
  items: T[]
  totalCount: number
}

/**
 * Distributor landing — matches Oil Landing design.
 * Header / category banners + products all come from Super Admin My Shop uploads.
 */
export default function DistributorHomePage() {
  const navigate = useNavigate()
  const { addItem } = useCart()
  const [slide, setSlide] = useState(0)

  const bannersQuery = useQuery({
    queryKey: ['catalog-banners', 'Header'],
    queryFn: async () => (await api.get<CatalogBanner[]>('/catalog/banners', { params: { type: 'Header' } })).data
  })

  const categoryBannersQuery = useQuery({
    queryKey: ['catalog-banners', 'Category'],
    queryFn: async () => (await api.get<CatalogBanner[]>('/catalog/banners', { params: { type: 'Category' } })).data
  })

  const productsQuery = useQuery({
    queryKey: ['catalog-products', 'all-home'],
    queryFn: async () =>
      (await api.get<Paged<CatalogProductCard>>('/catalog/products', {
        params: { pageSize: 9 }
      })).data
  })

  const banners = bannersQuery.data ?? []
  const categoryBanners = categoryBannersQuery.data ?? []

  useEffect(() => {
    if (banners.length <= 1) return
    const t = setInterval(() => setSlide((s) => (s + 1) % banners.length), 5500)
    return () => clearInterval(t)
  }, [banners.length])

  useEffect(() => {
    setSlide(0)
  }, [banners.length])

  const activeBanner = banners[slide] ?? banners[0]
  const motorCarBanner =
    categoryBanners.find((b) => /motor\s*car/i.test(`${b.categoryName} ${b.bannerName ?? ''}`)) ??
    categoryBanners.find((b) => /car/i.test(b.categoryName))
  const motorBikeBanner =
    categoryBanners.find((b) => /motor\s*bike|bike/i.test(`${b.categoryName} ${b.bannerName ?? ''}`))

  const addFromCard = async (product: CatalogProductCard, mode: 'cart' | 'buy') => {
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
        unitPrice: variant.distributorPrice || variant.retailPrice || product.displayPrice
      },
      1
    )

    if (mode === 'buy') navigate('/cart')
  }

  const heroHref = activeBanner?.productId
    ? `/catalog/products/${activeBanner.productId}`
    : undefined

  return (
    <div className="space-y-7 pb-8">
      {/* Header banner carousel — image creatives from Super Admin */}
      <section className="relative rounded-2xl overflow-hidden min-h-[200px] sm:min-h-[260px] lg:min-h-[320px] bg-[#0b1f4a] shadow-card">
        {activeBanner?.imageUrl ? (
          heroHref ? (
            <Link to={heroHref} className="absolute inset-0 block">
              <img
                src={activeBanner.imageUrl}
                alt={activeBanner.bannerName || activeBanner.productName || 'Promotion'}
                className="h-full w-full object-cover"
              />
            </Link>
          ) : (
            <img
              src={activeBanner.imageUrl}
              alt={activeBanner.bannerName || activeBanner.productName || 'Promotion'}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )
        ) : (
          <div className="absolute inset-0 flex flex-col justify-center px-8 bg-gradient-to-r from-[#0b1f4a] via-[#123a7a] to-[#1a56b0]">
            <p className="text-white/80 text-sm font-semibold">Header Banner</p>
            <p className="text-white text-xl font-extrabold mt-1">
              Upload header banners in My Shop (Super Admin)
            </p>
          </div>
        )}

        {banners.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                aria-label={`Slide ${i + 1}`}
                onClick={() => setSlide(i)}
                className={`h-2.5 w-2.5 rounded-full transition-colors ${
                  i === slide ? 'bg-white' : 'bg-white/45'
                }`}
              />
            ))}
          </div>
        )}
      </section>

      {/* Lubricant for — category banners from Super Admin */}
      <section>
        <h2 className="text-xl sm:text-2xl font-extrabold text-suzuki-navy mb-4">Lubricant for</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CategoryTile title="Motor Car" imageUrl={motorCarBanner?.imageUrl} to="/catalog/motor-car" />
          <CategoryTile title="Motor Bike" imageUrl={motorBikeBanner?.imageUrl} to="/catalog/motor-bike" />
        </div>
      </section>

      {/* All Lubricant — published products */}
      <section>
        <div className="flex items-center justify-between mb-4 gap-3">
          <h2 className="text-xl sm:text-2xl font-extrabold text-suzuki-navy">All Lubricant</h2>
          <Link to="/catalog/all" className="text-sm font-bold text-suzuki-blue hover:underline shrink-0">
            View all
          </Link>
        </div>
        {productsQuery.isLoading ? (
          <p className="text-sm text-suzuki-mute">Loading products…</p>
        ) : (productsQuery.data?.items.length ?? 0) === 0 ? (
          <p className="text-sm text-suzuki-mute">
            No published products yet. Super Admin can add them under My Shop → Product List.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
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

function CategoryTile({
  title,
  imageUrl,
  to
}: {
  title: string
  imageUrl?: string | null
  to: string
}) {
  return (
    <Link
      to={to}
      className="group relative rounded-2xl overflow-hidden min-h-[170px] sm:min-h-[210px] border border-suzuki-line shadow-card bg-slate-900"
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={title}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-700 to-sky-900" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
      <div className="relative z-10 h-full min-h-[170px] sm:min-h-[210px] p-5 flex flex-col justify-between">
        <div className="self-end rounded-md bg-white/90 p-1.5 text-suzuki-navy shadow-sm">
          <ExternalLink size={15} />
        </div>
        <h3 className="text-2xl font-black text-white drop-shadow-sm">{title}</h3>
      </div>
    </Link>
  )
}
