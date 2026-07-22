import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { Camera, Plus, Trash2, Truck } from 'lucide-react'
import { api } from '@/api/axiosClient'
import {
  SHOP_CATEGORIES,
  emptyVariant,
  num,
  uploadShopMedia,
  type ProductVariantForm
} from './shopTypes'
import clsx from 'clsx'

interface ShopProductDetail {
  id: string
  sku: string
  name: string
  description?: string | null
  bio?: string | null
  category: string
  categoryName?: string | null
  primaryImageUrl?: string | null
  isPublished: boolean
  inStock: boolean
  suzukiProfitPercent: number
  distributorProfitPercent: number
  variants: {
    id: string
    typeName: string
    unitQuantity: number
    retailPrice: number
    distributorPrice: number
    costPrice: number
    gstPercent: number
    fedPercent: number
    whtPercent: number
    profitAmount: number
    inStock: boolean
    isPublished: boolean
  }[]
  sectionImageUrls: string[]
}

const PRODUCT_TYPES = ['2.2 Liters', '1 Liters', '0.8 Liters', '2.7 Liters', '3 Liters', '4 Liters']

export default function ProductDetailsPage() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const primaryRef = useRef<HTMLInputElement>(null)
  const sectionRef = useRef<HTMLInputElement>(null)

  const [sku, setSku] = useState('')
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [description, setDescription] = useState('')
  const [categoryName, setCategoryName] = useState<string>(SHOP_CATEGORIES[2])
  const [primaryImageUrl, setPrimaryImageUrl] = useState('')
  const [primaryPreview, setPrimaryPreview] = useState<string | null>(null)
  const [pendingPrimary, setPendingPrimary] = useState<File | null>(null)
  const [sectionUrls, setSectionUrls] = useState<string[]>([])
  const [pendingSections, setPendingSections] = useState<File[]>([])
  const [variants, setVariants] = useState<ProductVariantForm[]>([emptyVariant('2.2 Liters')])
  const [modalOpen, setModalOpen] = useState(false)
  const [modalDraft, setModalDraft] = useState<ProductVariantForm>(emptyVariant('3 Liters'))
  const [error, setError] = useState<string | null>(null)

  const detailQuery = useQuery({
    queryKey: ['shop-product', id],
    enabled: !isNew,
    queryFn: async () => (await api.get<ShopProductDetail>(`/shop/products/${id}`)).data
  })

  useEffect(() => {
    const d = detailQuery.data
    if (!d) return
    setSku(d.sku)
    setName(d.name)
    setBio(d.bio ?? '')
    setDescription(d.description ?? '')
    setCategoryName(d.categoryName || SHOP_CATEGORIES[2])
    setPrimaryImageUrl(d.primaryImageUrl ?? '')
    setSectionUrls(d.sectionImageUrls ?? [])
    setVariants(
      d.variants.length
        ? d.variants.map((v) => ({
            id: v.id,
            typeName: v.typeName,
            unitQuantity: v.unitQuantity,
            retailPrice: v.retailPrice,
            distributorPrice: v.distributorPrice,
            costPrice: v.costPrice,
            gstPercent: v.gstPercent,
            fedPercent: v.fedPercent,
            whtPercent: v.whtPercent,
            profitAmount: v.profitAmount,
            inStock: v.inStock,
            isPublished: v.isPublished
          }))
        : [emptyVariant('2.2 Liters')]
    )
  }, [detailQuery.data])

  const margins = useMemo(() => {
    const v = variants[0]
    if (!v || !num(v.retailPrice)) return { suzuki: 0, distributor: 0 }
    const retail = num(v.retailPrice)
    const suzuki = Math.max(0, Math.round(((retail - num(v.distributorPrice)) / retail) * 1000) / 10)
    const distributor = Math.max(0, Math.round(((num(v.distributorPrice) - num(v.costPrice)) / retail) * 1000) / 10)
    return { suzuki, distributor }
  }, [variants])

  const save = useMutation({
    mutationFn: async () => {
      let image = primaryImageUrl
      if (pendingPrimary) image = await uploadShopMedia(pendingPrimary, 'product-images')

      const uploadedSections = [...sectionUrls]
      for (const file of pendingSections) {
        uploadedSections.push(await uploadShopMedia(file, 'product-section-banners'))
      }

      const body = {
        sku,
        name,
        description: description || null,
        bio: bio || null,
        categoryName,
        primaryImageUrl: image || null,
        isPublished: variants.some((v) => v.isPublished),
        inStock: variants.some((v) => v.inStock),
        variants: variants.map((v, i) => ({
          id: v.id || null,
          typeName: v.typeName,
          unitQuantity: num(v.unitQuantity),
          retailPrice: num(v.retailPrice),
          distributorPrice: num(v.distributorPrice),
          costPrice: num(v.costPrice),
          gstPercent: num(v.gstPercent),
          fedPercent: num(v.fedPercent),
          whtPercent: num(v.whtPercent),
          profitAmount: num(v.profitAmount),
          inStock: v.inStock,
          isPublished: v.isPublished,
          sortOrder: i
        })),
        sectionImageUrls: uploadedSections
      }

      if (isNew) {
        const { data } = await api.post<{ id: string }>('/shop/products', body)
        return data.id
      }
      await api.put(`/shop/products/${id}`, body)
      return id!
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['shop-products'] })
      navigate('/shop')
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { title?: string; detail?: string; errors?: Record<string, string[]> } } })
        ?.response?.data
      const first = msg?.errors ? Object.values(msg.errors).flat()[0] : null
      setError(first || msg?.detail || msg?.title || 'Save failed.')
    }
  })

  const updateVariant = (index: number, patch: Partial<ProductVariantForm>) => {
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)))
  }

  const removeVariant = (index: number) => {
    setVariants((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  const addVariantFromModal = () => {
    if (!modalDraft.typeName.trim()) return
    setVariants((prev) => [...prev, { ...modalDraft }])
    setModalOpen(false)
    setModalDraft(emptyVariant('3 Liters'))
  }

  const onSectionFiles = (files: FileList | null) => {
    if (!files?.length) return
    const list = Array.from(files)
    setPendingSections((prev) => [...prev, ...list])
    setSectionUrls((prev) => [...prev, ...list.map((f) => URL.createObjectURL(f))])
  }

  const primaryDisplay = primaryPreview || primaryImageUrl || null

  return (
    <div className="space-y-5 pb-8">
      <h1 className="text-2xl font-extrabold text-suzuki-navy">Product Details</h1>

      {error && (
        <div className="rounded-lg border border-suzuki-red/30 bg-red-50 px-3 py-2 text-sm text-suzuki-red">{error}</div>
      )}

      <div className="bg-white rounded-2xl border border-suzuki-line shadow-card p-6">
        <h2 className="text-lg font-bold text-suzuki-navy mb-5">Product Information</h2>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-8">
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Product Code">
                <input value={sku} onChange={(e) => setSku(e.target.value)} className="field" disabled={!isNew} />
              </Field>
              <Field label="Categories">
                <select value={categoryName} onChange={(e) => setCategoryName(e.target.value)} className="field">
                  {SHOP_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Product Name">
                <input value={name} onChange={(e) => setName(e.target.value)} className="field" />
              </Field>
              <Field label="Product Bio">
                <input value={bio} onChange={(e) => setBio(e.target.value)} className="field" />
              </Field>
            </div>

            {variants.map((variant, index) => (
              <VariantBlock
                key={variant.id || index}
                variant={variant}
                index={index}
                showAdd={index === 0}
                onAdd={() => {
                  setModalDraft(emptyVariant('3 Liters'))
                  setModalOpen(true)
                }}
                onChange={(patch) => updateVariant(index, patch)}
                onRemove={() => removeVariant(index)}
              />
            ))}
          </div>

          <div className="space-y-4">
            <div className="aspect-square rounded-xl border border-suzuki-line bg-suzuki-mist overflow-hidden flex items-center justify-center">
              {primaryDisplay ? (
                <img src={primaryDisplay} alt="Product" className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm text-suzuki-mute">Product image</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => primaryRef.current?.click()}
              className="inline-flex items-center gap-2 text-suzuki-red text-sm font-semibold"
            >
              <Camera size={16} />
              {primaryDisplay ? 'Change Product Image' : '+ Add Product Image'}
            </button>
            <input
              ref={primaryRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                setPendingPrimary(file)
                setPrimaryPreview(URL.createObjectURL(file))
              }}
            />

            <div className="rounded-xl border border-suzuki-line p-4 space-y-4 bg-suzuki-mist/40">
              <ProfitBar label="Pak Suzuki Profit" percent={margins.suzuki} icon="suzuki" />
              <ProfitBar label="Distributor Profit" percent={margins.distributor} icon="truck" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-suzuki-line shadow-card p-6 space-y-4">
        <h2 className="text-lg font-bold text-suzuki-navy">Section Description</h2>
        <Field label="Bio">
          <input value={bio} onChange={(e) => setBio(e.target.value)} className="field" placeholder="Ultimate Protection / Maximum Efficiency" />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="field min-h-[120px]"
            placeholder="Product performance and benefits…"
          />
        </Field>
      </div>

      <div className="bg-white rounded-2xl border border-suzuki-line shadow-card p-6">
        <h2 className="text-lg font-bold text-suzuki-navy mb-4">Section Banner</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {sectionUrls.map((url, i) => (
            <div key={`${url}-${i}`} className="aspect-video rounded-lg border border-suzuki-line overflow-hidden bg-suzuki-mist">
              <img src={url} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
          {!sectionUrls.length && (
            <div className="col-span-full aspect-[3/1] rounded-lg border border-dashed border-suzuki-line flex items-center justify-center text-sm text-suzuki-mute">
              No section banners yet
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => sectionRef.current?.click()}
          className="mt-3 inline-flex items-center gap-2 text-suzuki-red text-sm font-semibold"
        >
          <Camera size={16} />
          Change Product Image
        </button>
        <input
          ref={sectionRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => onSectionFiles(e.target.files)}
        />
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => navigate('/shop')} className="rounded-lg bg-suzuki-ice text-suzuki-navy px-6 py-2.5 text-sm font-bold">
          CANCEL
        </button>
        <button
          type="button"
          disabled={save.isPending || !sku.trim() || !name.trim()}
          onClick={() => { setError(null); save.mutate() }}
          className="rounded-lg bg-suzuki-red text-white px-6 py-2.5 text-sm font-bold disabled:opacity-50"
        >
          {save.isPending ? 'SAVING…' : 'SAVE'}
        </button>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-xl font-extrabold text-suzuki-navy mb-5">Add New Product Type</h3>
            <VariantFields
              variant={modalDraft}
              onChange={setModalDraft}
              showTypePlus
              onTypePlus={() => setModalDraft((d) => ({ ...d, typeName: '4 Liters' }))}
            />
            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg bg-suzuki-ice text-suzuki-navy px-5 py-2 text-sm font-bold">
                CANCEL
              </button>
              <button type="button" onClick={addVariantFromModal} className="rounded-lg bg-suzuki-red text-white px-5 py-2 text-sm font-bold">
                ADD
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .field {
          width: 100%;
          border: 1px solid #E2E8F0;
          border-radius: 0.5rem;
          padding: 0.65rem 0.85rem;
          font-size: 0.875rem;
          color: #1A2B4A;
          background: white;
          outline: none;
        }
        .field:focus { border-color: #7EB6E8; box-shadow: 0 0 0 3px rgba(126,182,232,0.25); }
        .field:disabled { background: #F8FAFC; color: #64748B; }
      `}</style>
    </div>
  )
}

function VariantBlock({
  variant,
  showAdd,
  onAdd,
  onChange,
  onRemove
}: {
  variant: ProductVariantForm
  index: number
  showAdd: boolean
  onAdd: () => void
  onChange: (patch: Partial<ProductVariantForm>) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-xl border border-suzuki-line p-4 space-y-4">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <Field label="Product Type">
            <select
              value={variant.typeName}
              onChange={(e) => onChange({ typeName: e.target.value })}
              className="field"
            >
              {[variant.typeName, ...PRODUCT_TYPES].filter((v, i, a) => a.indexOf(v) === i).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
        </div>
        {showAdd ? (
          <button type="button" onClick={onAdd} className="rounded-lg bg-suzuki-blue text-white px-3 py-2.5 text-xs font-bold whitespace-nowrap">
            + Add More
          </button>
        ) : (
          <button type="button" onClick={onRemove} className="p-2.5 text-suzuki-red hover:bg-red-50 rounded-lg" title="Remove">
            <Trash2 size={18} />
          </button>
        )}
      </div>
      <VariantFields variant={variant} onChange={(next) => onChange(next)} />
    </div>
  )
}

function VariantFields({
  variant,
  onChange,
  showTypePlus,
  onTypePlus
}: {
  variant: ProductVariantForm
  onChange: (next: ProductVariantForm) => void
  showTypePlus?: boolean
  onTypePlus?: () => void
}) {
  const set = (patch: Partial<ProductVariantForm>) => onChange({ ...variant, ...patch })

  return (
    <div className="space-y-4">
      {showTypePlus && (
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Field label="Product Type">
              <select value={variant.typeName} onChange={(e) => set({ typeName: e.target.value })} className="field">
                {PRODUCT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>
          </div>
          <button type="button" onClick={onTypePlus} className="h-10 w-10 rounded-full bg-suzuki-red text-white flex items-center justify-center" title="Add type">
            <Plus size={18} />
          </button>
        </div>
      )}

      <div>
        <p className="text-xs font-bold text-suzuki-mute uppercase tracking-wide mb-2">Pricing per Unit</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Unit Quantity">
            <input type="number" value={variant.unitQuantity} onChange={(e) => set({ unitQuantity: e.target.value === '' ? '' : Number(e.target.value) })} className="field" />
          </Field>
          <Field label="Retail Price Per Unit">
            <input type="number" value={variant.retailPrice} onChange={(e) => set({ retailPrice: e.target.value === '' ? '' : Number(e.target.value) })} className="field" />
          </Field>
          <Field label="Distributor Price">
            <input type="number" value={variant.distributorPrice} onChange={(e) => set({ distributorPrice: e.target.value === '' ? '' : Number(e.target.value) })} className="field" />
          </Field>
          <Field label="Cost Price">
            <input type="number" value={variant.costPrice} onChange={(e) => set({ costPrice: e.target.value === '' ? '' : Number(e.target.value) })} className="field" />
          </Field>
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-suzuki-mute uppercase tracking-wide mb-2">Taxes</p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="GST">
            <input type="number" value={variant.gstPercent} onChange={(e) => set({ gstPercent: e.target.value === '' ? '' : Number(e.target.value) })} className="field" />
          </Field>
          <Field label="FED">
            <input type="number" value={variant.fedPercent} onChange={(e) => set({ fedPercent: e.target.value === '' ? '' : Number(e.target.value) })} className="field" />
          </Field>
          <Field label="WHT">
            <input type="number" value={variant.whtPercent} onChange={(e) => set({ whtPercent: e.target.value === '' ? '' : Number(e.target.value) })} className="field" />
          </Field>
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-suzuki-mute uppercase tracking-wide mb-2">Profit</p>
        <Field label={variant.typeName || 'Amount'}>
          <input type="number" value={variant.profitAmount} onChange={(e) => set({ profitAmount: e.target.value === '' ? '' : Number(e.target.value) })} className="field" />
        </Field>
      </div>

      <div className="flex flex-wrap gap-6 items-center">
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-suzuki-ink cursor-pointer">
          <input
            type="checkbox"
            checked={variant.inStock}
            onChange={(e) => set({ inStock: e.target.checked })}
            className="accent-suzuki-red h-4 w-4"
          />
          In Stock
        </label>
        <div className="flex items-center gap-3 text-sm font-semibold">
          <span className="text-suzuki-mute">Publish Product</span>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input type="radio" checked={variant.isPublished} onChange={() => set({ isPublished: true })} className="accent-suzuki-red" />
            Yes
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input type="radio" checked={!variant.isPublished} onChange={() => set({ isPublished: false })} className="accent-suzuki-red" />
            No
          </label>
        </div>
      </div>
    </div>
  )
}

function ProfitBar({ label, percent, icon }: { label: string; percent: number; icon: 'suzuki' | 'truck' }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 text-sm font-bold text-suzuki-navy">
          {icon === 'truck' ? <Truck size={16} className="text-suzuki-blue" /> : <span className="text-suzuki-red text-xs font-black">S</span>}
          {label}
        </div>
        <span className="text-sm font-bold text-suzuki-ink">{percent}%</span>
      </div>
      <div className="h-2 rounded-full bg-suzuki-line overflow-hidden">
        <div className={clsx('h-full rounded-full', icon === 'truck' ? 'bg-suzuki-blue' : 'bg-suzuki-red')} style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold text-suzuki-mute uppercase tracking-wide">{label}</span>
      {children}
    </label>
  )
}
