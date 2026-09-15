import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Minus, Plus } from 'lucide-react'
import { api } from '@/api/axiosClient'
import { useAuth } from '@/context/AuthContext'
import { useCart } from '@/context/CartContext'
import { sameMaterialSource } from '@/lib/orderLaneSource'
import { formatPrice, packSummary, ProductTitle, type CatalogProductDetail } from './catalogTypes'
import PlaceholderImage from '@/components/ui/PlaceholderImage'
import clsx from 'clsx'

export default function CatalogProductPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { role } = useAuth()
  const { addItem, orderContext } = useCart()
  const [qty, setQty] = useState(1)
  const [variantId, setVariantId] = useState<string | null>(null)
  const [laneError, setLaneError] = useState<string | null>(null)

  const detailQuery = useQuery({
    queryKey: ['catalog-product', id],
    enabled: !!id,
    queryFn: async () => (await api.get<CatalogProductDetail>(`/catalog/products/${id}`)).data
  })

  const needsLane = role === 'Distributor' || role === 'Retailer'

  useEffect(() => {
    if (needsLane && !orderContext) {
      navigate('/order/start', { replace: true })
    }
  }, [needsLane, orderContext, navigate])

  const product = detailQuery.data
  const selected =
    product?.variants.find((v) => v.id === variantId) ??
    product?.variants.find((v) => v.inStock) ??
    product?.variants[0]

  const retailPrice = selected?.retailPrice ?? 0
  const cartUnitPrice = useMemo(() => {
    if (!selected) return 0
    if (role === 'Retailer') return selected.retailPrice || 0
    const isDistributorRole = role === 'Distributor' || role === 'SuperAdmin' || role === 'Admin'
    return isDistributorRole
      ? (selected.distributorPrice || selected.retailPrice || 0)
      : (selected.retailPrice || 0)
  }, [selected, role])

  const total = retailPrice * qty
  const pieces = selected?.packQuantity ?? product?.packQuantity ?? selected?.unitQuantity ?? null
  const unitLabel = selected?.unitLabel ?? product?.unitLabel
  const pack = packSummary({
    packLabel: selected?.typeName,
    packQuantity: pieces,
    unitLabel,
    unitValue: selected?.unitValue ?? product?.unitValue,
    unitType: selected?.unitType ?? product?.unitType
  })
  const pricePerPiece = pieces && pieces > 0 && retailPrice
    ? retailPrice / pieces
    : null

  const add = (mode: 'cart' | 'buy') => {
    if (!product || !selected) return
    setLaneError(null)
    if (needsLane && !orderContext) {
      navigate('/order/start')
      return
    }
    if (orderContext && product.sourceCode) {
      if (!sameMaterialSource(orderContext.materialSourceCode, product.sourceCode)) {
        setLaneError(
          `This product is source ${product.sourceCode}, but your order lane is ${orderContext.materialSourceCode}. Change Start Order to ${product.sourceCode}, or open a matching product.`
        )
        return
      }
      if (
        product.deliveryTypeCode
        && orderContext.deliveryTypeCode
        && product.deliveryTypeCode.toLowerCase() !== orderContext.deliveryTypeCode.toLowerCase()
      ) {
        setLaneError(
          `This product is delivery type ${product.deliveryTypeCode}, but your order lane is ${orderContext.deliveryTypeCode}. Start a separate order for that delivery type.`
        )
        return
      }
      if (
        product.supplierCode
        && orderContext.supplierCode
        && product.supplierCode.toLowerCase() !== orderContext.supplierCode.toLowerCase()
      ) {
        setLaneError(
          `This product is supplier ${product.supplierCode}, but your order lane is ${orderContext.supplierCode}. Start a separate order for that supplier.`
        )
        return
      }
    }
    addItem(
      {
        productId: product.id,
        variantId: selected.id,
        sku: product.sku,
        name: product.name,
        description: product.description,
        categoryName: product.categoryName,
        imageUrl: product.primaryImageUrl,
        packLabel: pack || selected.typeName,
        packQuantity: product.packQuantity ?? selected.packQuantity ?? null,
        unitValue: product.unitValue ?? selected.unitValue ?? null,
        unitType: product.unitType ?? selected.unitType ?? null,
        unitPrice: cartUnitPrice,
        gstPercent: selected.gstPercent != null ? Number(selected.gstPercent) : undefined,
        fedPercent: selected.fedPercent != null ? Number(selected.fedPercent) : undefined
      },
      qty
    )
    if (mode === 'buy') navigate('/cart')
  }

  if (detailQuery.isLoading) {
    return <p className="text-sm text-suzuki-mute">Loading product…</p>
  }

  if (!product) {
    return <p className="text-sm text-suzuki-red">Product not found.</p>
  }

  return (
    <div className="space-y-6 pb-10">
      <section className="bg-white rounded-2xl border border-suzuki-line shadow-card p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
        <div className="rounded-xl bg-gradient-to-b from-slate-50 to-white border border-suzuki-line aspect-square overflow-hidden max-h-[360px] mx-auto w-full">
          <PlaceholderImage
            src={product.primaryImageUrl}
            alt={product.name}
            className="h-full w-full"
            imgClassName="h-full w-full object-contain p-5"
          />
        </div>

        <div className="flex flex-col gap-4">
          {laneError && (
            <div className="rounded-lg border border-suzuki-red/30 bg-red-50 px-3 py-2 text-sm text-suzuki-red">
              {laneError}
              <button
                type="button"
                className="ml-2 font-bold underline"
                onClick={() => navigate('/order/start')}
              >
                Change Start Order
              </button>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-suzuki-mute mb-1">
              {product.categoryName || product.category}
            </p>
            <h1 className="text-xl sm:text-2xl font-extrabold text-suzuki-navy">
              <ProductTitle name={product.name} />
            </h1>
            {(product.description || product.bio) && (
              <p className="mt-1 text-sm text-suzuki-navy/80">{product.description || product.bio}</p>
            )}
            <p className="mt-1 text-xs text-suzuki-mute font-mono">{product.sku}</p>
          </div>

          <div className="rounded-xl border border-suzuki-line bg-suzuki-mist/40 p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Info label="Unit size" value={unitLabel || '—'} />
            <Info label="Pieces / pack" value={pieces != null ? `${pieces}` : '—'} />
            <Info label="Pack contents" value={pack || '—'} />
            <Info
              label="Order unit"
              value="Carton / pack"
            />
            {product.viscosity && product.viscosity !== '-' && (
              <Info label="Viscosity" value={product.viscosity} />
            )}
            {product.apiStandard && product.apiStandard !== '-' && (
              <Info label="API" value={product.apiStandard} />
            )}
            {product.modelCode && <Info label="Model" value={product.modelCode} />}
            {product.sourceCode && <Info label="Source" value={product.sourceCode} />}
          </div>

          {product.variants.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-suzuki-mute mb-2">Pack option</p>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    disabled={!v.inStock}
                    onClick={() => setVariantId(v.id)}
                    className={clsx(
                      'px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors',
                      selected?.id === v.id
                        ? 'bg-suzuki-red text-white border-suzuki-red'
                        : 'bg-white text-suzuki-navy border-suzuki-line hover:bg-suzuki-mist',
                      !v.inStock && 'opacity-40 cursor-not-allowed'
                    )}
                  >
                    {v.typeName}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-suzuki-line p-4 space-y-1">
            <p className="text-2xl font-extrabold text-suzuki-red">{formatPrice(retailPrice)}</p>
            <p className="text-xs font-semibold text-suzuki-mute uppercase tracking-wide">Price per pack</p>
            {pricePerPiece != null && (
              <p className="text-sm text-suzuki-navy">
                {formatPrice(pricePerPiece)} <span className="text-suzuki-mute">per piece</span>
                {unitLabel ? <span className="text-suzuki-mute"> · each {unitLabel}</span> : null}
              </p>
            )}
            {pieces != null && pieces > 0 && (
              <p className="text-xs text-suzuki-mute pt-1">
                This pack contains {pieces} piece{pieces === 1 ? '' : 's'}
                {unitLabel ? ` of ${unitLabel}` : ''}.
              </p>
            )}
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm font-bold text-suzuki-navy">Packs</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="h-9 w-9 rounded-lg bg-sky-100 text-suzuki-navy inline-flex items-center justify-center"
              >
                <Minus size={16} />
              </button>
              <span className="min-w-[2.5rem] text-center text-lg font-black text-suzuki-red">{qty}</span>
              <button
                type="button"
                onClick={() => setQty((q) => q + 1)}
                className="h-9 w-9 rounded-lg bg-sky-100 text-suzuki-navy inline-flex items-center justify-center"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          <p className="text-base font-extrabold text-suzuki-navy">
            Total: <span className="text-suzuki-red">{formatPrice(total)}</span>
            <span className="ml-2 text-xs font-semibold text-suzuki-mute">
              ({qty} pack{qty === 1 ? '' : 's'})
            </span>
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={() => add('cart')}
              className="rounded-xl bg-sky-100 text-suzuki-navy font-extrabold py-3 hover:bg-sky-200 transition-colors"
            >
              ADD TO CART
            </button>
            <button
              type="button"
              onClick={() => add('buy')}
              className="rounded-xl bg-suzuki-red text-white font-extrabold py-3 hover:bg-red-700 transition-colors"
            >
              BUY NOW
            </button>
          </div>
        </div>
      </section>

      {(product.bio || product.description) && (
        <section className="max-w-3xl">
          <h2 className="text-lg font-extrabold text-suzuki-navy">About this product</h2>
          <p className="mt-2 text-sm text-suzuki-navy/80 leading-relaxed">
            {product.bio || product.description}
          </p>
        </section>
      )}

      {product.sectionImageUrls.length > 0 && (
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {product.sectionImageUrls.map((url, i) => (
            <PlaceholderImage
              key={`${url}-${i}`}
              src={url}
              alt=""
              className="rounded-2xl border border-suzuki-line shadow-card aspect-video bg-suzuki-mist"
              imgClassName="h-full w-full object-cover"
            />
          ))}
        </section>
      )}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-suzuki-mute">{label}</div>
      <div className="font-semibold text-suzuki-navy mt-0.5">{value}</div>
    </div>
  )
}
