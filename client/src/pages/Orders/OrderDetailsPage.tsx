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
import { downloadExcel } from '@/utils/excelExport'
import {
  type OrderDetail,
  type UiOrderStatus,
  formatOrderDate,
  formatRs,
  getOrderTracking,
  locationLine,
  displayOrderQty,
  displayLineAmount,
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
  const [podTrackingNote, setPodTrackingNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [passModalOpen, setPassModalOpen] = useState(false)
  const [shipTo, setShipTo] = useState<'Distributor' | 'Retailer'>('Distributor')

  const isStaff = role === 'SuperAdmin' || role === 'Admin'
  const isDistributor = role === 'Distributor'

  const detailQuery = useQuery({
    queryKey: ['order-detail', id],
    enabled: !!id,
    queryFn: async () => (await api.get<OrderDetail>(`/orders/${id}`)).data
  })

  const order = detailQuery.data
  const statusCode = order?.statusCode || order?.status || ''
  const uiStatus = order ? toUiStatus(order.status, order.statusCode) : 'Pending'

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
    mutationFn: async (payload: {
      decision: string
      fulfillmentChoice?: string | null
      pakSuzukiShipTo?: string | null
    }) =>
      api.post(`/orders/distributor-action/${id}`, {
        decision: payload.decision,
        remarks: note || null,
        amendedItems: null,
        fulfillmentChoice: payload.fulfillmentChoice ?? null,
        pakSuzukiShipTo: payload.pakSuzukiShipTo ?? null
      }),
    onSuccess: async () => {
      setError(null)
      await invalidate()
    },
    onError: (e: unknown) => {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Could not action this order.')
    }
  })

  const refreshSap = useMutation({
    mutationFn: async () => (await api.get(`/orders/sap-status/${id}`)).data,
    onSuccess: async () => {
      setError(null)
      await invalidate()
    },
    onError: (e: unknown) => {
      setError(
        (e as { response?: { data?: { detail?: string; title?: string; message?: string } } })?.response
          ?.data?.detail ||
          (e as { response?: { data?: { title?: string } } })?.response?.data?.title ||
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Could not refresh manufacturer status.'
      )
    }
  })

  const retrySap = useMutation({
    mutationFn: async () => {
      if (!window.confirm('Re-queue this order for the manufacturer system?')) throw new Error('cancelled')
      await api.post(`/orders/retry-sap/${id}`)
    },
    onSuccess: async () => {
      setError(null)
      await invalidate()
    },
    onError: (e: unknown) => {
      if ((e as Error)?.message === 'cancelled') return
      setError(
        (e as { response?: { data?: { detail?: string; title?: string; message?: string } } })?.response
          ?.data?.detail ||
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Could not re-queue order.'
      )
    }
  })

  const busy =
    patchStatus.isPending ||
    pakSuzukiAction.isPending ||
    distributorAction.isPending ||
    refreshSap.isPending ||
    retrySap.isPending

  const isDistributorDirect = order?.source === 'DistributorDirectOrder'
  const isRetailerOrder = order?.source === 'RetailerOrder'
  const thresholdMet = !!(order?.thresholdMet ?? order?.thresholdReached)
  const passedToPakSuzuki = order?.fulfillmentChoice === 'PassToPakSuzuki'
  const isShipToParty = !!(isRetailerOrder && passedToPakSuzuki && order?.pakSuzukiShipTo === 'Retailer')
  const pakSuzukiDelivers = !!(isDistributorDirect || passedToPakSuzuki)
  const canShip =
    (pakSuzukiDelivers && isStaff) || (isRetailerOrder && !passedToPakSuzuki && isDistributor)
  const canDistributorFulfillTools =
    isDistributor &&
    isRetailerOrder &&
    statusCode === 'PendingDistributorApproval' &&
    !order?.pakSuzukiActionedAtUtc
  const canDistributorConfirm = canDistributorFulfillTools
  /** Super Admin amended qty and sent back — approve as-is or change qty, then return to Pak Suzuki. */
  const canDistributorReviewPakSuzukiAmendment =
    isDistributor &&
    statusCode === 'PendingDistributorApproval' &&
    !!order?.pakSuzukiActionedAtUtc
  const canStaffPending =
    isStaff && pakSuzukiDelivers && statusCode === 'PendingPakSuzukiApproval'
  const canStaffAmend = canStaffPending
  const canAmend =
    canDistributorFulfillTools || canStaffAmend || canDistributorReviewPakSuzukiAmendment
  const showDistributorPendingActions =
    canDistributorConfirm || canDistributorReviewPakSuzukiAmendment

  const confirmOrder = async () => {
    if (!order) return
    const ok = window.confirm(
      canStaffPending
        ? 'Confirm this order? It will be queued for the manufacturer system.'
        : canDistributorReviewPakSuzukiAmendment
          ? 'Approve these quantities and send the order back to Pak Suzuki?'
          : 'Fulfill this order from your own stock?'
    )
    if (!ok) return
    setError(null)
    try {
      if (canStaffPending) {
        await pakSuzukiAction.mutateAsync('ApprovedByPakSuzuki')
        return
      }
      if (canDistributorReviewPakSuzukiAmendment) {
        await distributorAction.mutateAsync({
          decision: 'ForwardedToPakSuzuki',
          fulfillmentChoice: 'PassToPakSuzuki',
          pakSuzukiShipTo: order.pakSuzukiShipTo || 'Distributor'
        })
        return
      }
      if (canDistributorConfirm) {
        await distributorAction.mutateAsync({
          decision: 'ApprovedByDistributor',
          fulfillmentChoice: 'DistributorSelf'
        })
      }
    } catch {
      /* error state set by mutation */
    }
  }

  const passToPakSuzuki = async () => {
    if (!order) return
    const ok = window.confirm(
      `Pass this order to Pak Suzuki (ship to ${shipTo === 'Retailer' ? 'retailer' : 'distributor'})?`
    )
    if (!ok) return
    setError(null)
    try {
      await distributorAction.mutateAsync({
        decision: 'ForwardedToPakSuzuki',
        fulfillmentChoice: 'PassToPakSuzuki',
        pakSuzukiShipTo: shipTo
      })
      setPassModalOpen(false)
    } catch {
      /* error state set by mutation */
    }
  }

  const cancelOrder = async () => {
    if (!order) return
    const ok = window.confirm(
      canStaffPending
        ? 'Cancel / reject this manufacturer order?'
        : 'Reject this order and send it back to the retailer for changes?'
    )
    if (!ok) return
    setError(null)
    if (canStaffPending) {
      await pakSuzukiAction.mutateAsync('Cancelled')
      return
    }
    if (canDistributorConfirm) {
      await distributorAction.mutateAsync({ decision: 'RejectedByDistributor' })
    }
  }

  const startDeliveryWithLabels = async () => {
    if (!window.confirm('Start delivery for this order?')) return
    await patchStatus.mutateAsync('PartiallyDelivered')
  }

  const openPodModal = () => setPodModalOpen(true)

  const confirmPodDelivered = async () => {
    if (!id) return
    if (!window.confirm('Mark this order as delivered?')) return
    setError(null)
    try {
      if (podFile) {
        const form = new FormData()
        form.append('file', podFile)
        await api.post(`/orders/proof-of-delivery/${id}`, form, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
      }
      await api.patch(`/orders/status/${id}`, {
        status: 'Delivered',
        remarks: podTrackingNote.trim() || null
      })
      setPodModalOpen(false)
      setPodFile(null)
      setPodPreview(null)
      setPodTrackingNote('')
      await invalidate()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string; title?: string; message?: string } } })?.response?.data
      setError(msg?.detail || msg?.title || msg?.message || 'Could not mark delivered / upload proof.')
    }
  }

  const applyUiStatus = async (ui: UiOrderStatus) => {
    if (!window.confirm(`Change order status to "${ui}"?`)) return
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
  const allowsPartialDelivery = order.allowsPartialDelivery
  const showTracking =
    !showCompletedTabs &&
    (uiStatus === 'In Process' ||
      uiStatus === 'Delivery In Process' ||
      (pakSuzukiDelivers && uiStatus === 'Pending'))
  const tracking = getOrderTracking(order.status, order.statusCode)
  const canEditStatus = isStaff && pakSuzukiDelivers && uiStatus !== 'Completed' && uiStatus !== 'Cancelled'
  const showManufacturerQueue =
    (isStaff || isDistributor) &&
    !!(
      pakSuzukiDelivers ||
      order.poRef ||
      order.middlewareStatus ||
      order.sapDocumentNumber ||
      statusCode === 'SubmittedToSap' ||
      statusCode === 'ApprovedByPakSuzuki' ||
      statusCode === 'PendingPakSuzukiApproval' ||
      statusCode === 'ForwardedToPakSuzuki'
    )
  const canRefreshSap = isStaff && !!(order.poRef || order.middlewareStatus || order.sapDocumentNumber || statusCode === 'SubmittedToSap')
  const canRetrySap = isStaff && !!(order.poRef || order.middlewareStatus || statusCode === 'SubmittedToSap' || statusCode === 'ApprovedByPakSuzuki')

  const orderInfoProps = {
    order,
    uiStatus,
    showManufacturerQueue,
    canRefreshSap,
    canRetrySap,
    sapBusy: refreshSap.isPending || retrySap.isPending,
    onRefreshSap: () => void refreshSap.mutateAsync(),
    onRetrySap: () => void retrySap.mutateAsync()
  }

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
          {canDistributorReviewPakSuzukiAmendment && (
            <div className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900">
              <AlertTriangle size={16} className="shrink-0" />
              Pak Suzuki amended quantities — approve them or change qty, then send back to Pak Suzuki.
            </div>
          )}
          {canAmend && (
            <button
              type="button"
              onClick={() => {
                if (!window.confirm('Open amend quantities for this order?')) return
                navigate(`/orders/${order.id}/amend`)
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-suzuki-blue/40 bg-white px-4 py-2.5 text-sm font-bold text-suzuki-blue hover:bg-suzuki-ice"
            >
              <Pencil size={14} /> Amend Order
            </button>
          )}
          {thresholdMet && isRetailerOrder && (
            <div className="inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700">
              <AlertTriangle size={16} className="shrink-0" />
              {passedToPakSuzuki
                ? `Threshold met — passed to Pak Suzuki (${order?.pakSuzukiShipTo === 'Retailer' ? 'ship to retailer' : 'ship to distributor'})`
                : 'Threshold met — you can fulfill this order or pass it to Pak Suzuki'}
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
            <OrderInfoCard {...orderInfoProps} />
            <DeliveryDetailsCard
              order={order}
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
            <OrderInfoCard {...orderInfoProps} />
            <DeliveryDetailsCard
              order={order}
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
            showNote={showDistributorPendingActions || canStaffPending || canShip}
            distributorNote={order.distributorRemarks || null}
            pakSuzukiNote={order.pakSuzukiRemarks || null}
            retailerNote={order.retailerRemarks}
            footer={
              <OrderActions
                uiStatus={uiStatus}
                busy={busy}
                canShip={canShip}
                allowsPartialDelivery={allowsPartialDelivery}
                showPendingActions={showDistributorPendingActions || canStaffPending}
                showFulfillTools={canDistributorFulfillTools}
                resubmitToPakSuzuki={canDistributorReviewPakSuzukiAmendment}
                thresholdMet={thresholdMet}
                needsLabelsFlow={isShipToParty && isStaff}
                onCancel={
                  canDistributorReviewPakSuzukiAmendment
                    ? undefined
                    : cancelOrder
                }
                onConfirm={confirmOrder}
                onAmend={
                  canAmend
                    ? () => {
                        if (!window.confirm('Open amend quantities for this order?')) return
                        navigate(`/orders/${order.id}/amend`)
                      }
                    : undefined
                }
                onPassToPakSuzuki={
                  canDistributorFulfillTools && thresholdMet ? () => setPassModalOpen(true) : undefined
                }
                onStartDelivery={() => {
                  if (isShipToParty && isStaff) setLabelsModalOpen(true)
                  else {
                    if (!window.confirm('Start delivery for this order?')) return
                    void patchStatus.mutateAsync('PartiallyDelivered')
                  }
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
          allowsPartialDelivery={allowsPartialDelivery}
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
          trackingNote={podTrackingNote}
          onTrackingNoteChange={setPodTrackingNote}
          onClose={() => {
            setPodModalOpen(false)
            setPodFile(null)
            setPodPreview(null)
            setPodTrackingNote('')
          }}
          onFile={(file) => {
            setPodFile(file)
            setPodPreview(file && file.type.startsWith('image/') ? URL.createObjectURL(file) : null)
          }}
          onConfirm={confirmPodDelivered}
        />
      )}

      {passModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setPassModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-card w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-extrabold text-suzuki-navy">Pass to Pak Suzuki</h3>
            <p className="text-sm text-suzuki-mute">
              This order met the pack threshold. Tell Pak Suzuki where to deliver.
            </p>
            <label className="block space-y-2">
              <span className="text-xs font-bold uppercase text-suzuki-mute">Deliver to</span>
              <select
                className="field w-full"
                value={shipTo}
                onChange={(e) => setShipTo(e.target.value as 'Distributor' | 'Retailer')}
              >
                <option value="Distributor">Ship to distributor</option>
                <option value="Retailer">Ship to retailer</option>
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPassModalOpen(false)} className="rounded-lg bg-suzuki-ice px-4 py-2 text-sm font-bold">
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void passToPakSuzuki()}
                className="rounded-lg bg-suzuki-red text-white px-4 py-2 text-sm font-bold disabled:opacity-50"
              >
                Pass order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function OrderInfoCard({
  order,
  uiStatus,
  showManufacturerQueue,
  canRefreshSap,
  canRetrySap,
  sapBusy,
  onRefreshSap,
  onRetrySap
}: {
  order: OrderDetail
  uiStatus: UiOrderStatus
  showManufacturerQueue?: boolean
  canRefreshSap?: boolean
  canRetrySap?: boolean
  sapBusy?: boolean
  onRefreshSap?: () => void
  onRetrySap?: () => void
}) {
  const sapSummary = manufacturerQueueSummary(order)

  return (
    <section className="bg-white rounded-2xl border border-suzuki-line shadow-card p-5 space-y-4">
      <h2 className="text-xl font-extrabold text-suzuki-blue">
        Order Number : {order.orderNumber}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Order Date" value={formatOrderDate(order.createdAtUtc)} />
        <div>
          <Label>Order Status</Label>
          <StatusPill
            status={uiStatus}
            label={order.statusLabel || undefined}
            statusColor={order.statusColor}
          />
        </div>
      </div>

      {(order.materialSourceCode || order.deliveryTypeCode || order.supplierCode) && (
        <div className="border-t border-suzuki-line pt-4 space-y-3">
          <h3 className="font-bold text-suzuki-navy">PO lane</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Vendor" value={order.vendorCode || 'PSMC'} />
            <Field label="Source" value={order.materialSourceCode || '—'} />
            <Field
              label="Delivery type"
              value={
                order.deliveryTypeCode
                  ? `${order.deliveryTypeCode}${order.deliveryTypeName ? ` — ${order.deliveryTypeName}` : ''}`
                  : '—'
              }
            />
            <Field label="Supplier" value={order.supplierCode || '—'} />
          </div>
        </div>
      )}

      {(order.thresholdMet || order.snapshotDistributorCode || order.fulfillmentChoice) && (
        <div className="border-t border-suzuki-line pt-4 space-y-3">
          <h3 className="font-bold text-suzuki-navy">Fulfillment</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Threshold" value={order.thresholdMet ? 'Met' : 'Not met'} />
            <Field label="Choice" value={order.fulfillmentChoice === 'PassToPakSuzuki' ? 'Pass to Pak Suzuki' : order.fulfillmentChoice === 'DistributorSelf' ? 'Distributor fulfills' : '—'} />
            <Field label="Pak Suzuki ship to" value={order.pakSuzukiShipTo || '—'} />
            <Field label="Distributor code" value={order.snapshotDistributorCode || '—'} />
            <Field label="Retailer code" value={order.snapshotRetailerCode || '—'} />
            <Field label="Ship-to code" value={order.shipToCode || '—'} />
            <Field label="Bill-to code" value={order.billToCode || '—'} />
          </div>
        </div>
      )}

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

      {showManufacturerQueue && (
        <div className="border-t border-suzuki-line pt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold text-suzuki-navy">Manufacturer / SAP queue</h3>
            <div className="flex flex-wrap gap-2">
              {canRefreshSap && (
                <button
                  type="button"
                  disabled={sapBusy}
                  onClick={onRefreshSap}
                  className="rounded-lg bg-suzuki-ice text-suzuki-navy text-xs font-bold px-3 py-1.5 disabled:opacity-50"
                >
                  Refresh status
                </button>
              )}
              {canRetrySap && (
                <button
                  type="button"
                  disabled={sapBusy}
                  onClick={onRetrySap}
                  className="rounded-lg border border-suzuki-red/40 text-suzuki-red text-xs font-bold px-3 py-1.5 disabled:opacity-50"
                >
                  Re-queue for SAP
                </button>
              )}
            </div>
          </div>

          <div
            className={clsx(
              'rounded-xl px-4 py-3 text-sm font-semibold',
              sapSummary.tone === 'green' && 'bg-emerald-50 text-emerald-800 border border-emerald-200',
              sapSummary.tone === 'amber' && 'bg-amber-50 text-amber-900 border border-amber-200',
              sapSummary.tone === 'red' && 'bg-rose-50 text-rose-800 border border-rose-200',
              sapSummary.tone === 'grey' && 'bg-suzuki-mist text-suzuki-navy border border-suzuki-line'
            )}
          >
            {sapSummary.title}
            <p className="mt-1 text-xs font-normal opacity-90">{sapSummary.detail}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="PO Ref" value={order.poRef || order.orderNumber} />
            <Field label="Queue status" value={order.middlewareStatus || '—'} />
            <Field label="SAP sales order #" value={order.sapDocumentNumber || 'Not created yet'} />
            <Field label="Delivery #" value={order.sapDeliveryNumber || '—'} />
            <Field label="Invoice #" value={order.sapInvoiceNumber || '—'} />
            <Field
              label="Transfer code"
              value={order.sapTransferStatus != null ? String(order.sapTransferStatus) : '—'}
            />
            {order.sapMessage && (
              <Field label="System message" value={order.sapMessage} className="sm:col-span-2" />
            )}
          </div>
          <p className="text-[11px] text-suzuki-mute">
            Queued = row in parts_order waiting for middleware. Sales order / delivery / invoice fill in after
            SAP writes back.{' '}
            <a href="/orders/middleware" className="text-suzuki-blue font-semibold hover:underline">
              Open SAP Queue
            </a>
          </p>
        </div>
      )}
    </section>
  )
}

function manufacturerQueueSummary(order: OrderDetail): {
  title: string
  detail: string
  tone: 'green' | 'amber' | 'red' | 'grey'
} {
  const code = order.statusCode || order.status
  if (order.sapInvoiceNumber || code === 'InvoiceConfirmed') {
    return {
      title: 'Completed in manufacturer system',
      detail: 'Invoice number is available. This order finished the SAP cycle.',
      tone: 'green'
    }
  }
  if (order.sapDeliveryNumber || code === 'Delivered' || code === 'PartiallyDelivered') {
    return {
      title: 'Delivery recorded',
      detail: 'SAP delivery exists. Invoice may still be pending.',
      tone: 'amber'
    }
  }
  if (order.sapTransferStatus === 9 || (order.sapMessage && !order.sapDocumentNumber)) {
    return {
      title: 'Queue / SAP error',
      detail: order.sapMessage || 'Middleware reported an error. Use Re-queue if needed.',
      tone: 'red'
    }
  }
  if (order.sapDocumentNumber) {
    return {
      title: 'In SAP — sales order created',
      detail: `Sales order ${order.sapDocumentNumber}. Waiting for delivery / invoice updates.`,
      tone: 'amber'
    }
  }
  if (
    order.middlewareStatus ||
    order.poRef ||
    code === 'SubmittedToSap' ||
    code === 'ApprovedByPakSuzuki'
  ) {
    return {
      title: 'Queued for manufacturer system',
      detail:
        order.middlewareStatus ||
        'Added to the parts_order queue. Middleware has not returned a sales order number yet.',
      tone: 'red'
    }
  }
  if (code === 'PendingPakSuzukiApproval' || code === 'ForwardedToPakSuzuki') {
    return {
      title: 'Not queued yet',
      detail: 'Confirm this order as Pak Suzuki to add it to the SAP queue.',
      tone: 'grey'
    }
  }
  return {
    title: 'Not sent to manufacturer queue',
    detail: 'This order is not in the SAP middleware queue.',
    tone: 'grey'
  }
}

function DeliveryDetailsCard({
  order,
  showProof
}: {
  order: OrderDetail
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

      {order.distributorRemarks && (
        <div>
          <h3 className="font-bold text-suzuki-navy mb-2">Tracking Note</h3>
          <p className="text-sm text-suzuki-navy leading-relaxed rounded-xl bg-suzuki-mist/60 px-4 py-3">
            {order.distributorRemarks}
          </p>
        </div>
      )}

      {showProof && (
        <div>
          <Label>Delivery Attachment</Label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {order.proofsOfDelivery.length === 0 ? (
              <div className="aspect-square max-w-[140px] w-full rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center">
                <span className="text-suzuki-mute font-bold text-sm flex flex-col items-center gap-1">
                  <ImageIcon size={22} /> No file yet
                </span>
              </div>
            ) : (
              order.proofsOfDelivery.map((proof) => (
                <a
                  key={proof.id}
                  href={proof.storageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="aspect-square w-[140px] rounded-xl bg-sky-50 border border-sky-100 overflow-hidden flex flex-col items-center justify-center p-2 text-center"
                >
                  {proof.fileName.match(/\.(png|jpe?g|gif|webp)$/i) ? (
                    <img src={proof.storageUrl} alt={proof.fileName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-semibold text-suzuki-navy break-all">{proof.fileName}</span>
                  )}
                </a>
              ))
            )}
          </div>
        </div>
      )}
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
  pakSuzukiNote,
  retailerNote,
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
  pakSuzukiNote?: string | null
  retailerNote?: string | null
  footer?: ReactNode
}) {
  return (
    <section className="bg-white rounded-2xl border border-suzuki-line shadow-card p-5 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-extrabold text-suzuki-navy">Order Summary</h3>
        <button
          type="button"
          onClick={() =>
            downloadExcel(
              `order-${order.orderNumber}-lines`,
              [
                { header: 'Product', value: (i) => i.productName },
                { header: 'SKU', value: (i) => i.productSku },
                { header: 'Category', value: (i) => i.categoryName ?? '' },
                { header: 'Qty', value: (i) => displayOrderQty(i) },
                { header: 'Unit', value: (i) => i.requestedUnit },
                { header: 'Unit Price', value: (i) => i.unitPrice },
                { header: 'Line Subtotal', value: (i) => displayLineAmount(i) },
                { header: 'GST', value: (i) => i.lineGst },
                { header: 'FED', value: (i) => i.lineFed }
              ],
              order.items
            )
          }
          className="inline-flex items-center gap-1.5 rounded-lg border border-suzuki-blue/40 text-suzuki-blue px-3 py-2 text-xs font-semibold hover:bg-suzuki-ice"
        >
          <FileSpreadsheet size={14} /> Export Excel
        </button>
      </div>

      {retailerNote ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-suzuki-navy">
          <span className="font-extrabold">Retailer note: </span>
          {retailerNote}
        </div>
      ) : null}

      {pakSuzukiNote ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <span className="font-extrabold">Pak Suzuki amendment note: </span>
          {pakSuzukiNote}
        </div>
      ) : null}

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
          <StatusPill status={uiStatus} label={order.statusLabel || undefined} statusColor={order.statusColor} />
        </div>

        <div className="text-right space-y-1 min-w-[220px]">
          <div className="flex justify-between gap-8 text-sm">
            <span className="text-suzuki-mute font-semibold">Subtotal</span>
            <span className="font-bold text-suzuki-red">{formatRs(order.subTotal)}</span>
          </div>
          <div className="flex justify-between gap-8 text-sm">
            <span className="text-suzuki-mute font-semibold">GST TAX</span>
            <span className="font-bold text-suzuki-ink">
              {formatRs(order.totalGst)}
              <span className="text-suzuki-mute font-semibold ml-1">({order.gstPercent}%)</span>
            </span>
          </div>
          {order.totalFed > 0 && (
            <div className="flex justify-between gap-8 text-sm">
              <span className="text-suzuki-mute font-semibold">FED</span>
              <span className="font-bold text-suzuki-ink">{formatRs(order.totalFed)}</span>
            </div>
          )}
          <div className="flex justify-between gap-8 text-sm">
            <span className="text-suzuki-mute font-semibold">WHT (Advance Income Tax)</span>
            <span className="font-bold text-suzuki-ink">
              {formatRs(order.whtAmount)}
              <span className="text-suzuki-mute font-semibold ml-1">({order.whtPercent}%)</span>
            </span>
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
  allowsPartialDelivery,
  showPendingActions,
  showFulfillTools,
  resubmitToPakSuzuki,
  thresholdMet,
  needsLabelsFlow,
  onCancel,
  onConfirm,
  onAmend,
  onPassToPakSuzuki,
  onStartDelivery,
  onMarkDelivered,
  onViewSummary
}: {
  uiStatus: UiOrderStatus
  busy: boolean
  /** Only the party who delivers may Start Delivery / Mark Delivered. */
  canShip: boolean
  allowsPartialDelivery: boolean
  showPendingActions: boolean
  /** Distributor fulfill tools (fulfill myself / pass to manufacturer). */
  showFulfillTools: boolean
  /** Direct order returned by Pak Suzuki — resubmit only. */
  resubmitToPakSuzuki?: boolean
  thresholdMet?: boolean
  needsLabelsFlow: boolean
  onCancel?: () => void
  onConfirm: () => void
  onAmend?: () => void
  onPassToPakSuzuki?: () => void
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
          {resubmitToPakSuzuki
            ? 'Pak Suzuki sent a new amendment. Change quantities if needed (Amend Qty), then approve and resubmit.'
            : showFulfillTools
              ? thresholdMet
                ? 'Threshold is met. Fulfill this order yourself, or pass it to Pak Suzuki and choose where they should deliver.'
                : 'Confirm if you can fulfill the full pack order, or reject it so the retailer can change quantities.'
              : 'Confirm or cancel this manufacturer order.'}
        </p>
        <div className="flex flex-col sm:flex-row flex-wrap gap-3">
          {onCancel && (
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="flex-1 rounded-xl bg-sky-100 text-suzuki-navy font-extrabold py-3 tracking-wide hover:bg-sky-200 disabled:opacity-50"
            >
              {showFulfillTools ? 'REJECT / SEND BACK' : 'CANCELED'}
            </button>
          )}
          {onAmend && (
            <button
              type="button"
              disabled={busy}
              onClick={onAmend}
              className="flex-1 rounded-xl border border-suzuki-blue text-suzuki-blue font-extrabold py-3 tracking-wide hover:bg-suzuki-ice disabled:opacity-50"
            >
              AMEND QTY
            </button>
          )}
          {showFulfillTools && onPassToPakSuzuki && (
            <button
              type="button"
              disabled={busy}
              onClick={onPassToPakSuzuki}
              className="flex-1 rounded-xl border border-suzuki-navy text-suzuki-navy font-extrabold py-3 tracking-wide hover:bg-suzuki-mist disabled:opacity-50"
            >
              PASS TO PAK SUZUKI
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-suzuki-red text-white font-extrabold py-3 tracking-wide hover:bg-red-700 disabled:opacity-50"
          >
            {resubmitToPakSuzuki
              ? 'APPROVE & RESUBMIT'
              : showFulfillTools
                ? 'FULFILL MYSELF'
                : 'CONFIRM ORDER'}
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
        {allowsPartialDelivery ? (
          <button
            type="button"
            disabled={busy}
            onClick={onStartDelivery}
            className="rounded-xl bg-suzuki-red text-white font-extrabold px-8 py-3 tracking-wide hover:bg-red-700 disabled:opacity-50"
          >
            {needsLabelsFlow ? 'START DELIVERY' : 'START DELIVERY'}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={onMarkDelivered}
            className="rounded-xl bg-suzuki-navy text-white font-extrabold px-8 py-3 tracking-wide hover:bg-suzuki-blue disabled:opacity-50"
          >
            MARK AS DELIVERED
          </button>
        )}
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
  busy,
  allowsPartialDelivery
}: {
  onClose: () => void
  onSelect: (s: UiOrderStatus) => void
  busy: boolean
  allowsPartialDelivery: boolean
}) {
  const options: { label: UiOrderStatus; cls: string }[] = [
    ...(allowsPartialDelivery
      ? [{ label: 'Delivery In Process' as UiOrderStatus, cls: 'bg-orange-50 text-orange-600 hover:bg-orange-100' }]
      : []),
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
  trackingNote,
  onTrackingNoteChange,
  onClose,
  onFile,
  onConfirm
}: {
  order: OrderDetail
  busy: boolean
  podPreview: string | null
  trackingNote: string
  onTrackingNoteChange: (value: string) => void
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
          <h3 className="text-xl font-extrabold text-suzuki-ink">Mark as Delivered</h3>
          <HelpCircle size={16} className="text-suzuki-mute" />
        </div>

        <p className="text-sm text-suzuki-mute mb-4">
          Add a tracking note and delivery attachment. Payment is handled outside this platform.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Retailor Name" value={name || '—'} />
          <Field label="City" value={city} />
          <Field label="District" value={district} />
          <Field label="Address" value={address} className="sm:col-span-2" />
          <Field label="Contact Number" value={mobile} className="sm:col-span-2" />
        </div>

        <div className="mt-4">
          <Label>Tracking Note</Label>
          <textarea
            value={trackingNote}
            onChange={(e) => onTrackingNoteChange(e.target.value)}
            rows={3}
            placeholder="Courier name, vehicle no., ETA, or other delivery instructions…"
            className="mt-1.5 w-full rounded-xl border border-suzuki-line px-3 py-2.5 text-sm text-suzuki-navy outline-none focus:ring-2 focus:ring-suzuki-blue/30"
          />
        </div>

        <div className="mt-4">
          <Label>Delivery Attachment</Label>
          <label className="mt-1.5 flex flex-col items-center justify-center gap-2 min-h-[140px] rounded-xl border border-dashed border-sky-200 bg-sky-50 cursor-pointer hover:bg-sky-100 overflow-hidden">
            {podPreview ? (
              <img src={podPreview} alt="Delivery attachment preview" className="max-h-40 object-contain" />
            ) : (
              <>
                <ImageIcon size={28} className="text-suzuki-mute" />
                <span className="text-sm font-semibold text-suzuki-mute px-4 text-center">
                  Upload photo or document (image, PDF)
                </span>
              </>
            )}
            <input
              type="file"
              accept="image/*,.pdf,.doc,.docx"
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
          CONFIRM DELIVERY
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

function StatusPill({
  status,
  label,
  statusColor
}: {
  status: UiOrderStatus | string
  label?: string
  statusColor?: string | null
}) {
  const text = label || status
  const fromSap =
    statusColor === 'Green'
      ? 'bg-emerald-100 text-emerald-700'
      : statusColor === 'Grey'
        ? 'bg-slate-200 text-slate-600'
        : statusColor === 'Yellow'
          ? 'bg-orange-100 text-orange-700'
          : statusColor === 'Red'
            ? 'bg-rose-100 text-rose-700'
            : null
  const cls =
    fromSap
    ?? (status === 'Completed'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'Cancelled'
        ? 'bg-slate-200 text-slate-600'
        : status === 'Delivery In Process'
          ? 'bg-orange-100 text-orange-700'
          : status === 'Pending'
            ? 'bg-amber-100 text-amber-800'
            : 'bg-rose-100 text-rose-700')

  return (
    <span className={clsx('inline-flex rounded-full px-4 py-1.5 text-sm font-bold max-w-full text-left', cls)}>
      {text}
    </span>
  )
}
