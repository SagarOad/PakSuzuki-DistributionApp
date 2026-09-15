import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { User, Mail, Phone, MapPin, Building2, Store } from 'lucide-react'
import { api } from '@/api/axiosClient'
import { useAuthStore } from '@/context/authStore'
import { useCart, useHydrateCartPackMeta } from '@/context/CartContext'
import { useOrderTaxEstimate } from '@/hooks/useOrderTaxEstimate'
import { ProductTitle } from './catalogTypes'
import type { ReactNode } from 'react'
import { cartLineLiters, cartTotalLiters } from '@/pages/Orders/orderTypes'

function formatRs(n: number) {
  return `Rs. ${Number(n || 0).toLocaleString('en-PK')}`
}

interface DistributorProfile {
  id: string
  name: string
  email: string
  mobileNumber: string
  regionName: string
  businessAddress: string
  businessName: string
}

/** Order summary before payment — distributor → Pak Suzuki (manufacturer) orders only. */
export default function OrderSummaryPage() {
  const navigate = useNavigate()
  const { items, orderContext } = useCart()
  useHydrateCartPackMeta()
  const { subTotal, gstPercent, gstAmount, fedAmount, whtPercent, whtAmount, estimatedTotal } =
    useOrderTaxEstimate(items)
  const totalLiters = cartTotalLiters(items)
  const profileId = useAuthStore((s) => s.profileId)

  const profileQuery = useQuery({
    queryKey: ['distributor-profile', profileId],
    enabled: !!profileId,
    queryFn: async () => (await api.get<DistributorProfile>(`/distributors/${profileId}`)).data
  })

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-suzuki-line shadow-card p-10 text-center space-y-3">
        <h1 className="text-2xl font-extrabold text-suzuki-navy">Order Summary</h1>
        <p className="text-sm text-suzuki-mute">No items to checkout.</p>
        <button
          type="button"
          onClick={() => navigate(orderContext ? '/' : '/order/start')}
          className="text-sm font-bold text-suzuki-blue hover:underline"
        >
          Continue shopping
        </button>
      </div>
    )
  }

  if (!orderContext) {
    return (
      <div className="bg-white rounded-2xl border border-suzuki-line shadow-card p-10 text-center space-y-3">
        <h1 className="text-2xl font-extrabold text-suzuki-navy">Order Summary</h1>
        <p className="text-sm text-suzuki-mute">Choose source, delivery type, and supplier before checkout.</p>
        <button
          type="button"
          onClick={() => navigate('/order/start')}
          className="rounded-lg bg-suzuki-red text-white text-sm font-bold px-5 py-2.5"
        >
          Start order
        </button>
      </div>
    )
  }

  const d = profileQuery.data

  return (
    <div className="space-y-5 pb-10">
      <div className="rounded-xl border border-suzuki-line bg-white px-4 py-3 text-sm shadow-sm">
        <span className="font-bold text-suzuki-navy">PO lane: </span>
        <span className="text-suzuki-mute">
          {orderContext.vendorName} · {orderContext.materialSourceCode} · {orderContext.deliveryTypeCode} ({orderContext.deliveryTypeName}) · {orderContext.supplierCode}
        </span>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-5">
        <section className="bg-white rounded-2xl border border-suzuki-line shadow-card overflow-hidden">
          <div className="divide-y divide-suzuki-line">
            {items.map((item) => (
              <div key={`${item.productId}-${item.variantId}`} className="p-5 sm:p-6">
                <div className="flex gap-4">
                  <div className="h-20 w-20 rounded-xl bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="h-full w-full object-contain p-1" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-extrabold text-suzuki-navy leading-snug">
                      <ProductTitle name={item.name} />
                    </h2>
                    <p className="text-sm text-suzuki-navy mt-0.5">
                      {item.description || 'Fully Synthetic Engine Oil'}
                    </p>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                      <p className="font-bold text-suzuki-navy">
                        Category:{' '}
                        <span className="text-suzuki-red">{item.categoryName || '—'}</span>
                      </p>
                      <p className="font-bold text-suzuki-navy">
                        Product Price:{' '}
                        <span className="text-suzuki-red">{formatRs(item.unitPrice)}</span>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-suzuki-line grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <p className="font-bold text-suzuki-navy">
                    Selected Pack:{' '}
                    <span className="text-suzuki-red">{item.packLabel}</span>
                  </p>
                  <p className="font-bold text-suzuki-navy">
                    Unit: <span className="text-suzuki-red">{item.quantity}</span>
                  </p>
                  {cartLineLiters(item) != null && (
                    <p className="font-bold text-suzuki-navy">
                      Liters: <span className="text-suzuki-red">{cartLineLiters(item)} L</span>
                    </p>
                  )}
                  <p className="font-bold text-suzuki-navy sm:text-right">
                    Total Item Cost:{' '}
                    <span className="text-suzuki-red">{formatRs(item.unitPrice * item.quantity)}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 sm:px-6 py-4 border-t border-suzuki-line bg-suzuki-mist/40 space-y-1">
            {totalLiters != null && (
              <p className="text-sm font-bold text-suzuki-navy flex justify-between gap-6">
                <span>Total liters</span>
                <span className="text-suzuki-red">{totalLiters.toLocaleString('en-PK')} L</span>
              </p>
            )}
            <p className="text-sm font-bold text-suzuki-navy flex justify-between gap-6">
              <span>Subtotal</span>
              <span className="text-suzuki-red">{formatRs(subTotal)}</span>
            </p>
            <p className="text-sm font-semibold text-suzuki-mute flex justify-between gap-6">
              <span>GST TAX ({gstPercent}%)</span>
              <span className="text-suzuki-navy">{formatRs(gstAmount)}</span>
            </p>
            {fedAmount > 0 && (
              <p className="text-sm font-semibold text-suzuki-mute flex justify-between gap-6">
                <span>FED</span>
                <span className="text-suzuki-navy">{formatRs(fedAmount)}</span>
              </p>
            )}
            <p className="text-sm font-semibold text-suzuki-mute flex justify-between gap-6">
              <span>WHT ({whtPercent}%)</span>
              <span className="text-suzuki-navy">{formatRs(whtAmount)}</span>
            </p>
            <p className="text-base font-extrabold text-suzuki-navy flex justify-between gap-6 pt-1">
              <span>Total Amount</span>
              <span className="text-suzuki-red">{formatRs(estimatedTotal)}</span>
            </p>
            <p className="text-xs text-suzuki-mute pt-1">
              Same tax breakdown as on the order after placement. Next step: payment to Pak Suzuki (Haball — coming soon).
            </p>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-suzuki-line shadow-card p-5 sm:p-6 h-fit">
          <h2 className="text-lg font-extrabold text-suzuki-navy mb-4">Your Details</h2>
          {profileQuery.isLoading ? (
            <p className="text-sm text-suzuki-mute">Loading profile…</p>
          ) : (
            <ul className="space-y-4">
              <DetailRow icon={<User size={18} />} value={d?.name || '—'} />
              <DetailRow icon={<Mail size={18} />} value={d?.email || '—'} />
              <DetailRow icon={<Phone size={18} />} value={d?.mobileNumber || '—'} />
              <DetailRow icon={<MapPin size={18} />} value={d?.regionName || '—'} />
              <DetailRow icon={<Building2 size={18} />} value={d?.businessAddress || '—'} />
              <DetailRow icon={<Store size={18} />} value={d?.businessName || '—'} />
            </ul>
          )}

          <button
            type="button"
            onClick={() => navigate('/checkout/payment')}
            className="mt-6 w-full rounded-xl bg-suzuki-red text-white font-extrabold py-3.5 hover:bg-red-700 transition-colors"
          >
            Proceed to Payment
          </button>
        </section>
      </div>
    </div>
  )
}

function DetailRow({ icon, value }: { icon: ReactNode; value: string }) {
  return (
    <li className="flex items-start gap-3 text-sm font-semibold text-suzuki-navy">
      <span className="mt-0.5 text-suzuki-navy/70 shrink-0">{icon}</span>
      <span className="leading-snug">{value}</span>
    </li>
  )
}
