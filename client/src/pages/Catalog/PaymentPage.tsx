import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { ShoppingBasket, Wallet } from 'lucide-react'
import { api } from '@/api/axiosClient'
import { useAuth } from '@/context/AuthContext'
import { useCart, type OrderContext } from '@/context/CartContext'
import type { CatalogProductDetail } from './catalogTypes'

/** Distributor: Haball placeholder until gateway is live. Retailer: place order to distributor. */
export default function PaymentPage() {
  const navigate = useNavigate()
  const { role } = useAuth()
  const { items, clear, originatingRetailerOrderId, orderContext, setOrderContext } = useCart()
  const isRetailer = role === 'Retailer'
  const [error, setError] = useState<string | null>(null)
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null)
  const [placedMessage, setPlacedMessage] = useState<string | null>(null)

  const resolveLaneFromCart = async (): Promise<OrderContext> => {
    const first = items[0]
    if (!first) throw new Error('Cart is empty')

    const detail = (await api.get<CatalogProductDetail>(`/catalog/products/${first.productId}`)).data
    const source = detail.sourceCode?.trim()
    const delivery = detail.deliveryTypeCode?.trim()
    const supplier = detail.supplierCode?.trim()
    if (!source || !delivery || !supplier) {
      throw new Error('Product is missing source / delivery type / supplier. Check master catalog data.')
    }

    const next: OrderContext = {
      vendorCode: orderContext?.vendorCode || 'PSMC',
      vendorName: orderContext?.vendorName || 'Pak Suzuki Motor Company',
      materialSourceCode: source,
      deliveryTypeCode: delivery,
      deliveryTypeName: detail.deliveryTypeName || delivery,
      supplierCode: supplier,
      supplierName: supplier
    }

    // Keep cart items; only correct the PO lane to match products.
    setOrderContext(next, { clearCart: false })
    return next
  }

  const placeOrder = useMutation({
    mutationFn: async () => {
      if (items.length === 0) throw new Error('Cart is empty')

      const itemsBody = items.map((i) => ({
        productId: i.productId,
        productVariantId: i.variantId || null,
        quantity: i.quantity,
        unit: i.unit || 'Carton'
      }))

      if (isRetailer) {
        if (!orderContext) throw new Error('Start an order and choose source, delivery type, and supplier first.')
        const { data } = await api.post<{ id: string; orderNumber?: string; message?: string }>('/orders', {
          items: itemsBody,
          vendorCode: orderContext.vendorCode,
          materialSourceCode: orderContext.materialSourceCode,
          deliveryTypeCode: orderContext.deliveryTypeCode,
          deliveryTypeName: orderContext.deliveryTypeName,
          supplierCode: orderContext.supplierCode
        })
        return data
      }

      // Manufacturer order: lane is taken from cart products (and origin order on API).
      const lane = await resolveLaneFromCart()
      const { data } = await api.post<{ id: string; orderNumber?: string; message?: string }>('/orders/distributor-direct', {
        items: itemsBody,
        originatingRetailerOrderId: originatingRetailerOrderId || null,
        vendorCode: lane.vendorCode,
        materialSourceCode: lane.materialSourceCode,
        deliveryTypeCode: lane.deliveryTypeCode,
        deliveryTypeName: lane.deliveryTypeName,
        supplierCode: lane.supplierCode
      })
      return data
    },
    onSuccess: (data) => {
      clear()
      setPlacedOrderId(data.id)
      setPlacedMessage(
        data.message ||
          (isRetailer
            ? 'Your order has been sent to your distributor. Track status in My Orders.'
            : 'Your order to Pak Suzuki has been submitted. Track status in My Orders.')
      )
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string; title?: string } } })?.response?.data
      setError(msg?.detail || msg?.title || (e as Error)?.message || 'Failed to place order.')
    }
  })

  const onPay = () => {
    setError(null)
    placeOrder.mutate()
  }

  if (items.length === 0 && !placedOrderId) {
    return (
      <div className="bg-white rounded-2xl border border-suzuki-line shadow-card p-10 text-center space-y-3">
        <h1 className="text-xl font-extrabold text-suzuki-navy">{isRetailer ? 'Place order' : 'Payment'}</h1>
        <p className="text-sm text-suzuki-mute">Nothing to pay for.</p>
        <button type="button" onClick={() => navigate('/order/start')} className="text-sm font-bold text-suzuki-blue">
          Start order
        </button>
      </div>
    )
  }

  return (
    <div className="pb-10 max-w-3xl mx-auto">
      <div className="bg-white rounded-2xl border border-suzuki-line shadow-card p-5 sm:p-8">
        <h1 className="text-lg sm:text-xl font-extrabold text-suzuki-navy text-center mb-2">
          {isRetailer ? 'Place order to your distributor' : 'Pay with Haball'}
        </h1>
        <p className="text-sm text-suzuki-mute text-center mb-6">
          {isRetailer
            ? 'This order is placed in packs and goes to your distributor for approval.'
            : 'Haball payment gateway will be integrated here. For now, click below to submit the manufacturer order (no card entry).'}
        </p>

        {orderContext && (
          <div className="mb-4 rounded-lg border border-suzuki-line bg-suzuki-mist/50 px-3 py-2 text-xs text-suzuki-navy">
            <span className="font-bold">PO lane: </span>
            {orderContext.materialSourceCode} · {orderContext.deliveryTypeCode}
            {orderContext.deliveryTypeName ? ` (${orderContext.deliveryTypeName})` : ''} · {orderContext.supplierCode}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-suzuki-red/30 bg-red-50 px-3 py-2 text-sm text-suzuki-red">
            {error}
          </div>
        )}

        {!isRetailer && (
          <div className="rounded-xl border border-dashed border-suzuki-line bg-suzuki-mist/40 px-4 py-5 mb-4 flex items-start gap-3">
            <Wallet className="text-suzuki-red shrink-0 mt-0.5" size={22} />
            <div>
              <p className="text-sm font-bold text-suzuki-navy">Haball (coming soon)</p>
              <p className="text-xs text-suzuki-mute mt-1">
                Real Haball checkout will replace this step. Until then, “Send payment request” places the order to Pak Suzuki.
              </p>
            </div>
          </div>
        )}

        <button
          type="button"
          disabled={placeOrder.isPending}
          onClick={onPay}
          className="w-full rounded-xl bg-suzuki-red text-white font-extrabold py-3.5 hover:bg-red-700 disabled:opacity-60 transition-colors"
        >
          {placeOrder.isPending
            ? 'Processing…'
            : isRetailer
              ? 'Place order'
              : 'Send payment request (Haball)'}
        </button>
      </div>

      {placedOrderId &&
        createPortal(
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/40">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="order-placed-title"
              className="w-full max-w-md bg-white rounded-2xl shadow-card p-8 text-center"
            >
              <div className="mx-auto mb-4 h-16 w-16 rounded-full border-2 border-suzuki-red text-suzuki-red inline-flex items-center justify-center">
                <ShoppingBasket size={30} />
              </div>
              <h2 id="order-placed-title" className="text-2xl font-extrabold text-suzuki-navy">
                Order Placed
              </h2>
              <p className="mt-3 text-sm text-suzuki-navy leading-relaxed">
                {placedMessage ||
                  (isRetailer
                    ? 'Your order has been sent to your distributor. Track status in My Orders.'
                    : 'Your order to Pak Suzuki has been submitted. Track status in My Orders.')}
              </p>
              <button
                type="button"
                onClick={() => navigate('/orders')}
                className="mt-6 w-full rounded-xl bg-suzuki-red text-white font-extrabold py-3.5 hover:bg-red-700"
              >
                Okay
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
