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
  packQuantity?: number | null
  unitValue?: number | null
  unitType?: string | null
  unitLabel?: string | null
}

export interface CatalogVariant {
  id: string
  typeName: string
  unitQuantity: number
  retailPrice?: number | null
  distributorPrice?: number | null
  inStock: boolean
  isPublished: boolean
  unitValue?: number | null
  unitType?: string | null
  unitLabel?: string | null
  packQuantity?: number | null
  gstPercent?: number | null
  fedPercent?: number | null
}

export interface CatalogDistributor {
  id: string
  name: string
  businessName: string
  mobileNumber: string
  email?: string | null
  businessAddress: string
  regionName?: string | null
  profileImageUrl?: string | null
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
  distributor?: CatalogDistributor | null
  packQuantity?: number | null
  unitValue?: number | null
  unitType?: string | null
  unitLabel?: string | null
  viscosity?: string | null
  apiStandard?: string | null
  modelCode?: string | null
  sourceCode?: string | null
  supplierCode?: string | null
  deliveryTypeCode?: string | null
  deliveryTypeName?: string | null
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
  return `Rs ${Number(n || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`
}

export function packSummary(input: {
  packLabel?: string | null
  packQuantity?: number | null
  unitLabel?: string | null
  unitValue?: number | null
  unitType?: string | null
}) {
  const unit =
    input.unitLabel ||
    (input.unitValue != null
      ? `${Number(input.unitValue)}${input.unitType ? ` ${input.unitType}` : ''}`
      : null)
  if (input.packLabel) return input.packLabel
  if (input.packQuantity && unit) return `${input.packQuantity} × ${unit}`
  if (input.packQuantity) return `${input.packQuantity} pcs / pack`
  return unit
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
