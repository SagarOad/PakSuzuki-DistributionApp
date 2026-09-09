import { Link } from 'react-router-dom'
import { formatPrice, packSummary, ProductTitle, type CatalogProductCard } from './catalogTypes'
import PlaceholderImage from '@/components/ui/PlaceholderImage'

interface Props {
  product: CatalogProductCard
  onAddToCart?: () => void
  onBuyNow?: () => void
}

export function ProductCard({ product, onAddToCart, onBuyNow }: Props) {
  const pack = packSummary(product)
  const unit = product.unitLabel
  const pieces = product.packQuantity

  return (
    <article className="bg-white rounded-xl border border-suzuki-line shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col h-full">
      <Link
        to={`/catalog/products/${product.id}`}
        className="block aspect-[5/3] bg-gradient-to-b from-slate-50 to-white border-b border-suzuki-line"
      >
        <PlaceholderImage
          src={product.primaryImageUrl}
          alt={product.name}
          className="h-full w-full"
          imgClassName="h-full w-full object-contain p-3"
        />
      </Link>

      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <Link to={`/catalog/products/${product.id}`}>
          <h3 className="text-sm font-bold text-suzuki-navy leading-snug line-clamp-2">
            <ProductTitle name={product.name} />
          </h3>
        </Link>

        <p className="text-xs text-suzuki-mute line-clamp-1">
          {product.categoryName || product.category}
          {unit ? ` · ${unit}` : ''}
        </p>

        {pieces != null && pieces > 0 && (
          <p className="text-[11px] text-suzuki-mute">
            Pack: <span className="font-semibold text-suzuki-navy">{pieces} pcs</span>
            {unit ? <span> × {unit}</span> : null}
          </p>
        )}

        <div className="mt-1">
          <p className="text-sm font-extrabold text-suzuki-red">{formatPrice(product.displayPrice)}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-suzuki-mute">
            Per pack{pack ? ` · ${pack}` : ''}
          </p>
        </div>

        <div className="mt-auto pt-2 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={onAddToCart}
            className="rounded-md bg-sky-50 text-suzuki-navy text-[11px] font-bold tracking-wide py-2 hover:bg-sky-100 transition-colors"
          >
            ADD TO CART
          </button>
          <button
            type="button"
            onClick={onBuyNow}
            className="rounded-md bg-suzuki-red text-white text-[11px] font-bold tracking-wide py-2 hover:bg-red-700 transition-colors"
          >
            BUY NOW
          </button>
        </div>
      </div>
    </article>
  )
}
