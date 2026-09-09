import { Link, useNavigate } from 'react-router-dom'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { useCart } from '@/context/CartContext'
import { useOrderTaxEstimate } from '@/hooks/useOrderTaxEstimate'
import { ProductTitle } from './catalogTypes'
import PlaceholderImage from '@/components/ui/PlaceholderImage'

function formatRs(n: number) {
  return `Rs.${Number(n || 0).toLocaleString('en-PK')}`
}

function formatCartDate(d = new Date()) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Spt', 'Oct', 'Nov', 'Dec']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

export default function CartPage() {
  const { items, itemCount, setQuantity, removeItem, originatingRetailerOrderId } = useCart()
  const { subTotal, gstPercent, gstAmount, fedAmount, whtPercent, whtAmount, estimatedTotal } =
    useOrderTaxEstimate(items)
  const navigate = useNavigate()

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-suzuki-line shadow-card p-10 text-center space-y-3">
        <h1 className="text-2xl font-extrabold text-suzuki-navy">Cart (00)</h1>
        <p className="text-sm text-suzuki-mute">Your cart is empty.</p>
        <Link to="/order/start" className="inline-flex text-sm font-bold text-suzuki-blue hover:underline">
          Browse lubricants
        </Link>
      </div>
    )
  }

  const draftNumber = `CART-${String(itemCount).padStart(2, '0')}${items[0]?.sku?.slice(-4) || '0000'}`

  return (
    <div className="space-y-4 pb-8">
      <h1 className="text-2xl font-extrabold text-suzuki-navy">
        Cart ({String(items.length).padStart(2, '0')})
      </h1>

      {originatingRetailerOrderId && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-extrabold">Origin: retailer order. </span>
          This will place a normal distributor → manufacturer order linked to that retailer order
          (<span className="font-mono text-xs"> ({originatingRetailerOrderId.slice(0, 8)}…)</span>.
          Edit quantities below, then review and place your order.
        </div>
      )}

      <div className="bg-white rounded-2xl border border-suzuki-line shadow-card overflow-hidden">
        <div className="px-5 sm:px-6 pt-5 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <p className="font-bold text-suzuki-navy">
            Order Number:{' '}
            <span className="text-suzuki-red">{draftNumber}</span>
          </p>
          <p className="font-bold text-suzuki-navy">
            Order Date:{' '}
            <span className="text-suzuki-red">{formatCartDate()}</span>
          </p>
        </div>

        <div className="mt-3 divide-y divide-suzuki-line">
          {items.map((item) => (
            <div
              key={`${item.productId}-${item.variantId}`}
              className="px-5 sm:px-6 py-5 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-center"
            >
              <div className="flex gap-4 min-w-0">
                <PlaceholderImage
                  src={item.imageUrl}
                  alt=""
                  className="h-[72px] w-[72px] rounded-xl bg-slate-100 shrink-0"
                  imgClassName="h-full w-full object-contain p-1"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/catalog/products/${item.productId}`}
                    className="font-extrabold text-suzuki-red text-base leading-snug"
                  >
                    <ProductTitle name={item.name} className="text-suzuki-red" />
                  </Link>
                  <p className="text-sm text-suzuki-navy mt-0.5">
                    {item.description || 'Fully Synthetic Engine Oil'}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
                    <p className="text-sm font-bold text-suzuki-navy">
                      Selected Pack:{' '}
                      <span className="text-suzuki-red">{item.packLabel}</span>
                    </p>

                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-suzuki-navy">Unit</span>
                      <button
                        type="button"
                        className="h-8 w-8 rounded-full bg-sky-100 text-suzuki-navy inline-flex items-center justify-center"
                        onClick={() => setQuantity(item.productId, item.variantId, item.quantity - 1)}
                        aria-label="Decrease"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="min-w-[2.5rem] text-center text-base font-extrabold text-suzuki-red">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        className="h-8 w-8 rounded-full bg-sky-100 text-suzuki-navy inline-flex items-center justify-center"
                        onClick={() => setQuantity(item.productId, item.variantId, item.quantity + 1)}
                        aria-label="Increase"
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    <p className="text-base font-extrabold text-suzuki-navy">
                      {formatRs(item.unitPrice * item.quantity)}
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => removeItem(item.productId, item.variantId)}
                className="justify-self-end h-10 w-10 rounded-lg border-2 border-suzuki-red/70 text-suzuki-red inline-flex items-center justify-center hover:bg-red-50"
                aria-label="Remove item"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>

        <div className="px-5 sm:px-6 py-5 border-t border-suzuki-line flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 text-sm min-w-[240px]">
            <p className="font-bold text-suzuki-navy flex justify-between gap-6">
              <span>Subtotal</span>
              <span className="text-suzuki-red">{formatRs(subTotal)}</span>
            </p>
            <p className="font-semibold text-suzuki-mute flex justify-between gap-6">
              <span>GST TAX ({gstPercent}%)</span>
              <span className="text-suzuki-navy">{formatRs(gstAmount)}</span>
            </p>
            {fedAmount > 0 && (
              <p className="font-semibold text-suzuki-mute flex justify-between gap-6">
                <span>FED</span>
                <span className="text-suzuki-navy">{formatRs(fedAmount)}</span>
              </p>
            )}
            <p className="font-semibold text-suzuki-mute flex justify-between gap-6">
              <span>WHT ({whtPercent}%)</span>
              <span className="text-suzuki-navy">{formatRs(whtAmount)}</span>
            </p>
            <p className="text-lg font-extrabold text-suzuki-navy flex justify-between gap-6 pt-1">
              <span>Total Amount</span>
              <span className="text-suzuki-red">{formatRs(estimatedTotal)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/checkout/summary')}
            className="rounded-xl bg-suzuki-red text-white font-extrabold px-10 py-3.5 hover:bg-red-700 transition-colors"
          >
            Review & Continue
          </button>
        </div>
      </div>
    </div>
  )
}
