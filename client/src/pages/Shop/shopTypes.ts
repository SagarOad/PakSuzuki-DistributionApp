import { api } from '@/api/axiosClient'

export const SHOP_CATEGORIES = ['Motor Car', 'Motor Bike', 'Motor Oil'] as const

export type ShopCategory = (typeof SHOP_CATEGORIES)[number]

export interface ShopBannerRow {
  id: string
  type: string
  productCode: string
  bannerName?: string | null
  categoryName: string
  imageUrl: string
  productId?: string | null
  productName?: string | null
  isActive: boolean
  sortOrder: number
}

export interface ShopProductRow {
  id: string
  sku: string
  name: string
  category: string
  categoryName?: string | null
  units?: number | null
  isPublished: boolean
  primaryImageUrl?: string | null
}

export interface ProductVariantForm {
  id?: string
  typeName: string
  unitQuantity: number | ''
  retailPrice: number | ''
  distributorPrice: number | ''
  costPrice: number | ''
  gstPercent: number | ''
  fedPercent: number | ''
  whtPercent: number | ''
  profitAmount: number | ''
  inStock: boolean
  isPublished: boolean
}

export function emptyVariant(typeName = ''): ProductVariantForm {
  return {
    typeName,
    unitQuantity: '',
    retailPrice: '',
    distributorPrice: '',
    costPrice: '',
    gstPercent: 18,
    fedPercent: '',
    whtPercent: '',
    profitAmount: '',
    inStock: true,
    isPublished: true
  }
}

export function num(v: number | '' | undefined): number {
  if (v === '' || v == null || Number.isNaN(Number(v))) return 0
  return Number(v)
}

export function categoryLabel(category?: string | null, categoryName?: string | null) {
  if (categoryName) return categoryName
  if (!category) return '—'
  return category.replace(/([a-z])([A-Z])/g, '$1 $2')
}

export async function uploadShopMedia(file: File, folder = 'shop-media'): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post<{ url: string }>('/shop/media', form, {
    params: { folder },
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return data.url
}
