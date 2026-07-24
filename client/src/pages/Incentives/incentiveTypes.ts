export const INCENTIVE_CRITERIA = ['Liters', 'Cartons', 'Amount'] as const
export type IncentiveCriteria = (typeof INCENTIVE_CRITERIA)[number]

export interface IncentiveSlab {
  minPercent: number
  maxPercent: number
  incentivePercent: number
}

export interface IncentiveListRow {
  id: string
  name: string
  description?: string | null
  criteriaType: string
  startDateUtc: string
  endDateUtc: string
  isActive: boolean
  createdAtUtc: string
}

export interface IncentiveParticipantRow {
  id: string
  kind: 'Distributor' | 'Retailer' | string
  distributorId?: string | null
  retailerId?: string | null
  name: string
  regionName: string
  targetValue: number
  achievedValue: number
  achievementPercent: number
  remaining: number
  incentivePercent: number
  incentiveAmount: number
  approvalStatus: string
}

export interface IncentiveDetail {
  id: string
  name: string
  description?: string | null
  criteriaType: string
  totalTarget: number
  totalAchieved: number
  achievementRate: number
  distributorCount: number
  retailerCount: number
  startDateUtc: string
  endDateUtc: string
  isActive: boolean
  slabs: IncentiveSlab[]
  participants: IncentiveParticipantRow[]
}

export interface Paged<T> {
  items: T[]
  pageNumber: number
  totalPages: number
  totalCount: number
}

export function formatPkr(n: number) {
  return `PKR ${Number(n || 0).toLocaleString('en-PK')}`
}

export function formatDate(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB')
}

export function parseSlabRange(text: string): { min: number; max: number } | null {
  const cleaned = text.replace(/%/g, ' ').replace(/[–—]/g, '-').trim()
  if (!cleaned) return null

  // Prefer explicit "80 - 90" / "80 to 90" patterns
  const ranged = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)/i)
  if (ranged) {
    const min = Number(ranged[1])
    const max = Number(ranged[2])
    if (!Number.isNaN(min) && !Number.isNaN(max) && max > min) return { min, max }
  }

  // Fallback: first two numbers found anywhere in the text
  const nums = cleaned.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? []
  if (nums.length >= 2 && nums[1] > nums[0]) return { min: nums[0], max: nums[1] }

  return null
}

export function parseIncentivePercent(text: string): number | null {
  const n = Number(String(text).replace(/%/g, '').trim())
  if (Number.isNaN(n) || n < 0) return null
  return n
}

export function slabLabel(s: IncentiveSlab) {
  return `${s.minPercent}% - ${s.maxPercent}%`
}
