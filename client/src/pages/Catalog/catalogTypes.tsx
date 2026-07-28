export interface CatalogProductCard {
  id: string
  sku: string
  name: string
  description?: string | null
  category: string
  categoryName?: string | null
  primaryImageUrl?: string | null
  displayPrice: number
  inStock: boolean
  packLabel?: string | null
}

export interface CatalogVariant {
  id: string
  typeName: string
  unitQuantity: number
  retailPrice: number
  distributorPrice: number
  inStock: boolean
  isPublished: boolean
}

export interface CatalogProductDetail {
  id: string
  sku: string
  name: string
  description?: string | null
  bio?: string | null
  category: string
  categoryName?: string | null
  primaryImageUrl?: string | null
  inStock: boolean
  variants: CatalogVariant[]
  sectionImageUrls: string[]
}

export interface CatalogBanner {
  id: string
  type: string
  productCode: string
  bannerName?: string | null
  categoryName: string
  imageUrl: string
  productId?: string | null
  productName?: string | null
  sortOrder: number
}

export function formatPrice(n: number) {
  return `Rs:${Number(n || 0).toLocaleString('en-PK')}`
}

/** Split product name so grade (F9000 / R5000…) renders in red like the designs. */
export function ProductTitle({ name, className = '' }: { name: string; className?: string }) {
  const match = name.match(/^(.*?)(\s+)([FRV]\d[\w-]*)(.*)$/i)
  if (!match) {
    return <span className={className}>{name}</span>
  }
  return (
    <span className={className}>
      {match[1]}
      {match[2]}
      <span className="text-suzuki-red">{match[3]}</span>
      {match[4]}
    </span>
  )
}
