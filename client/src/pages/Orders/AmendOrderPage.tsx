import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, FileSpreadsheet, ImageIcon, Minus, Plus, Trash2, X } from 'lucide-react'
import clsx from 'clsx'
import { api } from '@/api/axiosClient'
import { useAuth } from '@/context/AuthContext'
import { useCart, type CartLine } from '@/context/CartContext'
import {
  type OrderDetail,
  type OrderLineItem,
  formatOrderDate,
  formatRs,
  locationLine,
  paymentLabel,
  toUiStatus
} from './orderTypes'

interface AmendLine {
  id: string
  productId: string
  productVariantId?: string | null
  productName: string
  productSku: string
  productBio?: string | null
  primaryImageUrl?: string | null
  categoryName?: string | null
  requestedUnit: string
  variantTypeName?: string | null
  unitPrice: number
  requestedQuantity: number
  quantity: number
  removed: boolean
  lineGst: number
  lineFed: number
  lineSubTotal: number
}

function toAmendLine(item: OrderLineItem): AmendLine {
  return {
    id: item.id,
    productId: item.productId,
    productVariantId: item.productVariantId,
    productName: item.productName,
    productSku: item.productSku,
    productBio: item.productBio,
    primaryImageUrl: item.primaryImageUrl,
    categoryName: item.categoryName,
    requestedUnit: item.requestedUnit,
    variantTypeName: item.variantTypeName,
    unitPrice: item.unitPrice,
    requestedQuantity: item.requestedQuantity,
    quantity: item.requestedQuantity,
    removed: false,
    lineGst: item.lineGst,
    lineFed: item.lineFed,
    lineSubTotal: item.lineSubTotal
  }
}

export default function AmendOrderPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { role } = useAuth()
  const { replaceFromRetailerOrder } = useCart()
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<AmendLine[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [partialOpen, setPartialOpen] = useState(false)
  const [partialQty, setPartialQty] = useState<Record<string, number>>({})

  const detailQuery = useQuery({
    queryKey: ['order-detail', id],
    enabled: !!id,
    queryFn: async () => (await api.get<OrderDetail>(`/orders/${id}`)).data
  })

  const order = detailQuery.data
  const uiStatus = order ? toUiStatus(order.status) : 'Pending'
  const pay = order ? paymentLabel(order.status) : 'In Approval'

  useEffect(() => {
    setHydrated(false)
    setLines([])
    setNote('')
    setPartialOpen(false)
  }, [id])

  useEffect(() => {
    if (!order || hydrated) return
    setLines(order.items.map(toAmendLine))
    setNote(order.distributorRemarks || '')
    setHydrated(true)
  }, [order, hydrated])

  const visibleLines = lines.filter((l) => !l.removed)

  const totals = useMemo(() => {
    const subtotal = visibleLines.reduce((s, l) => s + l.unitPrice * l.quantity, 0)
    const gst = visibleLines.reduce((s, l) => {
      const rate = l.lineSubTotal > 0 ? l.lineGst / l.lineSubTotal : 0
      return s + l.unitPrice * l.quantity * rate
    }, 0)
    const gstPercent = order?.gstPercent ?? (subtotal > 0 ? Math.round((gst / subtotal) * 100) : 18)
    const total = subtotal + (subtotal * gstPercent) / 100
    return { subtotal, gstPercent, total }
  }, [visibleLines, order?.gstPercent])

  const action = useMutation({
    mutationFn: async ({
      decision,
      amendedOverride
    }: {
      decision: 'SentBackForModification' | 'RejectedByDistributor' | 'PartiallyApprovedByDistributor'
      amendedOverride?: { orderItemId: string; approvedQuantity: number }[]
    }) => {
      const amendedItems =
        decision === 'SentBackForModification'
          ? lines.map((l) => ({
              orderItemId: l.id,
              approvedQuantity: l.removed ? 0 : l.quantity
            }))
          : decision === 'PartiallyApprovedByDistributor'
            ? amendedOverride ?? []
            : null
      await api.post(`/orders/distributor-action/${id}`, {
        decision,
        remarks: note || null,
        amendedItems
      })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['order-detail', id] })
      await qc.invalidateQueries({ queryKey: ['orders-distributor-all'] })
      navigate('/orders?section=retailer')
    },
    onError: (e: unknown) => {
      setError(
        (e as { response?: { data?: { detail?: string; title?: string; message?: string } } })?.response?.data
          ?.detail ||
          (e as { response?: { data?: { title?: string } } })?.response?.data?.title ||
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Could not update order.'
      )
    }
  })

  const bump = (lineId: string, delta: number) => {
    setLines((prev) =>
      prev.map((l) =>
        l.id === lineId && !l.removed
          ? { ...l, quantity: Math.max(1, l.quantity + delta) }
          : l
      )
    )
  }

  const removeLine = (lineId: string) => {
    setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, removed: true } : l)))
  }

  const openPartialModal = () => {
    setError(null)
    const initial: Record<string, number> = {}
    for (const l of visibleLines) {
      initial[l.id] = Math.max(0, Math.floor(l.requestedQuantity / 2))
    }
    setPartialQty(initial)
    setPartialOpen(true)
  }

  const submitPartial = () => {
    const payload = visibleLines.map((l) => ({
      orderItemId: l.id,
      approvedQuantity: Math.min(l.requestedQuantity, Math.max(0, partialQty[l.id] ?? 0))
    }))
    const anyApproved = payload.some((p) => p.approvedQuantity > 0)
    const allFull = visibleLines.every((l) => (partialQty[l.id] ?? 0) >= l.requestedQuantity)
    if (!anyApproved) {
      setError('Approve at least 1 unit from inventory.')
      return
    }
    if (allFull) {
      setError('All lines are at full quantity — use Confirm Order for full approval, or lower at least one line.')
      return
    }
    setError(null)
    setPartialOpen(false)
    action.mutate({ decision: 'PartiallyApprovedByDistributor', amendedOverride: payload })
  }

  const orderToManufacturer = () => {
    if (!order || !id) return
    const cartLines: CartLine[] = visibleLines.map((l) => ({
      productId: l.productId,
      variantId: l.productVariantId || '',
      sku: l.productSku,
      name: l.productName,
      description: l.productBio,
      categoryName: l.categoryName,
      imageUrl: l.primaryImageUrl,
      packLabel: l.variantTypeName || l.requestedUnit,
      unitPrice: l.unitPrice,
      quantity: l.quantity,
      unit: l.requestedUnit
    }))
    replaceFromRetailerOrder(cartLines, id)
    navigate('/cart')
  }

  if (role !== 'Distributor') {
    return (
      <div className="py-16 text-center text-sm text-suzuki-mute">
        Only distributors can amend retailer orders.
      </div>
    )
  }

  if (detailQuery.isLoading) {
    return <p className="text-sm text-suzuki-mute py-16 text-center">Loading order…</p>
  }

  if (!order || order.source !== 'RetailerOrder') {
    return (
      <div className="py-16 text-center space-y-3">
        <p className="text-sm text-suzuki-mute">Amend is only available for retailer orders.</p>
        <button type="button" onClick={() => navigate('/orders')} className="text-suzuki-blue font-semibold text-sm">
          Back to Orders
        </button>
      </div>
    )
  }

  if (order.status !== 'PendingDistributorApproval') {
    return (
      <div className="py-16 text-center space-y-3">
        <p className="text-sm text-suzuki-mute">This order is no longer pending and cannot be amended.</p>
        <button
          type="button"
          onClick={() => navigate(`/orders/${order.id}`)}
          className="text-suzuki-blue font-semibold text-sm"
        >
          View Order Details
        </button>
      </div>
    )
  }

  if (order.thresholdReached) {
    return (
      <div className="py-16 text-center space-y-3 max-w-lg mx-auto">
        <div className="inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700">
          <AlertTriangle size={16} /> Ship-to-Party (threshold reached)
        </div>
        <p className="text-sm text-suzuki-mute">
          This retailer is eligible for direct Pak Suzuki delivery. Use Confirm Order on Order Details to send it
          to the manufacturer — Amend / Partial / Order to Manufacturer do not apply.
        </p>
        <button
          type="button"
          onClick={() => navigate(`/orders/${order.id}`)}
          className="text-suzuki-blue font-semibold text-sm"
        >
          Back to Order Details
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col lg:flex-row lg:items-start gap-3 justify-between">
        <h1 className="text-2xl font-extrabold text-suzuki-navy">Amend Order Details</h1>
        {order.thresholdReached && (
          <div className="inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700">
            <AlertTriangle size={16} className="shrink-0" />
            Threshold Reached And Will Be Shipped By Pak Suzuki.
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="bg-white rounded-2xl border border-suzuki-line shadow-card p-5 space-y-4">
          <h2 className="text-xl font-extrabold text-suzuki-blue">Order Number: {order.orderNumber}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Order Date" value={formatOrderDate(order.createdAtUtc)} />
            <div>
              <div className="text-xs font-bold text-suzuki-navy/80 mb-1">Order Status</div>
              <span className="inline-flex rounded-full px-4 py-1.5 text-sm font-bold bg-amber-100 text-amber-800">
                {uiStatus}
              </span>
            </div>
          </div>
          <div className="border-t border-suzuki-line pt-4 space-y-3">
            <h3 className="font-bold text-suzuki-navy">Retailor Detail</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Retailor Name" value={order.retailerName || '—'} />
              <Field label="Location" value={locationLine(order.regionName, order.retailerAddress)} />
              <Field label="Address" value={order.retailerAddress || '—'} className="sm:col-span-2" />
              <Field label="Contact Number" value={order.retailerMobile || '—'} />
            </div>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-suzuki-line shadow-card p-5 space-y-4">
          <h3 className="font-bold text-suzuki-navy">Delivery Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Address" value={order.retailerAddress || '—'} className="sm:col-span-2" />
            <Field label="Location" value={locationLine(order.regionName, order.retailerAddress)} />
            <Field label="Retailor Name" value={order.retailerName || '—'} />
            <Field label="Contact Number" value={order.retailerMobile || '—'} />
          </div>
          <div>
            <h3 className="font-bold text-suzuki-navy mb-2">Payment Status</h3>
            <div
              className={clsx(
                'w-full rounded-xl text-center py-2.5 text-sm font-bold',
                pay === 'Received' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'
              )}
            >
              {pay === 'Received' ? 'Recieved' : pay}
            </div>
          </div>
        </section>
      </div>

      <section className="bg-white rounded-2xl border border-suzuki-line shadow-card p-5 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-extrabold text-suzuki-navy">Order Summary</h3>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-suzuki-blue/40 text-suzuki-blue px-3 py-2 text-xs font-semibold hover:bg-suzuki-ice"
          >
            <FileSpreadsheet size={14} /> Export Excel
          </button>
        </div>

        <div className="space-y-3">
          {visibleLines.map((item) => (
            <div
              key={item.id}
              className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border border-suzuki-line/80 bg-suzuki-mist/30 p-3"
            >
              <div className="h-20 w-20 rounded-lg bg-white border border-suzuki-line flex items-center justify-center overflow-hidden shrink-0">
                {item.primaryImageUrl ? (
                  <img src={item.primaryImageUrl} alt="" className="h-full w-full object-contain" />
                ) : (
                  <ImageIcon className="text-suzuki-mute" size={28} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-suzuki-navy leading-snug">{item.productName}</div>
                {item.productBio && <div className="text-xs text-suzuki-mute mt-0.5">{item.productBio}</div>}
                <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                  <span>
                    Selected Pack:{' '}
                    <span className="font-bold text-suzuki-red">
                      {item.variantTypeName || item.requestedUnit}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-2">
                    Unit:
                    <span className="inline-flex items-center rounded-lg border border-suzuki-line bg-white">
                      <button
                        type="button"
                        onClick={() => bump(item.id, -1)}
                        className="px-2 py-1.5 text-suzuki-navy hover:bg-suzuki-mist"
                        aria-label="Decrease"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="min-w-[2.5rem] text-center font-bold text-suzuki-red">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => bump(item.id, 1)}
                        className="px-2 py-1.5 text-suzuki-navy hover:bg-suzuki-mist"
                        aria-label="Increase"
                      >
                        <Plus size={14} />
                      </button>
                    </span>
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0 sm:flex-col sm:items-end">
                <div className="text-lg font-extrabold text-suzuki-blue">
                  {formatRs(item.unitPrice * item.quantity)}
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(item.id)}
                  className="p-2 rounded-lg text-rose-600 hover:bg-rose-50"
                  title="Remove line"
                  disabled={visibleLines.length <= 1}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row lg:items-end gap-4 justify-between border-t border-suzuki-line pt-4">
          <div>
            <div className="text-sm font-bold text-suzuki-navy mb-2">Order Status</div>
            <span className="inline-flex rounded-full px-4 py-1.5 text-sm font-bold bg-amber-100 text-amber-800">
              Pending
            </span>
          </div>
          <div className="text-right space-y-1 min-w-[200px]">
            <div className="text-sm">
              <span className="text-suzuki-mute">Subtotal: </span>
              <span className="font-bold text-suzuki-red">{formatRs(totals.subtotal)}</span>
            </div>
            <div className="text-sm text-suzuki-mute">GST TAX: {totals.gstPercent}%</div>
            <div className="text-lg font-extrabold text-suzuki-red">
              Total Amount: {formatRs(totals.total)}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-suzuki-navy mb-1.5">Note for Order</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Type your note"
            className="w-full rounded-xl border border-suzuki-line bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-suzuki-red/20"
          />
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-xs text-suzuki-mute">
            Partial approve: choose how many units you can fulfill from inventory. Order to manufacturer opens
            cart as a normal Pak Suzuki order (linked to this retailer order).
          </p>
          <div className="flex flex-col sm:flex-row flex-wrap justify-end gap-3">
            <button
              type="button"
              disabled={action.isPending}
              onClick={() => {
                setError(null)
                action.mutate({ decision: 'RejectedByDistributor' })
              }}
              className="rounded-xl bg-sky-100 text-suzuki-navy font-extrabold px-6 py-3 tracking-wide hover:bg-sky-200 disabled:opacity-50"
            >
              CANCELED
            </button>
            <button
              type="button"
              disabled={action.isPending || visibleLines.length === 0}
              onClick={orderToManufacturer}
              className="rounded-xl border border-suzuki-navy text-suzuki-navy font-extrabold px-6 py-3 tracking-wide hover:bg-suzuki-mist disabled:opacity-50"
            >
              ORDER TO MANUFACTURER
            </button>
            <button
              type="button"
              disabled={action.isPending || visibleLines.length === 0}
              onClick={openPartialModal}
              className="rounded-xl bg-amber-500 text-white font-extrabold px-6 py-3 tracking-wide hover:bg-amber-600 disabled:opacity-50"
            >
              APPROVE PARTIAL (INVENTORY)
            </button>
            <button
              type="button"
              disabled={action.isPending || visibleLines.length === 0}
              onClick={() => {
                setError(null)
                action.mutate({ decision: 'SentBackForModification' })
              }}
              className="rounded-xl bg-suzuki-red text-white font-extrabold px-6 py-3 tracking-wide hover:bg-red-700 disabled:opacity-50"
            >
              SEND AMENDMENTS TO RETAILOR
            </button>
          </div>
        </div>
      </section>

      {partialOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-lg bg-white rounded-2xl border border-suzuki-line shadow-card p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-extrabold text-suzuki-navy">Approve Partial from Inventory</h3>
                <p className="text-xs text-suzuki-mute mt-1">
                  Enter how many units you can fulfill (e.g. requested 20, approve 10). Must be less than
                  requested on at least one line.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPartialOpen(false)}
                className="p-1.5 rounded-lg text-suzuki-mute hover:bg-suzuki-mist"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 max-h-[50vh] overflow-y-auto">
              {visibleLines.map((l) => (
                <div key={l.id} className="rounded-xl border border-suzuki-line p-3 space-y-2">
                  <div className="font-bold text-suzuki-navy text-sm">{l.productName}</div>
                  <div className="text-xs text-suzuki-mute">
                    Requested: <span className="font-bold text-suzuki-red">{l.requestedQuantity}</span>
                    {' · '}
                    Pack: {l.variantTypeName || l.requestedUnit}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-suzuki-navy">Approve:</span>
                    <span className="inline-flex items-center rounded-lg border border-suzuki-line bg-white">
                      <button
                        type="button"
                        onClick={() =>
                          setPartialQty((prev) => ({
                            ...prev,
                            [l.id]: Math.max(0, (prev[l.id] ?? 0) - 1)
                          }))
                        }
                        className="px-2 py-1.5 text-suzuki-navy hover:bg-suzuki-mist"
                      >
                        <Minus size={14} />
                      </button>
                      <input
                        type="number"
                        min={0}
                        max={l.requestedQuantity}
                        value={partialQty[l.id] ?? 0}
                        onChange={(e) => {
                          const n = Number(e.target.value)
                          setPartialQty((prev) => ({
                            ...prev,
                            [l.id]: Number.isFinite(n)
                              ? Math.min(l.requestedQuantity, Math.max(0, n))
                              : 0
                          }))
                        }}
                        className="w-16 text-center font-bold text-suzuki-red outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setPartialQty((prev) => ({
                            ...prev,
                            [l.id]: Math.min(l.requestedQuantity, (prev[l.id] ?? 0) + 1)
                          }))
                        }
                        className="px-2 py-1.5 text-suzuki-navy hover:bg-suzuki-mist"
                      >
                        <Plus size={14} />
                      </button>
                    </span>
                    <span className="text-xs text-suzuki-mute">of {l.requestedQuantity}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-end pt-1">
              <button
                type="button"
                onClick={() => setPartialOpen(false)}
                className="rounded-xl bg-sky-100 text-suzuki-navy font-extrabold px-6 py-3"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={action.isPending}
                onClick={submitPartial}
                className="rounded-xl bg-amber-500 text-white font-extrabold px-6 py-3 hover:bg-amber-600 disabled:opacity-50"
              >
                Confirm Partial Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  value,
  className
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={className}>
      <div className="text-xs font-bold text-suzuki-navy/80">{label}</div>
      <div className="text-sm font-semibold text-suzuki-navy mt-0.5">{value}</div>
    </div>
  )
}
