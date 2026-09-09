export type SchemeType = 'Slab' | 'PercentOfSales' | 'TrackingOnly'

export interface ProductGroupListRow {
  id: string
  name: string
  description?: string | null
  isActive: boolean
  memberCount: number
}

export interface ProductGroupDetail {
  id: string
  name: string
  description?: string | null
  isActive: boolean
  members: { productId: string; partItemNo: string; productName: string }[]
}

export interface SchemeListRow {
  id: string
  name: string
  schemeType: SchemeType | string
  productGroupName: string
  currentPeriodStartUtc: string
  currentPeriodEndUtc: string
  isActive: boolean
  participantCount?: number
}

export interface SchemeSlab {
  id: string
  targetLiters: number
  ratePerLiter: number
  fixedBonusPkr: number
  sortOrder: number
  computedIncentivePkr: number
  computedCartons?: number | null
}

export interface SchemeDistributor {
  distributorId: string
  distributorName: string
  distributorCode: string
}

export interface SchemeDetail {
  id: string
  name: string
  description?: string | null
  productGroupId: string
  productGroupName: string
  schemeType: SchemeType | string
  currentPeriodStartUtc: string
  currentPeriodEndUtc: string
  percentOfSalesRate?: number | null
  isActive: boolean
  groupLitersPerCarton: number
  slabs: SchemeSlab[]
  distributors: SchemeDistributor[]
}

export interface SchemeEvalDistributor {
  distributorId: string
  distributorName: string
  distributorCode: string
  regionName?: string | null
  currentLiters: number
  avgPerClosedMonth?: number | null
  closedMonths: number
  qualifyingSlabId?: string | null
  qualifyingTargetLiters?: number | null
  qualifyingIncentivePkr?: number | null
  percentOfSalesIncentivePkr?: number | null
  monthlyCurrent: { year: number; month: number; liters: number }[]
  slabs: SchemeSlab[]
}

export interface SchemeEvaluation {
  schemeId: string
  schemeName: string
  schemeType: string
  productGroupName: string
  currentPeriodStartUtc: string
  currentPeriodEndUtc: string
  distributors: SchemeEvalDistributor[]
}

export function money(n?: number | null) {
  if (n == null) return '—'
  return `Rs ${n.toLocaleString('en-PK', { maximumFractionDigits: 2 })}`
}

export function dateInput(iso?: string | null) {
  if (!iso) return ''
  return iso.slice(0, 10)
}
