export interface OrderLineItem {
  id: string
  productId: string
  productName: string
  productSku: string
  productBio?: string | null
  primaryImageUrl?: string | null
  categoryName?: string | null
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
  subTotal: number
  totalGst: number
  totalFed: number
  whtAmount: number
  grandTotal: number
  gstPercent: number
  sapDocumentNumber?: string | null
  sapDeliveryNumber?: string | null
  sapGrnNumber?: string | null
  sapInvoiceNumber?: string | null
  isPartialDelivery: boolean
  thresholdReached: boolean
  distributorActionedAtUtc?: string | null
  pakSuzukiActionedAtUtc?: string | null
  invoiceConfirmedAtUtc?: string | null
  createdAtUtc: string
  items: OrderLineItem[]
  proofsOfDelivery: OrderProof[]
}

/** UI-facing status groups that match the design pills. */
export type UiOrderStatus =
  | 'Pending'
  | 'In Process'
  | 'Delivery In Process'
  | 'Completed'
  | 'Cancelled'

export const PENDING_STATUSES = ['PendingDistributorApproval', 'PendingPakSuzukiApproval', 'SentBackForModification']
export const DELIVERY_STATUSES = ['PartiallyDelivered', 'SubmittedToSap']
export const COMPLETED_STATUSES = ['Delivered', 'InvoiceConfirmed']
export const CANCELED_STATUSES = ['Cancelled', 'RejectedByDistributor']
export const IN_PROCESS_STATUSES = [
  'ApprovedByDistributor',
  'PartiallyApprovedByDistributor',
  'ForwardedToPakSuzuki',
  'ApprovedByPakSuzuki'
]

export function toUiStatus(status: string): UiOrderStatus {
  if (COMPLETED_STATUSES.includes(status)) return 'Completed'
  if (CANCELED_STATUSES.includes(status)) return 'Cancelled'
  if (DELIVERY_STATUSES.includes(status)) return 'Delivery In Process'
  if (PENDING_STATUSES.includes(status)) return 'Pending'
  return 'In Process'
}

export function paymentLabel(status: string): 'In Approval' | 'Received' | '—' {
  if (CANCELED_STATUSES.includes(status)) return '—'
  if (PENDING_STATUSES.includes(status)) return 'In Approval'
  return 'Received'
}

/** Maps design status buttons → backend OrderStatus enum names. */
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
