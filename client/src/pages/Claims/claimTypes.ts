export type ClaimStatus = 'InProcess' | 'Completed' | 'Cancelled'

export interface ClaimListRow {
  id: string
  createdAtUtc: string
  orderNumber?: string | null
  distributorName: string
  status: string
}

export interface ClaimImage {
  id: string
  storageUrl: string
  fileName: string
}

export interface ClaimDetail {
  id: string
  status: string
  createdAtUtc: string
  orderId?: string | null
  orderNumber?: string | null
  distributorId: string
  distributorName: string
  distributorMobile: string
  distributorAddress: string
  regionName?: string | null
  retailerId?: string | null
  retailerName?: string | null
  reason: string
  staffRemarks?: string | null
  images: ClaimImage[]
}

export interface ClaimStats {
  total: number
  inProcess: number
  completed: number
  cancelled: number
}

export interface Paged<T> {
  items: T[]
  pageNumber: number
  totalPages: number
  totalCount: number
}

export function formatClaimDate(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}

export function claimStatusLabel(status: string) {
  if (status === 'InProcess') return 'In Process'
  if (status === 'Completed') return 'Completed'
  if (status === 'Cancelled') return 'Canceled'
  return status
}

export function locationLine(region?: string | null, address?: string | null) {
  const city = address?.split(',')[0]?.trim()
  const parts = [region, city].filter(Boolean)
  return parts.join(', ') || '—'
}
