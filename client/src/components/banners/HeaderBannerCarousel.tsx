import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/axiosClient'
import type { CatalogBanner } from '@/pages/Catalog/catalogTypes'

/** Header banner carousel — fixed 16:5 frame for clean layout. */
export default function HeaderBannerCarousel({
  className = '',
  emptyHint = 'Upload header banners under Banner & Promotions (Super Admin)',
  showEmpty = true
}: {
  className?: string
  emptyHint?: string
  /** When false, render nothing if there are no banners with images. */
  showEmpty?: boolean
}) {
  const [slide, setSlide] = useState(0)

  const bannersQuery = useQuery({
    queryKey: ['catalog-banners', 'Header'],
    queryFn: async () => (await api.get<CatalogBanner[]>('/catalog/banners', { params: { type: 'Header' } })).data
  })

  const banners = (bannersQuery.data ?? []).filter((b) => !!b.imageUrl)

  useEffect(() => {
    if (banners.length <= 1) return
    const t = setInterval(() => setSlide((s) => (s + 1) % banners.length), 5500)
    return () => clearInterval(t)
  }, [banners.length])

  useEffect(() => {
    setSlide(0)
  }, [banners.length])

  if (!bannersQuery.isLoading && banners.length === 0 && !showEmpty) return null

  const activeBanner = banners[slide] ?? banners[0]
  const heroHref = activeBanner?.productId
    ? `/catalog/products/${activeBanner.productId}`
    : undefined

  return (
    <section
      className={`relative w-full overflow-hidden rounded-2xl bg-[#0b1f4a] shadow-card aspect-[16/5] max-h-[240px] sm:max-h-[280px] lg:max-h-[320px] ${className}`}
    >
      {activeBanner?.imageUrl ? (
        heroHref ? (
          <Link to={heroHref} className="absolute inset-0 block">
            <img
              src={activeBanner.imageUrl}
              alt={activeBanner.bannerName || activeBanner.productName || 'Banner'}
              className="h-full w-full object-cover"
            />
          </Link>
        ) : (
          <img
            src={activeBanner.imageUrl}
            alt={activeBanner.bannerName || activeBanner.productName || 'Banner'}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )
      ) : showEmpty ? (
        <div className="absolute inset-0 flex flex-col justify-center px-6 bg-gradient-to-r from-[#0b1f4a] via-[#123a7a] to-[#1a56b0]">
          <p className="text-white/80 text-xs font-semibold">Header Banner</p>
          <p className="text-white text-sm font-extrabold mt-0.5">{emptyHint}</p>
        </div>
      ) : null}

      {banners.length > 1 && (
        <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              aria-label={`Slide ${i + 1}`}
              onClick={() => setSlide(i)}
              className={`h-1.5 w-1.5 rounded-full transition-colors ${
                i === slide ? 'bg-white' : 'bg-white/45'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  )
}
