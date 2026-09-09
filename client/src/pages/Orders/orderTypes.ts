export interface OrderLineItem {
  id: string
  productId: string
  productName: string
  productSku: string
  productBio?: string | null
  primaryImageUrl?: string | null
  categoryName?: string | null
  productVariantId?: string | null
  variantTypeName?: string | null
  requestedQuantity: number
  requestedUnit: string
  approvedQuantity?: number | null
  unitPrice: number
  lineSubTotal: number
  lineGst: number
  lineFed: number
}

export interface OrderProof {
  id: string
  storageUrl: string
  fileName: string
  uploadedByRole: string
  createdAtUtc: string
}

export interface OrderDetail {
  id: string
  orderNumber: string
  source: string
  status: string
  statusLabel?: string | null
  /** Raw workflow status (always enum name). Prefer this for logic. */
  statusCode?: string | null
  retailerId?: string | null
  retailerName?: string | null
  retailerMobile?: string | null
  retailerAddress?: string | null
  distributorId: string
  distributorName: string
  distributorMobile: string
  distributorAddress: string
  regionName?: string | null
  distributorRemarks?: string | null
  pakSuzukiRemarks?: string | null
  retailerRemarks?: string | null
  subTotal: number
  totalGst: number
  totalFed: number
  whtAmount: number
  grandTotal: number
  gstPercent: number
  whtPercent: number
  sapDocumentNumber?: string | null
  sapDeliveryNumber?: string | null
  sapGrnNumber?: string | null
  sapInvoiceNumber?: string | null
  isPartialDelivery: boolean
  thresholdReached: boolean
  allowsPartialDelivery: boolean
  originatingRetailerOrderId?: string | null
  distributorActionedAtUtc?: string | null
  pakSuzukiActionedAtUtc?: string | null
  invoiceConfirmedAtUtc?: string | null
  createdAtUtc: string
  items: OrderLineItem[]
  proofsOfDelivery: OrderProof[]
  statusColor?: 'Red' | 'Yellow' | 'Green' | 'Grey' | string | null
  middlewareStatus?: string | null
  sapTransferStatus?: number | null
  sapMessage?: string | null
  poRef?: string | null
  dealerCode?: string | null
  retryCount?: number
  vendorCode?: string | null
  materialSourceCode?: string | null
  deliveryTypeCode?: string | null
  deliveryTypeName?: string | null
  supplierCode?: string | null
  thresholdMet?: boolean
  fulfillmentChoice?: string | null
  pakSuzukiShipTo?: string | null
  snapshotDistributorCode?: string | null
  snapshotRetailerCode?: string | null
  shipToCode?: string | null
  billToCode?: string | null
}

/** UI-facing status groups that match the design pills. */
export type UiOrderStatus =
  | 'Pending'
  | 'In Process'
  | 'Delivery In Process'
  | 'Completed'
  | 'Cancelled'

export const PENDING_STATUSES = ['PendingDistributorApproval', 'PendingPakSuzukiApproval', 'SentBackForModification']
export const DELIVERY_STATUSES = ['PartiallyDelivered', 'Delivered']
export const COMPLETED_STATUSES = ['Delivered', 'InvoiceConfirmed']
export const CANCELED_STATUSES = ['Cancelled', 'RejectedByDistributor']
export const IN_PROCESS_STATUSES = [
  'ApprovedByDistributor',
  'PartiallyApprovedByDistributor',
  'ForwardedToPakSuzuki',
  'ApprovedByPakSuzuki',
  'SubmittedToSap'
]

export function toUiStatus(status: string, statusCode?: string | null): UiOrderStatus {
  const code = statusCode || status
  if (COMPLETED_STATUSES.includes(code)) return 'Completed'
  if (CANCELED_STATUSES.includes(code)) return 'Cancelled'
  if (DELIVERY_STATUSES.includes(code)) return 'Delivery In Process'
  if (PENDING_STATUSES.includes(code)) return 'Pending'
  return 'In Process'
}

export function uiStatusToApi(ui: UiOrderStatus): string {
  switch (ui) {
    case 'Delivery In Process':
      return 'PartiallyDelivered'
    case 'Completed':
      return 'Delivered'
    case 'Cancelled':
      return 'Cancelled'
    case 'In Process':
      return 'ApprovedByPakSuzuki'
    case 'Pending':
      return 'PendingPakSuzukiApproval'
  }
}

export function formatRs(n: number) {
  return `Rs.${Number(n || 0).toLocaleString('en-PK')}`
}

export function formatOrderDate(iso: string) {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}

export function locationLine(region?: string | null, address?: string | null) {
  const parts = [region, address?.split(',')[0]?.trim()].filter(Boolean)
  return parts.join(', ') || '—'
}

/** Qty to show after distributor action: approved when set, otherwise requested. */
export function displayOrderQty(item: {
  requestedQuantity: number
  approvedQuantity?: number | null
}) {
  return item.approvedQuantity != null ? item.approvedQuantity : item.requestedQuantity
}

/** Line amount aligned with display qty (handles older partial rows before line snapshots were updated). */
export function displayLineAmount(item: {
  requestedQuantity: number
  approvedQuantity?: number | null
  unitPrice: number
  lineSubTotal: number
}) {
  if (item.approvedQuantity == null) return item.lineSubTotal
  return Math.round(item.unitPrice * item.approvedQuantity * 100) / 100
}

/** Design tracking steps under Order Summary for in-progress distributor / manufacture views. */
export type TrackingStep = 'processed' | 'readyToShip' | 'delivered'

export function getOrderTracking(status: string, statusCode?: string | null): {
  processed: boolean
  readyToShip: boolean
  delivered: boolean
  current: TrackingStep
} {
  const code = statusCode || status
  const delivered =
    code === 'Delivered' || code === 'InvoiceConfirmed' || code === 'PartiallyDelivered'
  const readyToShip =
    delivered || code === 'SubmittedToSap' || code === 'PartiallyDelivered' || code === 'Delivered'
  const processed =
    delivered ||
    readyToShip ||
    ![
      ...CANCELED_STATUSES,
      'PendingDistributorApproval',
      'SentBackForModification'
    ].includes(code)

  const current: TrackingStep = delivered
    ? 'delivered'
    : readyToShip
      ? 'readyToShip'
      : 'processed'

  return { processed, readyToShip, delivered, current }
}
