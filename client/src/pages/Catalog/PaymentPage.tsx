import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { CreditCard, User, CalendarDays, Lock, ShoppingBasket } from 'lucide-react'
import { api } from '@/api/axiosClient'
import { useCart } from '@/context/CartContext'

function onlyDigits(v: string) {
  return v.replace(/\D/g, '')
}

function formatCardNumber(v: string) {
  const d = onlyDigits(v).slice(0, 16)
  return d.replace(/(\d{4})(?=\d)/g, '$1 ').trim()
}

function formatExpiry(v: string) {
  const d = onlyDigits(v).slice(0, 4)
  if (d.length <= 2) return d
  return `${d.slice(0, 2)}/${d.slice(2)}`
}

export default function PaymentPage() {
  const navigate = useNavigate()
  const { items, clear, originatingRetailerOrderId } = useCart()
  const [cardNumber, setCardNumber] = useState('')
  const [holder, setHolder] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null)

  const placeOrder = useMutation({
    mutationFn: async () => {
      if (items.length === 0) throw new Error('Cart is empty')
      const body = {
        items: items.map((i) => ({
          productId: i.productId,
          productVariantId: i.variantId || null,
          quantity: i.quantity,
          unit: i.unit || 'Piece'
        })),
        originatingRetailerOrderId: originatingRetailerOrderId || null
      }
      const { data } = await api.post<{ id: string }>('/orders/distributor-direct', body)
      return data.id
    },
    onSuccess: (id) => {
      clear()
      setPlacedOrderId(id)
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string; title?: string } } })?.response?.data
      setError(msg?.detail || msg?.title || 'Failed to place order.')
    }
  })

  const onPay = () => {
    setError(null)
    const digits = onlyDigits(cardNumber)
    if (digits.length < 12) {
      setError('Enter a valid card number.')
      return
    }
    if (!holder.trim()) {
      setError('Enter card holder name.')
      return
    }
    if (onlyDigits(expiry).length < 4) {
      setError('Enter a valid expiry date (MM/YY).')
      return
    }
    if (onlyDigits(cvv).length < 3) {
      setError('Enter a valid CVV.')
      return
    }
    // Card UI is a placeholder until payment gateway is integrated.
    // Order is created and queued for Pak Suzuki / SAP middleware.
    placeOrder.mutate()
  }

  if (items.length === 0 && !placedOrderId) {
    return (
      <div className="bg-white rounded-2xl border border-suzuki-line shadow-card p-10 text-center space-y-3">
        <h1 className="text-xl font-extrabold text-suzuki-navy">Payment</h1>
        <p className="text-sm text-suzuki-mute">Nothing to pay for.</p>
        <button type="button" onClick={() => navigate('/')} className="text-sm font-bold text-suzuki-blue">
          Go home
        </button>
      </div>
    )
  }

  return (
    <div className="pb-10 max-w-3xl mx-auto">
      <div className="bg-white rounded-2xl border border-suzuki-line shadow-card p-5 sm:p-8">
        <h1 className="text-lg sm:text-xl font-extrabold text-suzuki-navy text-center mb-6">
          Add A Credit/Debit Card For Making Payments.
        </h1>

        {error && (
          <div className="mb-4 rounded-lg border border-suzuki-red/30 bg-red-50 px-3 py-2 text-sm text-suzuki-red">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <Field>
            <CreditCard size={18} className="text-suzuki-red shrink-0" />
            <input
              value={cardNumber}
              onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
              placeholder="1234 1234 1234 1234"
              inputMode="numeric"
              autoComplete="cc-number"
              className="flex-1 bg-transparent outline-none text-suzuki-navy font-semibold placeholder:text-suzuki-mute/70"
            />
          </Field>

          <Field>
            <User size={18} className="text-suzuki-red shrink-0" />
            <input
              value={holder}
              onChange={(e) => setHolder(e.target.value)}
              placeholder="Card Holder Name"
              autoComplete="cc-name"
              className="flex-1 bg-transparent outline-none text-suzuki-navy font-semibold placeholder:text-suzuki-mute/70"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field>
              <CalendarDays size={18} className="text-suzuki-red shrink-0" />
              <input
                value={expiry}
                onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                placeholder="MM/YY"
                inputMode="numeric"
                autoComplete="cc-exp"
                className="flex-1 bg-transparent outline-none text-suzuki-navy font-semibold placeholder:text-suzuki-mute/70"
              />
            </Field>
            <Field>
              <Lock size={18} className="text-suzuki-red shrink-0" />
              <input
                value={cvv}
                onChange={(e) => setCvv(onlyDigits(e.target.value).slice(0, 4))}
                placeholder="CVV"
                inputMode="numeric"
                autoComplete="cc-csc"
                type="password"
                className="flex-1 bg-transparent outline-none text-suzuki-navy font-semibold placeholder:text-suzuki-mute/70"
              />
            </Field>
          </div>

          <button
            type="button"
            disabled={placeOrder.isPending}
            onClick={onPay}
            className="w-full mt-2 rounded-xl bg-suzuki-red text-white font-extrabold py-3.5 hover:bg-red-700 disabled:opacity-60 transition-colors"
          >
            {placeOrder.isPending ? 'Processing…' : 'Pay Now'}
          </button>
        </div>
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
                Congratulations, your order is in under process please see your order tracking in my
                orders tab.
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

function Field({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-suzuki-line bg-white px-4 py-3.5">
      {children}
    </div>
  )
}
