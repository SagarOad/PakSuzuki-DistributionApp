import { api } from '@/api/axiosClient'

/** Fallback when master-catalog lookups are unavailable */
export const DEFAULT_BANNER_CATEGORIES = ['Engine Oil', 'Gear Oil', 'Chemical', 'Parts'] as const

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
    whtPercent: 0,
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

export function categorySlug(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, '-')
}

/** Target width÷height for banner types (±8% tolerance on server). */
export const BANNER_ASPECT = {
  Header: { ratio: 16 / 5, label: '16:5 (wide header)' },
  Category: { ratio: 16 / 10, label: '16:10 (category card)' },
  NewsletterPopUp: { ratio: 335 / 156, label: '335×156' },
  PromotionBanner: { ratio: 1, label: '1:1 square' }
} as const

export type BannerAspectKind = keyof typeof BANNER_ASPECT

export function validateBannerAspect(file: File, kind: BannerAspectKind): Promise<void> {
  const spec = BANNER_ASPECT[kind]
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const actual = img.width / img.height
      const delta = Math.abs(actual - spec.ratio) / spec.ratio
      if (delta > 0.08) {
        reject(new Error(
          `Image is ${img.width}×${img.height}. Required aspect is ${spec.label} (±8%).`
        ))
        return
      }
      resolve()
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read image. Use JPG or PNG.'))
    }
    img.src = url
  })
}

export async function uploadShopMedia(
  file: File,
  folder = 'shop-media',
  aspectKind?: BannerAspectKind
): Promise<string> {
  if (aspectKind) await validateBannerAspect(file, aspectKind)
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post<{ url: string }>('/shop/media', form, {
    params: { folder, aspectKind },
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return data.url
}
