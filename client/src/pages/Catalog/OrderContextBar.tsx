import { Link } from 'react-router-dom'
import { Pencil, X } from 'lucide-react'
import { useCart } from '@/context/CartContext'

/** Compact PO-lane strip — place directly above the product grid. */
export function OrderContextBar() {
  const { orderContext, clearOrderContext, itemCount } = useCart()

  if (!orderContext) {
    return (
      <div className="rounded-lg border border-dashed border-suzuki-line bg-suzuki-mist/60 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-suzuki-navy">No active order lane</p>
          <p className="text-xs text-suzuki-mute mt-0.5">
            Choose source, delivery type, and supplier to load matching products.
          </p>
        </div>
        <Link
          to="/order/start"
          className="rounded-lg bg-suzuki-red text-white text-xs font-bold px-4 py-2 shrink-0"
        >
          Start order
        </Link>
      </div>
    )
  }

  const chips = [
    { label: 'Vendor', value: orderContext.vendorCode },
    { label: 'Source', value: orderContext.materialSourceCode },
    { label: 'Delivery', value: `${orderContext.deliveryTypeCode}` },
    { label: 'Supplier', value: orderContext.supplierCode }
  ]

  return (
    <div className="rounded-lg border border-suzuki-line bg-white px-3 py-2.5 flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-suzuki-mute">Active order</span>
          {chips.map((c) => (
            <span
              key={c.label}
              className="inline-flex items-center gap-1 rounded-md bg-suzuki-mist px-2 py-1 text-xs text-suzuki-navy"
            >
              <span className="text-suzuki-mute font-semibold">{c.label}</span>
              <span className="font-bold">{c.value}</span>
            </span>
          ))}
          <span className="text-xs text-suzuki-mute truncate max-w-[14rem]" title={orderContext.deliveryTypeName}>
            {orderContext.deliveryTypeName}
          </span>
          {itemCount > 0 && (
            <span className="text-xs font-semibold text-suzuki-blue">{itemCount} in cart</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Link
          to="/order/start"
          className="inline-flex items-center gap-1 rounded-md bg-suzuki-ice text-suzuki-navy text-xs font-bold px-2.5 py-1.5 hover:bg-sky-100"
        >
          <Pencil size={12} /> Change
        </Link>
        <button
          type="button"
          onClick={() => {
            if (itemCount > 0 && !window.confirm('Clear this order lane and cart?')) return
            clearOrderContext()
          }}
          className="inline-flex items-center gap-1 rounded-md border border-suzuki-line text-suzuki-mute text-xs font-bold px-2.5 py-1.5 hover:bg-suzuki-mist"
        >
          <X size={12} /> Clear
        </button>
      </div>
    </div>
  )
}
