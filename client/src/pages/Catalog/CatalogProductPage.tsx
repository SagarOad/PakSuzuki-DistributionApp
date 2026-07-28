import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Minus, Plus } from 'lucide-react'
import { api } from '@/api/axiosClient'
import { useAuth } from '@/context/AuthContext'
import { useCart } from '@/context/CartContext'
import { formatPrice, ProductTitle, type CatalogProductDetail } from './catalogTypes'
import clsx from 'clsx'

export default function CatalogProductPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { role } = useAuth()
  const { addItem } = useCart()
  const [qty, setQty] = useState(1)
  const [variantId, setVariantId] = useState<string | null>(null)

  const detailQuery = useQuery({
    queryKey: ['catalog-product', id],
    enabled: !!id,
    queryFn: async () => (await api.get<CatalogProductDetail>(`/catalog/products/${id}`)).data
  })

  const product = detailQuery.data
  const selected =
    product?.variants.find((v) => v.id === variantId) ??
    product?.variants.find((v) => v.inStock) ??
    product?.variants[0]

  const unitPrice = useMemo(() => {
    if (!selected) return 0
    return role === 'Distributor' || role === 'SuperAdmin' || role === 'Admin'
      ? selected.distributorPrice || selected.retailPrice
      : selected.retailPrice
  }, [selected, role])

  const total = unitPrice * qty

  const add = (mode: 'cart' | 'buy') => {
    if (!product || !selected) return
    addItem(
      {
        productId: product.id,
        variantId: selected.id,
        sku: product.sku,
        name: product.name,
        description: product.description,
        categoryName: product.categoryName,
        imageUrl: product.primaryImageUrl,
        packLabel: selected.typeName,
        unitPrice
      },
      qty
    )
    // Buy Now → Cart first; Add to Cart stays on page (floating cart + badge show).
    if (mode === 'buy') navigate('/cart')
  }

  if (detailQuery.isLoading) {
    return <p className="text-sm text-suzuki-mute">Loading product…</p>
  }

  if (!product) {
    return <p className="text-sm text-suzuki-red">Product not found.</p>
  }

  return (
    <div className="space-y-8 pb-10">
      <section className="bg-white rounded-2xl border border-suzuki-line shadow-card p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl bg-gradient-to-b from-slate-100 to-slate-50 aspect-square flex items-center justify-center overflow-hidden">
          {product.primaryImageUrl ? (
            <img src={product.primaryImageUrl} alt={product.name} className="h-full w-full object-contain p-6" />
          ) : (
            <span className="text-sm text-suzuki-mute">No image</span>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-suzuki-navy">
              <ProductTitle name={product.name} />
            </h1>
            <p className="mt-1 text-suzuki-navy font-medium">{product.description || product.bio || 'Engine Oil'}</p>
            <p className="mt-2 text-sm text-suzuki-mute">
              Category: {product.categoryName || product.category}{' '}
              <span>|</span>{' '}
              <span className="text-suzuki-red font-bold">{formatPrice(unitPrice)}/Piece</span>
            </p>
          </div>

          {product.variants.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {product.variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  disabled={!v.inStock}
                  onClick={() => setVariantId(v.id)}
                  className={clsx(
                    'px-4 py-2 rounded-full text-sm font-bold border transition-colors',
                    (selected?.id === v.id)
                      ? 'bg-suzuki-red text-white border-suzuki-red'
                      : 'bg-white text-suzuki-navy border-suzuki-line hover:bg-suzuki-mist',
                    !v.inStock && 'opacity-40 cursor-not-allowed'
                  )}
                >
                  {v.typeName}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-4">
            <span className="text-sm font-bold text-suzuki-navy">Unit Quantity</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="h-10 w-10 rounded-lg bg-sky-100 text-suzuki-navy inline-flex items-center justify-center"
              >
                <Minus size={16} />
              </button>
              <span className="min-w-[3rem] text-center text-xl font-black text-suzuki-red">{qty}</span>
              <button
                type="button"
                onClick={() => setQty((q) => q + 1)}
                className="h-10 w-10 rounded-lg bg-sky-100 text-suzuki-navy inline-flex items-center justify-center"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          <p className="text-lg font-black text-suzuki-red">
            Total Amount: {formatPrice(total)}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={() => add('cart')}
              className="rounded-xl bg-sky-100 text-suzuki-navy font-extrabold py-3.5 hover:bg-sky-200 transition-colors"
            >
              ADD TO CART
            </button>
            <button
              type="button"
              onClick={() => add('buy')}
              className="rounded-xl bg-suzuki-red text-white font-extrabold py-3.5 hover:bg-red-700 transition-colors"
            >
              BUY NOW
            </button>
          </div>
        </div>
      </section>

      {(product.bio || product.description) && (
        <section className="max-w-3xl">
          <h2 className="text-xl sm:text-2xl font-extrabold text-suzuki-navy">
            Ultimate Protection, Maximum Efficiency
          </h2>
          <p className="mt-3 text-sm sm:text-base text-suzuki-navy/80 leading-relaxed">
            {product.bio || product.description}
          </p>
        </section>
      )}

      {product.sectionImageUrls.length > 0 && (
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {product.sectionImageUrls.map((url, i) => (
            <div key={`${url}-${i}`} className="rounded-2xl overflow-hidden border border-suzuki-line shadow-card aspect-video bg-suzuki-mist">
              <img src={url} alt="" className="h-full w-full object-cover" />
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
