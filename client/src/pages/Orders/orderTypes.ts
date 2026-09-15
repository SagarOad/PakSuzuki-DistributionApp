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
  /** Staff-only margin inputs (per pack). */
  costPrice?: number | null
  purchasePrice?: number | null
  salePrice?: number | null
  /** Bottles/units per pack (carton). */
  packQuantity?: number | null
  /** Size of one bottle/unit (e.g. liters). */
  unitValue?: number | null
  unitType?: string | null
  /** Server-computed line volume in liters. */
  lineLiters?: number | null
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
  /** Total lubricant volume in liters for the order (0 if none). */
  totalLiters?: number | null
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

/** Who receives the goods — driven by Pak Suzuki ship-to on threshold orders. */
export type ShipToDeliveryParty = {
  partyKind: 'Retailer' | 'Distributor'
  /** UI label for the party name field */
  nameLabel: string
  name: string
  mobile: string
  address: string
  regionName?: string | null
}

/**
 * Threshold + ship-to Distributor → distributor address/contact.
 * Threshold + ship-to Retailer → retailer address/contact.
 * Otherwise prefer retailer (normal retailer order), else distributor.
 */
export function resolveShipToDelivery(order: Pick<
  OrderDetail,
  | 'thresholdMet'
  | 'thresholdReached'
  | 'pakSuzukiShipTo'
  | 'retailerName'
  | 'retailerMobile'
  | 'retailerAddress'
  | 'distributorName'
  | 'distributorMobile'
  | 'distributorAddress'
  | 'regionName'
>): ShipToDeliveryParty {
  const threshold = !!(order.thresholdMet ?? order.thresholdReached)
  const shipTo = (order.pakSuzukiShipTo || '').trim()

  const asDistributor = (): ShipToDeliveryParty => ({
    partyKind: 'Distributor',
    nameLabel: 'Distributor',
    name: order.distributorName || '—',
    mobile: order.distributorMobile || '—',
    address: order.distributorAddress || '—',
    regionName: order.regionName
  })

  const asRetailer = (): ShipToDeliveryParty => ({
    partyKind: 'Retailer',
    nameLabel: 'Retailer',
    name: order.retailerName || '—',
    mobile: order.retailerMobile || '—',
    address: order.retailerAddress || '—',
    regionName: order.regionName
  })

  if (threshold && shipTo === 'Distributor') return asDistributor()
  if (threshold && shipTo === 'Retailer') return asRetailer()
  if (order.retailerName || order.retailerAddress || order.retailerMobile) return asRetailer()
  return asDistributor()
}

/** Qty to show after distributor action: approved when set, otherwise requested. */
export function displayOrderQty(item: {
  requestedQuantity: number
  approvedQuantity?: number | null
}) {
  return item.approvedQuantity != null ? item.approvedQuantity : item.requestedQuantity
}

/** Liters for one line (packs × bottles/pack × liters per bottle). ml is converted. */
export function lineLiters(item: {
  requestedQuantity: number
  approvedQuantity?: number | null
  packQuantity?: number | null
  unitValue?: number | null
  unitType?: string | null
  lineLiters?: number | null
}) {
  if (typeof item.lineLiters === 'number' && item.lineLiters > 0) {
    return item.lineLiters
  }
  const unit = (item.unitType || 'L').trim().toLowerCase()
  const packs = displayOrderQty(item)
  const bottles = item.packQuantity && item.packQuantity > 0 ? item.packQuantity : 1
  const size = item.unitValue && item.unitValue > 0 ? item.unitValue : 0
  if (size <= 0) return null

  let litersPerBottle = 0
  if (unit === 'ml' || unit === 'milliliter' || unit === 'millilitre') litersPerBottle = size / 1000
  else if (
    unit === '' ||
    unit === 'l' ||
    unit === 'ltr' ||
    unit === 'lt' ||
    unit === 'liter' ||
    unit === 'liters' ||
    unit === 'litre' ||
    unit === 'litres'
  ) {
    litersPerBottle = size
  } else {
    return null
  }
  if (litersPerBottle <= 0) return null
  return Math.round(packs * bottles * litersPerBottle * 100) / 100
}

export function orderTotalLiters(
  items: {
    requestedQuantity: number
    approvedQuantity?: number | null
    packQuantity?: number | null
    unitValue?: number | null
    unitType?: string | null
    lineLiters?: number | null
  }[],
  apiTotal?: number | null
) {
  if (typeof apiTotal === 'number' && apiTotal > 0) return apiTotal
  let total = 0
  let any = false
  for (const item of items) {
    const L = lineLiters(item)
    if (L == null) continue
    any = true
    total += L
  }
  return any ? Math.round(total * 100) / 100 : null
}

export function cartLineLiters(item: {
  quantity: number
  packQuantity?: number | null
  unitValue?: number | null
  unitType?: string | null
}) {
  return lineLiters({
    requestedQuantity: item.quantity,
    packQuantity: item.packQuantity,
    unitValue: item.unitValue,
    unitType: item.unitType
  })
}

export function cartTotalLiters(
  items: {
    quantity: number
    packQuantity?: number | null
    unitValue?: number | null
    unitType?: string | null
  }[]
) {
  return orderTotalLiters(
    items.map((item) => ({
      requestedQuantity: item.quantity,
      packQuantity: item.packQuantity,
      unitValue: item.unitValue,
      unitType: item.unitType
    }))
  )
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

/** Design tracking steps: Pending → In Process → Delivered (API codes unchanged). */
export type TrackingStep = 'pending' | 'inProcess' | 'delivered'

export function getOrderTracking(status: string, statusCode?: string | null): {
  pending: boolean
  inProcess: boolean
  delivered: boolean
  current: TrackingStep
} {
  const code = statusCode || status
  const delivered =
    code === 'Delivered' || code === 'InvoiceConfirmed'
  const inProcess =
    delivered || code === 'PartiallyDelivered'
  const pending =
    delivered ||
    inProcess ||
    ![
      ...CANCELED_STATUSES,
      'PendingDistributorApproval',
      'SentBackForModification',
      'RejectedByDistributor'
    ].includes(code)

  const current: TrackingStep = delivered
    ? 'delivered'
    : inProcess
      ? 'inProcess'
      : 'pending'

  return { pending, inProcess, delivered, current }
}
