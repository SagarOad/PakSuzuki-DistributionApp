import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, FileSpreadsheet, HelpCircle, ImageIcon, Pencil, X
} from 'lucide-react'
import clsx from 'clsx'
import { api } from '@/api/axiosClient'
import { useAuth } from '@/context/AuthContext'
import {
  type OrderDetail,
  type UiOrderStatus,
  formatOrderDate,
  formatRs,
  locationLine,
  paymentLabel,
  toUiStatus,
  uiStatusToApi
} from './orderTypes'

type PageTab = 'details' | 'summary'

export default function OrderDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { role } = useAuth()
  const qc = useQueryClient()

  const [tab, setTab] = useState<PageTab>('details')
  const [note, setNote] = useState('')
  const [noteHydrated, setNoteHydrated] = useState(false)
  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isStaff = role === 'SuperAdmin' || role === 'Admin'
  const isDistributor = role === 'Distributor'

  const detailQuery = useQuery({
    queryKey: ['order-detail', id],
    enabled: !!id,
    queryFn: async () => (await api.get<OrderDetail>(`/orders/${id}`)).data
  })

  const order = detailQuery.data
  const uiStatus = order ? toUiStatus(order.status) : 'Pending'
  const pay = order ? paymentLabel(order.status) : 'In Approval'

  useEffect(() => {
    setNoteHydrated(false)
    setNote('')
  }, [id])

  useEffect(() => {
    if (!order || noteHydrated) return
    setNote(order.pakSuzukiRemarks || order.distributorRemarks || '')
    setNoteHydrated(true)
  }, [order, noteHydrated])

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ['order-detail', id] })
    await qc.invalidateQueries({ queryKey: ['orders-page'] })
    await qc.invalidateQueries({ queryKey: ['orders'] })
  }

  const patchStatus = useMutation({
    mutationFn: async (status: string) =>
      api.patch(`/orders/status/${id}`, { status, remarks: note || null }),
    onSuccess: async () => {
      setError(null)
      setStatusModalOpen(false)
      setDeliveryModalOpen(false)
      await invalidate()
    },
    onError: (e: unknown) => {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Could not update order status.')
    }
  })

  const pakSuzukiAction = useMutation({
    mutationFn: async (decision: string) =>
      api.post(`/orders/paksuzuki-action/${id}`, { decision, remarks: note || null }),
    onSuccess: async () => {
      setError(null)
      await invalidate()
    },
    onError: (e: unknown) => {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Could not action this order.')
    }
  })

  const distributorAction = useMutation({
    mutationFn: async (decision: string) =>
      api.post(`/orders/distributor-action/${id}`, { decision, remarks: note || null, amendedItems: null }),
    onSuccess: async () => {
      setError(null)
      await invalidate()
    },
    onError: (e: unknown) => {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Could not action this order.')
    }
  })

  const busy = patchStatus.isPending || pakSuzukiAction.isPending || distributorAction.isPending

  const openDelivery = () => setDeliveryModalOpen(true)

  const confirmOrder = async () => {
    if (!order) return
    setError(null)
    try {
      if (order.status === 'PendingPakSuzukiApproval' && isStaff) {
        await pakSuzukiAction.mutateAsync('ApprovedByPakSuzuki')
      } else if (order.status === 'PendingDistributorApproval' && isDistributor) {
        await distributorAction.mutateAsync('ApprovedByDistributor')
      } else if (isStaff && (uiStatus === 'Pending')) {
        await patchStatus.mutateAsync('ApprovedByPakSuzuki')
      }
      setDeliveryModalOpen(true)
    } catch {
      /* error state set by mutation */
    }
  }

  const cancelOrder = async () => {
    if (!order) return
    setError(null)
    if (order.status === 'PendingPakSuzukiApproval' && isStaff) {
      await pakSuzukiAction.mutateAsync('Cancelled')
      return
    }
    if (order.status === 'PendingDistributorApproval' && isDistributor) {
      await distributorAction.mutateAsync('RejectedByDistributor')
      return
    }
    if (isStaff) await patchStatus.mutateAsync('Cancelled')
  }

  const startDelivery = async () => {
    await patchStatus.mutateAsync('PartiallyDelivered')
  }

  const markDelivered = async () => {
    await patchStatus.mutateAsync('Delivered')
  }

  const applyUiStatus = async (ui: UiOrderStatus) => {
    await patchStatus.mutateAsync(uiStatusToApi(ui))
  }

  if (detailQuery.isLoading) {
    return <p className="text-sm text-suzuki-mute py-16 text-center">Loading order…</p>
  }

  if (detailQuery.isError || !order) {
    return (
      <div className="py-16 text-center space-y-3">
        <p className="text-sm text-suzuki-mute">Order not found or you do not have access.</p>
        <button type="button" onClick={() => navigate('/orders')} className="text-suzuki-blue font-semibold text-sm">
          Back to Orders
        </button>
      </div>
    )
  }

  const showCompletedTabs = uiStatus === 'Completed' || uiStatus === 'Cancelled'
  const activeTab = showCompletedTabs ? tab : 'details'

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col lg:flex-row lg:items-start gap-3 justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-suzuki-navy">Order Details</h1>
          {showCompletedTabs && (
            <div className="mt-3 inline-flex rounded-xl bg-suzuki-mist p-1 text-sm font-bold">
              <button
                type="button"
                onClick={() => setTab('details')}
                className={clsx(
                  'px-4 py-1.5 rounded-lg transition-colors',
                  activeTab === 'details' ? 'bg-sky-100 text-suzuki-navy' : 'text-suzuki-mute hover:text-suzuki-ink'
                )}
              >
                Order Details
              </button>
              <button
                type="button"
                onClick={() => setTab('summary')}
                className={clsx(
                  'px-4 py-1.5 rounded-lg transition-colors',
                  activeTab === 'summary' ? 'bg-sky-100 text-suzuki-navy' : 'text-suzuki-mute hover:text-suzuki-ink'
                )}
              >
                Order Summary
              </button>
            </div>
          )}
        </div>

        {order.thresholdReached && (
          <div className="inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700">
            <AlertTriangle size={16} className="shrink-0" />
            Threshold Reached And Will Be Shipped By Pak Suzuki
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      {activeTab === 'summary' ? (
        <OrderSummaryCard order={order} uiStatus={uiStatus} canEditStatus={isStaff} onEditStatus={() => setStatusModalOpen(true)} />
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <OrderInfoCard order={order} uiStatus={uiStatus} />
            <DeliveryPaymentCard
              order={order}
              uiStatus={uiStatus}
              payment={pay}
              showProof={uiStatus === 'Completed' || uiStatus === 'Delivery In Process'}
            />
          </div>

          <OrderSummaryCard
            order={order}
            uiStatus={uiStatus}
            canEditStatus={isStaff && uiStatus !== 'Completed'}
            onEditStatus={() => setStatusModalOpen(true)}
            note={note}
            onNoteChange={setNote}
            showNote
            footer={
              <OrderActions
                uiStatus={uiStatus}
                busy={busy}
                canAct={isStaff || isDistributor}
                onCancel={cancelOrder}
                onConfirm={confirmOrder}
                onStartDelivery={openDelivery}
                onMarkDelivered={markDelivered}
                onViewSummary={() => setTab('summary')}
              />
            }
          />
        </>
      )}

      {statusModalOpen && (
        <ChangeStatusModal
          onClose={() => setStatusModalOpen(false)}
          onSelect={applyUiStatus}
          busy={busy}
        />
      )}

      {deliveryModalOpen && (
        <DeliveryModal
          order={order}
          busy={busy}
          onClose={() => setDeliveryModalOpen(false)}
          onStart={startDelivery}
        />
      )}
    </div>
  )
}

function OrderInfoCard({ order, uiStatus }: { order: OrderDetail; uiStatus: UiOrderStatus }) {
  return (
    <section className="bg-white rounded-2xl border border-suzuki-line shadow-card p-5 space-y-4">
      <h2 className="text-xl font-extrabold text-suzuki-blue">
        Order Number : {order.orderNumber}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Order Date" value={formatOrderDate(order.createdAtUtc)} />
        <div>
          <Label>Order Status</Label>
          <StatusPill status={uiStatus} />
        </div>
      </div>

      <div className="border-t border-suzuki-line pt-4 space-y-3">
        <h3 className="font-bold text-suzuki-navy">Distributor Detail</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Distributor Name" value={order.distributorName} />
          <Field label="Location" value={locationLine(order.regionName, order.distributorAddress)} />
          <Field label="Address" value={order.distributorAddress || '—'} className="sm:col-span-2" />
          <Field label="Contact Number" value={order.distributorMobile || '—'} />
        </div>
      </div>
    </section>
  )
}

function DeliveryPaymentCard({
  order,
  uiStatus,
  payment,
  showProof
}: {
  order: OrderDetail
  uiStatus: UiOrderStatus
  payment: string
  showProof?: boolean
}) {
  const deliveryName = order.retailerName || order.distributorName
  const deliveryAddress = order.retailerAddress || order.distributorAddress
  const deliveryMobile = order.retailerMobile || order.distributorMobile
  const proof = order.proofsOfDelivery[0]

  return (
    <section className="bg-white rounded-2xl border border-suzuki-line shadow-card p-5 space-y-4">
      <div className="space-y-3">
        <h3 className="font-bold text-suzuki-navy">Delivery Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Address" value={deliveryAddress || '—'} className="sm:col-span-2" />
          <Field label="Location" value={locationLine(order.regionName, deliveryAddress)} />
          <Field
            label={order.retailerName ? 'Retailor Name' : 'Distributor Name'}
            value={deliveryName || '—'}
          />
          <Field label="Contact Number" value={deliveryMobile || '—'} />
        </div>
      </div>

      {showProof && (
        <div>
          <Label>Proof Of Delivery Image</Label>
          <div className="mt-1.5 aspect-square max-w-[140px] rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center overflow-hidden">
            {proof?.storageUrl ? (
              <a href={proof.storageUrl} target="_blank" rel="noreferrer" className="w-full h-full">
                <img src={proof.storageUrl} alt={proof.fileName} className="w-full h-full object-cover" />
              </a>
            ) : (
              <span className="text-suzuki-mute font-bold text-sm flex flex-col items-center gap-1">
                <ImageIcon size={22} /> IMG
              </span>
            )}
          </div>
        </div>
      )}

      <div>
        <h3 className="font-bold text-suzuki-navy mb-2">Payment Status</h3>
        <PaymentPill value={payment} />
      </div>

      {/* keep status in scope for lint when unused in future layouts */}
      <span className="sr-only">{uiStatus}</span>
    </section>
  )
}

function OrderSummaryCard({
  order,
  uiStatus,
  canEditStatus,
  onEditStatus,
  note,
  onNoteChange,
  showNote,
  footer
}: {
  order: OrderDetail
  uiStatus: UiOrderStatus
  canEditStatus?: boolean
  onEditStatus?: () => void
  note?: string
  onNoteChange?: (v: string) => void
  showNote?: boolean
  footer?: ReactNode
}) {
  return (
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
        {order.items.map((item) => (
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
              {item.productBio && (
                <div className="text-xs text-suzuki-mute mt-0.5">{item.productBio}</div>
              )}
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span>
                  Selected Pack:{' '}
                  <span className="font-bold text-suzuki-red">{item.requestedUnit}</span>
                </span>
                <span>
                  Unit: <span className="font-bold text-suzuki-red">{item.requestedQuantity}</span>
                </span>
              </div>
            </div>
            <div className="text-lg font-extrabold text-suzuki-blue sm:text-right shrink-0">
              {formatRs(item.lineSubTotal)}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row lg:items-end gap-4 justify-between border-t border-suzuki-line pt-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-bold text-suzuki-navy">Order Status</span>
            {canEditStatus && onEditStatus && (
              <button
                type="button"
                onClick={onEditStatus}
                className="p-1 rounded-md text-suzuki-blue hover:bg-suzuki-ice"
                title="Change order status"
              >
                <Pencil size={14} />
              </button>
            )}
          </div>
          <StatusPill status={uiStatus} />
        </div>

        <div className="text-right space-y-1 min-w-[200px]">
          <div className="flex justify-between gap-8 text-sm">
            <span className="text-suzuki-mute font-semibold">Subtotal</span>
            <span className="font-bold text-suzuki-red">{formatRs(order.subTotal)}</span>
          </div>
          <div className="flex justify-between gap-8 text-sm">
            <span className="text-suzuki-mute font-semibold">GST TAX</span>
            <span className="font-bold text-suzuki-ink">{order.gstPercent}%</span>
          </div>
          <div className="mt-2 flex justify-between gap-8 items-center rounded-xl bg-sky-50 px-3 py-2">
            <span className="font-bold text-suzuki-navy">Total Amount</span>
            <span className="text-lg font-extrabold text-suzuki-red">{formatRs(order.grandTotal)}</span>
          </div>
        </div>
      </div>

      {showNote && (
        <div>
          <Label>Note for Order</Label>
          <input
            value={note ?? ''}
            onChange={(e) => onNoteChange?.(e.target.value)}
            placeholder="Type your note"
            className="mt-1.5 w-full rounded-xl border border-suzuki-line bg-suzuki-mist/50 px-3 py-2.5 text-sm outline-none focus:border-suzuki-blue"
          />
        </div>
      )}

      {footer}
    </section>
  )
}

function OrderActions({
  uiStatus,
  busy,
  canAct,
  onCancel,
  onConfirm,
  onStartDelivery,
  onMarkDelivered,
  onViewSummary
}: {
  uiStatus: UiOrderStatus
  busy: boolean
  canAct: boolean
  onCancel: () => void
  onConfirm: () => void
  onStartDelivery: () => void
  onMarkDelivered: () => void
  onViewSummary: () => void
}) {
  if (!canAct && uiStatus !== 'Completed') return null

  if (uiStatus === 'Pending') {
    return (
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="flex-1 rounded-xl bg-sky-100 text-suzuki-navy font-extrabold py-3 tracking-wide hover:bg-sky-200 disabled:opacity-50"
        >
          CANCELED
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="flex-1 rounded-xl bg-suzuki-red text-white font-extrabold py-3 tracking-wide hover:bg-red-700 disabled:opacity-50"
        >
          CONFIRM ORDER
        </button>
      </div>
    )
  }

  if (uiStatus === 'In Process') {
    return (
      <div className="flex justify-end pt-2">
        <button
          type="button"
          disabled={busy}
          onClick={onStartDelivery}
          className="rounded-xl bg-suzuki-red text-white font-extrabold px-8 py-3 tracking-wide hover:bg-red-700 disabled:opacity-50"
        >
          START DELIVERY
        </button>
      </div>
    )
  }

  if (uiStatus === 'Delivery In Process') {
    return (
      <div className="flex justify-end pt-2">
        <button
          type="button"
          disabled={busy}
          onClick={onMarkDelivered}
          className="rounded-xl bg-suzuki-navy text-white font-extrabold px-8 py-3 tracking-wide hover:bg-suzuki-blue disabled:opacity-50"
        >
          MARK AS DELIVERD
        </button>
      </div>
    )
  }

  if (uiStatus === 'Completed') {
    return (
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={onViewSummary}
          className="rounded-xl bg-suzuki-navy text-white font-extrabold px-8 py-3 tracking-wide hover:bg-suzuki-blue"
        >
          VIEW ORDER SUMMARY
        </button>
      </div>
    )
  }

  return null
}

function ChangeStatusModal({
  onClose,
  onSelect,
  busy
}: {
  onClose: () => void
  onSelect: (s: UiOrderStatus) => void
  busy: boolean
}) {
  const options: { label: UiOrderStatus; cls: string }[] = [
    { label: 'Delivery In Process', cls: 'bg-orange-50 text-orange-600 hover:bg-orange-100' },
    { label: 'Completed', cls: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
    { label: 'Cancelled', cls: 'bg-slate-100 text-slate-600 hover:bg-slate-200' },
    { label: 'In Process', cls: 'bg-rose-50 text-rose-600 hover:bg-rose-100' }
  ]

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-card w-full max-w-md p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 h-8 w-8 rounded-full bg-suzuki-red text-white flex items-center justify-center hover:bg-red-700"
        >
          <X size={16} />
        </button>
        <h3 className="text-lg font-extrabold text-suzuki-ink mb-5">Change Order Status</h3>
        <div className="grid grid-cols-2 gap-3">
          {options.map((o) => (
            <button
              key={o.label}
              type="button"
              disabled={busy}
              onClick={() => onSelect(o.label)}
              className={clsx(
                'rounded-xl py-4 px-3 text-sm font-bold transition-colors disabled:opacity-50',
                o.cls
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function DeliveryModal({
  order,
  busy,
  onClose,
  onStart
}: {
  order: OrderDetail
  busy: boolean
  onClose: () => void
  onStart: () => void
}) {
  const name = order.retailerName || order.distributorName
  const address = order.retailerAddress || order.distributorAddress || '—'
  const mobile = order.retailerMobile || order.distributorMobile || '—'
  const city = order.regionName || '—'
  const district = address.split(',').slice(-1)[0]?.trim() || '—'

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-card w-full max-w-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-5">
          <h3 className="text-xl font-extrabold text-suzuki-ink">Delivery</h3>
          <HelpCircle size={16} className="text-suzuki-mute" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Retailer Name" value={name} />
          <Field label="City" value={city} />
          <Field label="District" value={district} />
          <Field label="Address" value={address} className="sm:col-span-2" />
          <Field label="Contact Number" value={mobile} className="sm:col-span-2" />
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={onStart}
          className="mt-6 w-full rounded-xl bg-suzuki-red text-white font-extrabold py-3.5 tracking-wide hover:bg-red-700 disabled:opacity-50"
        >
          START DELIVERY AND GENERATE LABELS
        </button>
      </div>
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
      <Label>{label}</Label>
      <div className="mt-1 rounded-xl bg-sky-50 border border-sky-100/80 px-3 py-2.5 text-sm font-semibold text-suzuki-navy min-h-[42px]">
        {value}
      </div>
    </div>
  )
}

function Label({ children }: { children: ReactNode }) {
  return <div className="text-xs font-bold text-suzuki-navy/80">{children}</div>
}

function StatusPill({ status }: { status: UiOrderStatus }) {
  const cls =
    status === 'Completed'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'Cancelled'
        ? 'bg-slate-200 text-slate-600'
        : status === 'Delivery In Process'
          ? 'bg-orange-100 text-orange-700'
          : status === 'Pending'
            ? 'bg-amber-100 text-amber-800'
            : 'bg-rose-100 text-rose-700'

  return (
    <span className={clsx('inline-flex rounded-full px-4 py-1.5 text-sm font-bold', cls)}>
      {status}
    </span>
  )
}

function PaymentPill({ value }: { value: string }) {
  const cls =
    value === 'Received'
      ? 'bg-emerald-100 text-emerald-700'
      : value === 'In Approval'
        ? 'bg-orange-100 text-orange-700'
        : 'bg-slate-100 text-slate-500'

  return (
    <div className={clsx('w-full rounded-xl text-center py-2.5 text-sm font-bold', cls)}>
      {value}
    </div>
  )
}
