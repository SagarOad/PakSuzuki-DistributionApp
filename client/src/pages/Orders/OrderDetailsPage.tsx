import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, FileSpreadsheet, HelpCircle, ImageIcon, Pencil, X,
  Package, Truck, PackageCheck
} from 'lucide-react'
import clsx from 'clsx'
import { api } from '@/api/axiosClient'
import { useAuth } from '@/context/AuthContext'
import {
  type OrderDetail,
  type UiOrderStatus,
  formatOrderDate,
  formatRs,
  getOrderTracking,
  locationLine,
  displayOrderQty,
  displayLineAmount,
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
  const [labelsModalOpen, setLabelsModalOpen] = useState(false)
  const [podModalOpen, setPodModalOpen] = useState(false)
  const [podFile, setPodFile] = useState<File | null>(null)
  const [podPreview, setPodPreview] = useState<string | null>(null)
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
      setLabelsModalOpen(false)
      setPodModalOpen(false)
      setPodFile(null)
      setPodPreview(null)
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

  const isDistributorDirect = order?.source === 'DistributorDirectOrder'
  const isRetailerOrder = order?.source === 'RetailerOrder'
  /** Ship-to-Party: threshold-eligible retailer — Pak Suzuki delivers directly to retailer. */
  const isShipToParty = !!(isRetailerOrder && order?.thresholdReached)
  /** Who physically ships / may advance delivery status. */
  const pakSuzukiDelivers = !!(isDistributorDirect || isShipToParty)
  const canShip =
    (pakSuzukiDelivers && isStaff) || (isRetailerOrder && !isShipToParty && isDistributor)
  /** Distributor pending tools (amend / partial / manufacturer cart) — not for Ship-to-Party. */
  const canDistributorFulfillTools =
    isDistributor && isRetailerOrder && !isShipToParty && order?.status === 'PendingDistributorApproval'
  const canDistributorConfirm =
    isDistributor && isRetailerOrder && order?.status === 'PendingDistributorApproval'
  const canStaffPending =
    isStaff && pakSuzukiDelivers && order?.status === 'PendingPakSuzukiApproval'

  const confirmOrder = async () => {
    if (!order) return
    setError(null)
    try {
      if (canStaffPending) {
        await pakSuzukiAction.mutateAsync('ApprovedByPakSuzuki')
        return
      }
      if (canDistributorConfirm) {
        // Ship-to-Party Confirm → PendingPakSuzukiApproval (API). Normal → ApprovedByDistributor.
        await distributorAction.mutateAsync('ApprovedByDistributor')
      }
    } catch {
      /* error state set by mutation */
    }
  }

  const cancelOrder = async () => {
    if (!order) return
    setError(null)
    if (canStaffPending) {
      await pakSuzukiAction.mutateAsync('Cancelled')
      return
    }
    if (canDistributorConfirm) {
      await distributorAction.mutateAsync('RejectedByDistributor')
    }
  }

  const startDeliveryWithLabels = async () => {
    await patchStatus.mutateAsync('PartiallyDelivered')
  }

  const openPodModal = () => setPodModalOpen(true)

  const confirmPodDelivered = async () => {
    if (!id) return
    setError(null)
    try {
      if (podFile) {
        const form = new FormData()
        form.append('file', podFile)
        await api.post(`/orders/proof-of-delivery/${id}`, form, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
      }
      await patchStatus.mutateAsync('Delivered')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string; title?: string } } })?.response?.data
      setError(msg?.detail || msg?.title || 'Could not mark delivered / upload proof.')
    }
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
  const canAmend = canDistributorFulfillTools
  const showTracking =
    !showCompletedTabs &&
    (uiStatus === 'In Process' ||
      uiStatus === 'Delivery In Process' ||
      (pakSuzukiDelivers && uiStatus === 'Pending'))
  const tracking = getOrderTracking(order.status)
  const canEditStatus = isStaff && pakSuzukiDelivers && uiStatus !== 'Completed' && uiStatus !== 'Cancelled'

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

        <div className="flex flex-wrap items-center gap-2">
          {canAmend && (
            <button
              type="button"
              onClick={() => navigate(`/orders/${order.id}/amend`)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-suzuki-blue/40 bg-white px-4 py-2.5 text-sm font-bold text-suzuki-blue hover:bg-suzuki-ice"
            >
              <Pencil size={14} /> Amend Order
            </button>
          )}
          {isShipToParty && (
            <div className="inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700">
              <AlertTriangle size={16} className="shrink-0" />
              Ship-to-Party: Threshold Reached — Pak Suzuki delivers to retailer
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      {activeTab === 'summary' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <OrderInfoCard order={order} uiStatus={uiStatus} />
            <DeliveryPaymentCard
              order={order}
              uiStatus={uiStatus}
              payment={pay}
              showProof
            />
          </div>
          <OrderSummaryCard
            order={order}
            uiStatus={uiStatus}
            canEditStatus={canEditStatus}
            onEditStatus={() => setStatusModalOpen(true)}
          />
          {showTracking && <OrderTrackingPanel tracking={tracking} />}
        </div>
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
            canEditStatus={canEditStatus}
            onEditStatus={() => setStatusModalOpen(true)}
            note={note}
            onNoteChange={setNote}
            showNote={canDistributorConfirm || canStaffPending || canShip}
            distributorNote={
              order.status === 'SentBackForModification' || order.distributorRemarks
                ? order.distributorRemarks
                : null
            }
            footer={
              <OrderActions
                uiStatus={uiStatus}
                busy={busy}
                canShip={canShip}
                showPendingActions={canDistributorConfirm || canStaffPending}
                showFulfillTools={canDistributorFulfillTools}
                isShipToParty={isShipToParty}
                needsLabelsFlow={isShipToParty && isStaff}
                onCancel={cancelOrder}
                onConfirm={confirmOrder}
                onAmend={canDistributorFulfillTools ? () => navigate(`/orders/${order.id}/amend`) : undefined}
                onForwardToManufacturer={
                  canDistributorFulfillTools ? () => navigate(`/orders/${order.id}/amend`) : undefined
                }
                onStartDelivery={() => {
                  if (isShipToParty && isStaff) setLabelsModalOpen(true)
                  else void patchStatus.mutateAsync('PartiallyDelivered')
                }}
                onMarkDelivered={openPodModal}
                onViewSummary={() => setTab('summary')}
              />
            }
          />

          {showTracking && <OrderTrackingPanel tracking={tracking} />}
        </>
      )}

      {statusModalOpen && (
        <ChangeStatusModal
          onClose={() => setStatusModalOpen(false)}
          onSelect={applyUiStatus}
          busy={busy}
        />
      )}

      {labelsModalOpen && (
        <LabelsDeliveryModal
          order={order}
          busy={busy}
          onClose={() => setLabelsModalOpen(false)}
          onConfirm={startDeliveryWithLabels}
        />
      )}

      {podModalOpen && (
        <PodDeliveryModal
          order={order}
          busy={busy}
          podPreview={podPreview}
          onClose={() => {
            setPodModalOpen(false)
            setPodFile(null)
            setPodPreview(null)
          }}
          onFile={(file) => {
            setPodFile(file)
            setPodPreview(file ? URL.createObjectURL(file) : null)
          }}
          onConfirm={confirmPodDelivered}
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
        <h3 className="font-bold text-suzuki-navy">
          {order.retailerName ? 'Retailer Detail' : 'Distributor Detail'}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label={order.retailerName ? 'Retailor Name' : 'Distributor Name'}
            value={order.retailerName || order.distributorName}
          />
          <Field
            label="Location"
            value={locationLine(order.regionName, order.retailerAddress || order.distributorAddress)}
          />
          <Field
            label="Address"
            value={order.retailerAddress || order.distributorAddress || '—'}
            className="sm:col-span-2"
          />
          <Field
            label="Contact Number"
            value={order.retailerMobile || order.distributorMobile || '—'}
          />
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
          <div className="mt-1.5 flex flex-wrap gap-2">
            {order.proofsOfDelivery.length === 0 ? (
              <div className="aspect-square max-w-[140px] w-full rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center">
                <span className="text-suzuki-mute font-bold text-sm flex flex-col items-center gap-1">
                  <ImageIcon size={22} /> IMG
                </span>
              </div>
            ) : (
              order.proofsOfDelivery.map((proof) => (
                <a
                  key={proof.id}
                  href={proof.storageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="aspect-square w-[140px] rounded-xl bg-sky-50 border border-sky-100 overflow-hidden"
                >
                  <img src={proof.storageUrl} alt={proof.fileName} className="w-full h-full object-cover" />
                </a>
              ))
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
  distributorNote,
  footer
}: {
  order: OrderDetail
  uiStatus: UiOrderStatus
  canEditStatus?: boolean
  onEditStatus?: () => void
  note?: string
  onNoteChange?: (v: string) => void
  showNote?: boolean
  distributorNote?: string | null
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

      {distributorNote ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-extrabold">Distributor note: </span>
          {distributorNote}
        </div>
      ) : null}

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
                  <span className="font-bold text-suzuki-red">
                    {item.variantTypeName || item.requestedUnit}
                  </span>
                </span>
                <span>
                  Unit:{' '}
                  <span className="font-bold text-suzuki-red">{displayOrderQty(item)}</span>
                  {item.approvedQuantity != null &&
                    item.approvedQuantity !== item.requestedQuantity && (
                      <span className="text-suzuki-mute font-semibold">
                        {' '}
                        (requested {item.requestedQuantity})
                      </span>
                    )}
                </span>
              </div>
            </div>
            <div className="text-lg font-extrabold text-suzuki-blue sm:text-right shrink-0">
              {formatRs(displayLineAmount(item))}
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
  canShip,
  showPendingActions,
  showFulfillTools,
  isShipToParty,
  needsLabelsFlow,
  onCancel,
  onConfirm,
  onAmend,
  onForwardToManufacturer,
  onStartDelivery,
  onMarkDelivered,
  onViewSummary
}: {
  uiStatus: UiOrderStatus
  busy: boolean
  /** Only the party who delivers may Start Delivery / Mark Delivered. */
  canShip: boolean
  showPendingActions: boolean
  /** Distributor amend / partial / manufacturer — never Super Admin. */
  showFulfillTools: boolean
  isShipToParty: boolean
  needsLabelsFlow: boolean
  onCancel: () => void
  onConfirm: () => void
  onAmend?: () => void
  onForwardToManufacturer?: () => void
  onStartDelivery: () => void
  onMarkDelivered: () => void
  onViewSummary: () => void
}) {
  if (uiStatus === 'Completed') {
    return (
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={onViewSummary}
          className="rounded-xl bg-suzuki-navy text-white font-extrabold px-8 py-3 tracking-wide hover:bg-suzuki-blue"
        >
          ORDER SUMMARY
        </button>
      </div>
    )
  }

  if (uiStatus === 'Pending' && showPendingActions) {
    return (
      <div className="flex flex-col gap-3 pt-2">
        <p className="text-xs text-suzuki-mute">
          {isShipToParty
            ? 'Ship-to-Party: Confirm sends this order to Pak Suzuki for direct delivery to the retailer.'
            : showFulfillTools
              ? 'Confirm if you can fulfill fully from inventory. Amend for partial / send-back / order to manufacturer.'
              : 'Confirm or cancel this manufacturer order.'}
        </p>
        <div className="flex flex-col sm:flex-row flex-wrap gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="flex-1 rounded-xl bg-sky-100 text-suzuki-navy font-extrabold py-3 tracking-wide hover:bg-sky-200 disabled:opacity-50"
          >
            CANCELED
          </button>
          {showFulfillTools && onAmend && (
            <button
              type="button"
              disabled={busy}
              onClick={onAmend}
              className="flex-1 rounded-xl border border-suzuki-blue text-suzuki-blue font-extrabold py-3 tracking-wide hover:bg-suzuki-ice disabled:opacity-50"
            >
              AMEND / PARTIAL
            </button>
          )}
          {showFulfillTools && onForwardToManufacturer && (
            <button
              type="button"
              disabled={busy}
              onClick={onForwardToManufacturer}
              className="flex-1 rounded-xl border border-suzuki-navy text-suzuki-navy font-extrabold py-3 tracking-wide hover:bg-suzuki-mist disabled:opacity-50"
            >
              ORDER TO MANUFACTURER
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-suzuki-red text-white font-extrabold py-3 tracking-wide hover:bg-red-700 disabled:opacity-50"
          >
            CONFIRM ORDER
          </button>
        </div>
      </div>
    )
  }

  if (!canShip) {
    // Orderer / other party: tracking only (panel rendered separately).
    return null
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
          {needsLabelsFlow ? 'START DELIVERY' : 'START DELIVERY'}
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
          MARK AS DELIVERED
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

function LabelsDeliveryModal({
  order,
  busy,
  onClose,
  onConfirm
}: {
  order: OrderDetail
  busy: boolean
  onClose: () => void
  onConfirm: () => void
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
          <Field label="Retailor Name" value={name || '—'} />
          <Field label="City" value={city} />
          <Field label="District" value={district} />
          <Field label="Address" value={address} className="sm:col-span-2" />
          <Field label="Contact Number" value={mobile} className="sm:col-span-2" />
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="mt-6 w-full rounded-xl bg-suzuki-red text-white font-extrabold py-3.5 tracking-wide hover:bg-red-700 disabled:opacity-50"
        >
          START DELIVERY AND GENERATE LABELS
        </button>
      </div>
    </div>
  )
}

function PodDeliveryModal({
  order,
  busy,
  podPreview,
  onClose,
  onFile,
  onConfirm
}: {
  order: OrderDetail
  busy: boolean
  podPreview: string | null
  onClose: () => void
  onFile: (file: File | null) => void
  onConfirm: () => void
}) {
  const name = order.retailerName || order.distributorName
  const address = order.retailerAddress || order.distributorAddress || '—'
  const mobile = order.retailerMobile || order.distributorMobile || '—'
  const city = order.regionName || '—'
  const district = address.split(',').slice(-1)[0]?.trim() || '—'

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-5">
          <h3 className="text-xl font-extrabold text-suzuki-ink">Delivery</h3>
          <HelpCircle size={16} className="text-suzuki-mute" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Retailor Name" value={name || '—'} />
          <Field label="City" value={city} />
          <Field label="District" value={district} />
          <Field label="Address" value={address} className="sm:col-span-2" />
          <Field label="Contact Number" value={mobile} className="sm:col-span-2" />
        </div>

        <div className="mt-4">
          <Label>Proof of Delivery Image</Label>
          <label className="mt-1.5 flex flex-col items-center justify-center gap-2 min-h-[140px] rounded-xl border border-dashed border-sky-200 bg-sky-50 cursor-pointer hover:bg-sky-100 overflow-hidden">
            {podPreview ? (
              <img src={podPreview} alt="POD preview" className="max-h-40 object-contain" />
            ) : (
              <>
                <ImageIcon size={28} className="text-suzuki-mute" />
                <span className="text-sm font-semibold text-suzuki-mute">Click or drag and drop image</span>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="mt-6 w-full rounded-xl bg-suzuki-red text-white font-extrabold py-3.5 tracking-wide hover:bg-red-700 disabled:opacity-50"
        >
          CONFIRM
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

function OrderTrackingPanel({
  tracking
}: {
  tracking: ReturnType<typeof getOrderTracking>
}) {
  const steps = [
    {
      key: 'processed' as const,
      label: 'Order Processed',
      icon: Package,
      done: tracking.processed
    },
    {
      key: 'readyToShip' as const,
      label: 'Ready To Ship',
      icon: Truck,
      done: tracking.readyToShip
    },
    {
      key: 'delivered' as const,
      label: 'Delivered',
      icon: PackageCheck,
      done: tracking.delivered
    }
  ]

  return (
    <section className="space-y-3">
      <h3 className="text-lg font-extrabold text-suzuki-navy">Order Tracking</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {steps.map(({ key, label, icon: Icon, done }) => {
          const active = tracking.current === key
          return (
            <div
              key={key}
              className={clsx(
                'rounded-2xl border px-4 py-8 flex flex-col items-center justify-center text-center gap-3 min-h-[140px]',
                active
                  ? 'bg-suzuki-red border-suzuki-red text-white shadow-card'
                  : done
                    ? 'bg-white border-suzuki-red/40 text-suzuki-navy'
                    : 'bg-white border-suzuki-line text-suzuki-mute'
              )}
            >
              <Icon size={36} strokeWidth={1.75} className={active ? 'text-white' : done ? 'text-suzuki-red' : ''} />
              <span className={clsx('text-sm font-extrabold', active ? 'text-white' : '')}>{label}</span>
            </div>
          )
        })}
      </div>
    </section>
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
