import { api } from '@/api/axiosClient'

export interface CatalogType {
  id: string
  code: string
  name: string
  isReady: boolean
  notReadyMessage?: string | null
}

export interface CatalogPType {
  id: string
  code: string
  deliveryType: string
  sgoFlag: boolean
  sourceScope: string[]
  categoryId?: string | null
}

export interface CategoryFormProfile {
  kind?: string
  ready?: boolean
  showViscosity?: boolean
  showApiStandard?: boolean
  showModelCode?: boolean
  viscosityRequired?: boolean
  apiStandardRequired?: boolean
  unitTypes?: string[]
  orderUnit?: string
  placeholderMessage?: string
  flags?: { lubeFlag?: boolean; gearOilFlag?: boolean; chemicalsFlag?: boolean }
}

export interface CatalogCategory {
  id: string
  productTypeId: string
  code: string
  name: string
  orderUnit: string
  defaultFedApplicable: boolean
  gstInvoiceTypeCode?: string | null
  isReady: boolean
  notReadyMessage?: string | null
  formProfile: CategoryFormProfile
  pTypes: CatalogPType[]
}

export interface CatalogLookups {
  productTypes: CatalogType[]
  categories: CatalogCategory[]
  sources: { code: string; name: string; isReady?: boolean; notReadyMessage?: string | null }[]
  suppliers: { code: string; name: string }[]
  gstInvoiceTypes: { code: string; name: string }[]
  taxRules: { id: string; code: string; rate: number; appliesTo: string; isActive: boolean }[]
  deliveryThresholds: {
    id: string
    categoryId: string
    categoryName: string
    distributorId?: string | null
    unit: string
    quantityThreshold: number
    approverRoles: string[]
    isActive: boolean
  }[]
  priceVisibility: { canSeeCost: boolean; canSeePurchase: boolean; canSeeSale: boolean }
}

export interface WizardDefaults {
  sgoFlag: boolean
  supplierCode?: string | null
  fedApplicable: boolean
  gstRate: number
  fedRate: number
  gstInvoiceTypeCode?: string | null
}

export interface MasterProductRow {
  id: string
  partItemNo: string
  description: string
  productType: string
  category: string
  pType?: string | null
  source?: string | null
  supplier?: string | null
  packQuantity: number
  unitValue: number
  unitType: string
  packLabel: string
  costPrice?: number | null
  purchasePrice?: number | null
  salePrice?: number | null
  salePriceExclTaxes?: number | null
  pricePerUnit?: number | null
  discontinued: boolean
  fedApplicable: boolean
}

export interface MasterProductDetail {
  id: string
  partItemNo: string
  description: string
  productTypeId: string
  categoryId: string
  pTypeId: string
  viscosity?: string | null
  apiStandard?: string | null
  modelCode?: string | null
  sourceCode: string
  sgoFlag: boolean
  supplierCode: string
  unitValue: number
  unitType: string
  packQuantity: number
  costPrice?: number | null
  purchasePrice?: number | null
  salePrice?: number | null
  salePriceExclTaxes?: number | null
  pricePerUnit?: number | null
  fedApplicable: boolean
  discontinued: boolean
  applyDate?: string | null
  rpdcFlag: boolean
  accessory?: string | null
  primaryImageUrl?: string | null
  sectionImageUrls?: string[] | null
}

export async function uploadProductMedia(file: File, folder = 'product-media'): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post<{ url: string }>('/shop/media', form, {
    params: { folder },
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return data.url
}

export function money(value?: number | null) {
  if (value == null) return '—'
  return `Rs ${value.toLocaleString('en-PK', { maximumFractionDigits: 2 })}`
}
