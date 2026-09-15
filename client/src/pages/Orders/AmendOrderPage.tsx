import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, FileSpreadsheet, ImageIcon, Minus, Plus, Trash2 } from 'lucide-react'
import { api } from '@/api/axiosClient'
import { useAuth } from '@/context/AuthContext'
import { downloadExcel } from '@/utils/excelExport'
import { RejectOrderModal } from '@/components/ui/RejectOrderModal'
import {
  type OrderDetail,
  type OrderLineItem,
  formatOrderDate,
  formatRs,
  locationLine,
  orderTotalLiters,
  resolveShipToDelivery,
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
  packQuantity?: number | null
  unitValue?: number | null
  unitType?: string | null
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
    lineSubTotal: item.lineSubTotal,
    packQuantity: item.packQuantity,
    unitValue: item.unitValue,
    unitType: item.unitType
  }
}

type DistDecision = 'SentBackForModification' | 'RejectedByDistributor' | 'ForwardedToPakSuzuki'
type StaffDecision = 'PendingPakSuzukiApproval' | 'PendingDistributorApproval' | 'Cancelled'

export default function AmendOrderPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { role } = useAuth()
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<AmendLine[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rejectModalOpen, setRejectModalOpen] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const [rejectKind, setRejectKind] = useState<'distributor' | 'staff'>('distributor')

  const isStaff = role === 'SuperAdmin' || role === 'Admin'
  const isDistributor = role === 'Distributor'

  const detailQuery = useQuery({
    queryKey: ['order-detail', id],
    enabled: !!id,
    queryFn: async () => (await api.get<OrderDetail>(`/orders/${id}`)).data
  })

  const order = detailQuery.data
  const statusCode = order?.statusCode || order?.status
  const uiStatus = order ? toUiStatus(order.status) : 'Pending'

  useEffect(() => {
    setHydrated(false)
    setLines([])
    setNote('')
  }, [id])

  useEffect(() => {
    if (!order || hydrated) return
    setLines(order.items.map(toAmendLine))
    setNote(
      isStaff
        ? order.pakSuzukiRemarks || order.distributorRemarks || ''
        : order.distributorRemarks || ''
    )
    setHydrated(true)
  }, [order, hydrated, isStaff])

  const visibleLines = lines.filter((l) => !l.removed)

  const totals = useMemo(() => {
    const subtotal = visibleLines.reduce((s, l) => s + l.unitPrice * l.quantity, 0)
    const gst = visibleLines.reduce((s, l) => {
      const rate = l.lineSubTotal > 0 ? l.lineGst / l.lineSubTotal : 0
      return s + l.unitPrice * l.quantity * rate
    }, 0)
    const gstPercent = order?.gstPercent ?? (subtotal > 0 ? Math.round((gst / subtotal) * 10000) / 100 : 18)
    const whtPercent = order?.whtPercent ?? 0
    const wht = Math.round(((subtotal * whtPercent) / 100) * 100) / 100
    const fed = order
      ? Math.round(visibleLines.reduce((s, l) => {
          const rate = l.lineSubTotal > 0 ? l.lineFed / l.lineSubTotal : 0
          return s + l.unitPrice * l.quantity * rate
        }, 0) * 100) / 100
      : 0
    const total = Math.round((subtotal + (subtotal * gstPercent) / 100 + fed + wht) * 100) / 100
    const liters = orderTotalLiters(
      visibleLines.map((l) => ({
        requestedQuantity: l.quantity,
        packQuantity: l.packQuantity,
        unitValue: l.unitValue,
        unitType: l.unitType
      }))
    )
    return { subtotal, gstPercent, gst, fed, whtPercent, wht, total, liters }
  }, [visibleLines, order?.gstPercent, order?.whtPercent, order])

  const amendedItems = () =>
    lines.map((l) => ({
      orderItemId: l.id,
      approvedQuantity: l.removed ? 0 : l.quantity
    }))

  const distAction = useMutation({
    mutationFn: async ({
      decision,
      remarks
    }: {
      decision: DistDecision
      remarks?: string | null
    }) => {
      const isManufacturerResubmit = decision === 'ForwardedToPakSuzuki'
      await api.post(`/orders/distributor-action/${id}`, {
        decision,
        remarks: remarks !== undefined ? (remarks || null) : (note || null),
        amendedItems:
          decision === 'SentBackForModification' || isManufacturerResubmit ? amendedItems() : null,
        fulfillmentChoice: isManufacturerResubmit ? 'PassToPakSuzuki' : null,
        pakSuzukiShipTo: null
      })
    },
    onSuccess: async (_data, vars) => {
      await qc.invalidateQueries({ queryKey: ['order-detail', id] })
      await qc.invalidateQueries({ queryKey: ['orders-distributor-all'] })
      navigate(vars.decision === 'ForwardedToPakSuzuki' ? '/orders?section=manufacture' : '/orders?section=retailer')
    },
    onError: (e: unknown) => {
      setError(extractError(e) || 'Could not update order.')
    }
  })

  const staffAction = useMutation({
    mutationFn: async ({
      decision,
      remarks
    }: {
      decision: StaffDecision
      remarks?: string | null
    }) => {
      await api.post(`/orders/paksuzuki-action/${id}`, {
        decision,
        remarks: remarks !== undefined ? (remarks || null) : (note || null),
        amendedItems:
          decision === 'Cancelled' ? null : amendedItems()
      })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['order-detail', id] })
      await qc.invalidateQueries({ queryKey: ['orders-page'] })
      navigate(`/orders/${id}`)
    },
    onError: (e: unknown) => {
      setError(extractError(e) || 'Could not update order.')
    }
  })

  const openRejectModal = (kind: 'distributor' | 'staff') => {
    setRejectKind(kind)
    setRejectNote(note)
    setRejectModalOpen(true)
  }

  const confirmRejectFromModal = () => {
    const remarks = rejectNote.trim() || null
    setNote(rejectNote)
    setError(null)
    if (rejectKind === 'staff') {
      staffAction.mutate(
        { decision: 'Cancelled', remarks },
        { onSuccess: () => setRejectModalOpen(false) }
      )
      return
    }
    distAction.mutate(
      { decision: 'RejectedByDistributor', remarks },
      { onSuccess: () => setRejectModalOpen(false) }
    )
  }

  const actionPending = distAction.isPending || staffAction.isPending

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

  if (!isDistributor && !isStaff) {
    return (
      <div className="py-16 text-center text-sm text-suzuki-mute">
        You do not have permission to amend orders.
      </div>
    )
  }

  if (detailQuery.isLoading) {
    return <p className="text-sm text-suzuki-mute py-16 text-center">Loading order…</p>
  }

  if (!order) {
    return (
      <div className="py-16 text-center space-y-3">
        <p className="text-sm text-suzuki-mute">Order not found.</p>
        <button type="button" onClick={() => navigate('/orders')} className="text-suzuki-blue font-semibold text-sm">
          Back to Orders
        </button>
      </div>
    )
  }

  if (isDistributor) {
    const isRetailerPending =
      order.source === 'RetailerOrder' &&
      statusCode === 'PendingDistributorApproval' &&
      !order.pakSuzukiActionedAtUtc
    const isPakSuzukiAmendmentReview =
      statusCode === 'PendingDistributorApproval' && !!order.pakSuzukiActionedAtUtc
    if (!isRetailerPending && !isPakSuzukiAmendmentReview) {
      return (
        <div className="py-16 text-center space-y-3">
          <p className="text-sm text-suzuki-mute">
            This order cannot be amended right now. Open the order details if Pak Suzuki sent an amendment.
          </p>
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
  }

  if (isStaff && statusCode !== 'PendingPakSuzukiApproval') {
    return (
      <div className="py-16 text-center space-y-3">
        <p className="text-sm text-suzuki-mute">
          Amend is only available while the order is pending Pak Suzuki approval.
        </p>
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

  const isPakSuzukiAmendmentReview =
    isDistributor && statusCode === 'PendingDistributorApproval' && !!order.pakSuzukiActionedAtUtc

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col lg:flex-row lg:items-start gap-3 justify-between">
        <h1 className="text-2xl font-extrabold text-suzuki-navy">
          {isPakSuzukiAmendmentReview ? 'Review Pak Suzuki Amendment' : 'Amend Order Details'}
        </h1>
        {(order.thresholdMet ?? order.thresholdReached) && (
          <div className="inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700">
            <AlertTriangle size={16} className="shrink-0" />
            {isStaff
              ? 'Threshold met — adjust quantities before confirming or sending back.'
              : 'Threshold met — after quantity changes you can fulfill this order or pass it to Pak Suzuki.'}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      {order.pakSuzukiRemarks && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <span className="font-extrabold">Pak Suzuki amendment note: </span>
          {order.pakSuzukiRemarks}
        </div>
      )}

      {order.retailerRemarks && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-suzuki-navy">
          <span className="font-extrabold">Retailer note: </span>
          {order.retailerRemarks}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="bg-white rounded-2xl border border-suzuki-line shadow-card p-5 space-y-4">
          <h2 className="text-xl font-extrabold text-suzuki-blue">Order Number: {order.orderNumber}</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status" value={uiStatus} />
            <Field label="Date" value={formatOrderDate(order.createdAtUtc)} />
            <Field label="Distributor" value={order.distributorName || '—'} />
            <Field label="Retailer" value={order.retailerName || '—'} />
            {(() => {
              const shipTo = resolveShipToDelivery(order)
              return (
                <>
                  <Field
                    label={`Ship-to (${shipTo.partyKind})`}
                    value={shipTo.name}
                  />
                  <Field label="Ship-to contact" value={shipTo.mobile} />
                  <Field
                    label="Ship-to address"
                    value={shipTo.address || '—'}
                    className="col-span-2"
                  />
                  <Field
                    label="Location"
                    value={locationLine(shipTo.regionName, shipTo.address)}
                    className="col-span-2"
                  />
                </>
              )
            })()}
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-suzuki-line shadow-card p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-extrabold text-suzuki-navy">Line items</h2>
            <button
              type="button"
              onClick={() => {
                downloadExcel(
                  `amend-${order.orderNumber}`,
                  [
                    { header: 'SKU', value: (l: AmendLine) => l.productSku },
                    { header: 'Product', value: (l: AmendLine) => l.productName },
                    { header: 'Qty', value: (l: AmendLine) => l.quantity },
                    { header: 'Unit price', value: (l: AmendLine) => l.unitPrice }
                  ],
                  visibleLines
                )
              }}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-suzuki-blue"
            >
              <FileSpreadsheet size={14} /> Export
            </button>
          </div>

          <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
            {visibleLines.map((l) => (
              <div key={l.id} className="rounded-xl border border-suzuki-line p-3 flex gap-3">
                <div className="h-14 w-14 rounded-lg bg-suzuki-mist overflow-hidden flex items-center justify-center shrink-0">
                  {l.primaryImageUrl ? (
                    <img src={l.primaryImageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon size={18} className="text-suzuki-mute" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-suzuki-navy text-sm truncate">{l.productName}</div>
                  <div className="text-xs text-suzuki-mute">{l.productSku} · {l.requestedUnit}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => bump(l.id, -1)}
                      className="h-8 w-8 rounded-lg border border-suzuki-line flex items-center justify-center"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="min-w-[2rem] text-center font-extrabold text-suzuki-navy">{l.quantity}</span>
                    <button
                      type="button"
                      onClick={() => bump(l.id, 1)}
                      className="h-8 w-8 rounded-lg border border-suzuki-line flex items-center justify-center"
                    >
                      <Plus size={14} />
                    </button>
                    <span className="ml-auto text-sm font-semibold text-suzuki-navy">
                      {formatRs(l.unitPrice * l.quantity)}
                    </span>
                    <button
                      type="button"
                      title="Remove line"
                      onClick={() => removeLine(l.id)}
                      className="p-1.5 rounded-lg text-suzuki-red hover:bg-rose-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-suzuki-line pt-3 text-sm space-y-1">
            {totals.liters != null && (
              <div className="flex justify-between">
                <span className="text-suzuki-mute">Total liters</span>
                <span className="font-semibold">{totals.liters.toLocaleString('en-PK')} L</span>
              </div>
            )}
            <div className="flex justify-between"><span className="text-suzuki-mute">Subtotal</span><span className="font-semibold">{formatRs(totals.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-suzuki-mute">GST ({totals.gstPercent}%)</span><span className="font-semibold">{formatRs(totals.gst)}</span></div>
            <div className="flex justify-between font-extrabold text-suzuki-navy"><span>Total</span><span>{formatRs(totals.total)}</span></div>
          </div>
        </section>
      </div>

      <section className="bg-white rounded-2xl border border-suzuki-line shadow-card p-5 space-y-4">
        <div>
          <label className="block text-sm font-bold text-suzuki-navy mb-1.5">Note</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Type your note"
            className="w-full rounded-xl border border-suzuki-line bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-suzuki-red/20"
          />
        </div>

        <div className="flex flex-col gap-3">
          {isDistributor ? (
            isPakSuzukiAmendmentReview ? (
              <>
                <p className="text-xs text-suzuki-mute">
                  Super Admin amended this order. Approve the new quantities, or change them further, then send back to Pak Suzuki — same as when a retailer responds to your amendment.
                </p>
                <div className="flex flex-col sm:flex-row flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    disabled={actionPending}
                    onClick={() => navigate(`/orders/${order.id}`)}
                    className="rounded-xl bg-sky-100 text-suzuki-navy font-extrabold px-6 py-3 tracking-wide hover:bg-sky-200 disabled:opacity-50"
                  >
                    BACK TO ORDER
                  </button>
                  <button
                    type="button"
                    disabled={actionPending || visibleLines.length === 0}
                    onClick={() => {
                      if (!window.confirm('Approve these quantities and send back to Pak Suzuki?')) return
                      setError(null)
                      distAction.mutate({ decision: 'ForwardedToPakSuzuki' })
                    }}
                    className="rounded-xl bg-suzuki-red text-white font-extrabold px-6 py-3 tracking-wide hover:bg-red-700 disabled:opacity-50"
                  >
                    APPROVE & SEND TO PAK SUZUKI
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-suzuki-mute">
                  Change pack quantities and send the order back so the retailer can update it. Reject closes the order permanently (no amendment).
                </p>
                <div className="flex flex-col sm:flex-row flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    disabled={actionPending}
                    onClick={() => openRejectModal('distributor')}
                    className="rounded-xl bg-sky-100 text-suzuki-navy font-extrabold px-6 py-3 tracking-wide hover:bg-sky-200 disabled:opacity-50"
                  >
                    REJECT
                  </button>
                  <button
                    type="button"
                    disabled={actionPending || visibleLines.length === 0}
                    onClick={() => {
                      if (!window.confirm('Send amended quantities back to the retailer?')) return
                      setError(null)
                      distAction.mutate({ decision: 'SentBackForModification' })
                    }}
                    className="rounded-xl bg-suzuki-red text-white font-extrabold px-6 py-3 tracking-wide hover:bg-red-700 disabled:opacity-50"
                  >
                    SEND AMENDMENTS TO RETAILER
                  </button>
                </div>
              </>
            )
          ) : (
            <>
              <p className="text-xs text-suzuki-mute">
                Change pack quantities and send them to the distributor for approval (same as distributor → retailer amendment).
              </p>
              <div className="flex flex-col sm:flex-row flex-wrap justify-end gap-3">
                <button
                  type="button"
                  disabled={actionPending}
                  onClick={() => openRejectModal('staff')}
                  className="rounded-xl bg-sky-100 text-suzuki-navy font-extrabold px-6 py-3 tracking-wide hover:bg-sky-200 disabled:opacity-50"
                >
                  CANCEL ORDER
                </button>
                <button
                  type="button"
                  disabled={actionPending || visibleLines.length === 0}
                  onClick={() => {
                    if (!window.confirm('Send amended quantities to the distributor for approval?')) return
                    setError(null)
                    staffAction.mutate({ decision: 'PendingDistributorApproval' })
                  }}
                  className="rounded-xl bg-suzuki-red text-white font-extrabold px-6 py-3 tracking-wide hover:bg-red-700 disabled:opacity-50"
                >
                  SEND AMENDMENTS TO DISTRIBUTOR
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      {rejectModalOpen && (
        <RejectOrderModal
          title={rejectKind === 'staff' ? 'Cancel order' : 'Reject order'}
          description={
            rejectKind === 'staff'
              ? 'Cancel / reject this manufacturer order. You can leave an optional note for the distributor.'
              : 'Reject this order permanently. The retailer cannot amend or resubmit it. You can leave an optional note.'
          }
          confirmLabel={rejectKind === 'staff' ? 'Cancel order' : 'Reject order'}
          note={rejectNote}
          busy={actionPending}
          onNoteChange={setRejectNote}
          onBack={() => setRejectModalOpen(false)}
          onConfirm={confirmRejectFromModal}
        />
      )}
    </div>
  )
}

function extractError(e: unknown) {
  return (
    (e as { response?: { data?: { detail?: string; title?: string; message?: string } } })?.response?.data
      ?.detail ||
    (e as { response?: { data?: { title?: string } } })?.response?.data?.title ||
    (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
    null
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
