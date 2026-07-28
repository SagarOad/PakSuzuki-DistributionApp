import { Link } from 'react-router-dom'
import { formatPrice, ProductTitle, type CatalogProductCard } from './catalogTypes'

interface Props {
  product: CatalogProductCard
  onAddToCart?: () => void
  onBuyNow?: () => void
}

export function ProductCard({ product, onAddToCart, onBuyNow }: Props) {
  return (
    <article className="bg-white rounded-2xl border border-suzuki-line shadow-card overflow-hidden flex flex-col">
      <Link to={`/catalog/products/${product.id}`} className="block aspect-[4/3] bg-gradient-to-b from-slate-100 to-slate-50 p-4">
        {product.primaryImageUrl ? (
          <img src={product.primaryImageUrl} alt={product.name} className="h-full w-full object-contain" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-xs font-semibold text-suzuki-mute">
            No image
          </div>
        )}
      </Link>

      <div className="p-4 flex flex-col gap-2 flex-1">
        <Link to={`/catalog/products/${product.id}`}>
          <h3 className="text-base font-extrabold text-suzuki-navy leading-snug">
            <ProductTitle name={product.name} />
          </h3>
        </Link>
        <p className="text-sm text-suzuki-navy/80 line-clamp-2">
          {product.description || 'Engine Oil'}
        </p>
        <p className="text-sm text-suzuki-mute">
          Category: {product.categoryName || product.category}{' '}
          <span className="text-suzuki-mute">|</span>{' '}
          <span className="text-suzuki-red font-bold">{formatPrice(product.displayPrice)}/Piece</span>
        </p>

        <div className="mt-auto pt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onAddToCart}
            className="rounded-lg bg-sky-100 text-suzuki-navy text-xs font-extrabold tracking-wide py-2.5 hover:bg-sky-200 transition-colors"
          >
            ADD TO CART
          </button>
          <button
            type="button"
            onClick={onBuyNow}
            className="rounded-lg bg-suzuki-red text-white text-xs font-extrabold tracking-wide py-2.5 hover:bg-red-700 transition-colors"
          >
            BUY NOW
          </button>
        </div>
      </div>
    </article>
  )
}
