import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { Truck } from 'lucide-react'
import clsx from 'clsx'
import { api } from '@/api/axiosClient'
import {
  money,
  uploadProductMedia,
  type CatalogLookups,
  type MasterProductDetail,
  type WizardDefaults
} from './productWizardTypes'

const emptyForm = {
  partItemNo: '',
  description: '',
  viscosity: '',
  apiStandard: '',
  modelCode: 'COMMON',
  sourceCode: '',
  supplierCode: '',
  unitValue: '',
  unitType: 'L',
  packQuantity: '1',
  costPrice: '',
  purchasePrice: '',
  salePrice: '',
  salePriceExclTaxes: '',
  fedApplicable: false,
  discontinued: false,
  applyDate: '',
  rpdcFlag: false,
  accessory: 'N'
}

export default function ProductWizardPage() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [step, setStep] = useState(1)
  const [typeId, setTypeId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [pTypeId, setPTypeId] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [lockSupplier, setLockSupplier] = useState(false)
  const [primaryImageUrl, setPrimaryImageUrl] = useState('')
  const [sectionImageUrls, setSectionImageUrls] = useState<string[]>([])
  const [uploadingImage, setUploadingImage] = useState(false)

  const lookups = useQuery({
    queryKey: ['master-catalog-lookups'],
    queryFn: async () => (await api.get<CatalogLookups>('/master-catalog/lookups')).data
  })

  const detail = useQuery({
    queryKey: ['master-product', id],
    enabled: !isNew,
    queryFn: async () => (await api.get<MasterProductDetail>(`/master-catalog/products/${id}`)).data
  })

  const selectedType = lookups.data?.productTypes.find((t) => t.id === typeId)
  const categories = useMemo(
    () => (lookups.data?.categories ?? []).filter((c) => c.productTypeId === typeId),
    [lookups.data, typeId]
  )
  const selectedCategory = categories.find((c) => c.id === categoryId)
  const profile = selectedCategory?.formProfile
  const pTypes = selectedCategory?.pTypes ?? []
  const selectedPType = pTypes.find((p) => p.id === pTypeId)
  const visibility = lookups.data?.priceVisibility

  const defaults = useQuery({
    queryKey: ['wizard-defaults', categoryId, pTypeId, form.sourceCode, form.modelCode],
    enabled: !!categoryId,
    queryFn: async () =>
      (await api.get<WizardDefaults>('/master-catalog/wizard-defaults', {
        params: {
          categoryId,
          pTypeId: pTypeId || undefined,
          sourceCode: form.sourceCode || undefined,
          modelCode: form.modelCode || undefined
        }
      })).data
  })

  useEffect(() => {
    const d = detail.data
    if (!d || !lookups.data) return
    setTypeId(d.productTypeId)
    setCategoryId(d.categoryId)
    setPTypeId(d.pTypeId)
    setForm({
      partItemNo: d.partItemNo,
      description: d.description,
      viscosity: d.viscosity ?? '',
      apiStandard: d.apiStandard ?? '',
      modelCode: d.modelCode ?? '',
      sourceCode: d.sourceCode,
      supplierCode: d.supplierCode,
      unitValue: String(d.unitValue),
      unitType: d.unitType,
      packQuantity: String(d.packQuantity),
      costPrice: d.costPrice != null ? String(d.costPrice) : '',
      purchasePrice: d.purchasePrice != null ? String(d.purchasePrice) : '',
      salePrice: d.salePrice != null ? String(d.salePrice) : '',
      salePriceExclTaxes: d.salePriceExclTaxes != null ? String(d.salePriceExclTaxes) : '',
      fedApplicable: d.fedApplicable,
      discontinued: d.discontinued,
      applyDate: d.applyDate ? d.applyDate.slice(0, 10) : '',
      rpdcFlag: d.rpdcFlag,
      accessory: d.accessory ?? 'N'
    })
    setPrimaryImageUrl(d.primaryImageUrl ?? '')
    setSectionImageUrls(d.sectionImageUrls ?? [])
    setLockSupplier(true)
    setStep(3)
  }, [detail.data, lookups.data])

  useEffect(() => {
    const d = defaults.data
    if (!d || !isNew && lockSupplier) return
    setForm((prev) => ({
      ...prev,
      supplierCode: lockSupplier && prev.supplierCode ? prev.supplierCode : (d.supplierCode ?? prev.supplierCode),
      fedApplicable: d.fedApplicable
    }))
  }, [defaults.data, isNew, lockSupplier])

  useEffect(() => {
    if (!profile?.unitTypes?.length) return
    if (!profile.unitTypes.includes(form.unitType)) {
      setForm((prev) => ({ ...prev, unitType: profile.unitTypes![0] }))
    }
  }, [profile, form.unitType])

  const packQty = Number(form.packQuantity) || 0
  const sale = Number(form.salePrice)
  const pricePerUnit = packQty > 0 && !Number.isNaN(sale) ? sale / packQty : null

  const profitMargins = useMemo(() => {
    const retail = Number(form.salePrice)
    const purchase = Number(form.purchasePrice)
    const cost = Number(form.costPrice)
    if (!retail || Number.isNaN(retail) || retail <= 0) {
      return { suzuki: 0, distributor: 0, suzukiAmount: 0, distributorAmount: 0 }
    }
    const safePurchase = Number.isNaN(purchase) ? 0 : purchase
    const safeCost = Number.isNaN(cost) ? 0 : cost
    const suzuki = Math.max(0, Math.round(((retail - safePurchase) / retail) * 1000) / 10)
    const distributor = Math.max(0, Math.round(((safePurchase - safeCost) / retail) * 1000) / 10)
    return {
      suzuki,
      distributor,
      suzukiAmount: Math.max(0, Math.round((retail - safePurchase) * 100) / 100),
      distributorAmount: Math.max(0, Math.round((safePurchase - safeCost) * 100) / 100)
    }
  }, [form.salePrice, form.purchasePrice, form.costPrice])

  const showProfit =
    !!(visibility?.canSeeCost && visibility?.canSeePurchase && visibility?.canSeeSale)

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        partItemNo: form.partItemNo.trim(),
        description: form.description.trim(),
        productTypeId: typeId,
        categoryId,
        pTypeId,
        viscosity: profile?.showViscosity === false ? '-' : form.viscosity || '-',
        apiStandard: profile?.showApiStandard === false ? '-' : form.apiStandard || '-',
        modelCode: form.modelCode || null,
        sourceCode: form.sourceCode,
        supplierCode: form.supplierCode,
        unitValue: Number(form.unitValue) || 0,
        unitType: form.unitType,
        packQuantity: Number(form.packQuantity),
        costPrice: Number(form.costPrice) || 0,
        purchasePrice: Number(form.purchasePrice) || 0,
        salePrice: Number(form.salePrice) || 0,
        salePriceExclTaxes: Number(form.salePriceExclTaxes) || 0,
        fedApplicable: form.fedApplicable,
        discontinued: form.discontinued,
        applyDate: form.applyDate || null,
        rpdcFlag: form.rpdcFlag,
        accessory: form.accessory || null,
        primaryImageUrl: primaryImageUrl || null,
        sectionImageUrls
      }
      if (isNew) {
        const { data } = await api.post<{ id: string }>('/master-catalog/products', body)
        return data.id
      }
      await api.put(`/master-catalog/products/${id}`, body)
      return id!
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['master-products'] })
      navigate('/products')
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { title?: string; detail?: string; errors?: Record<string, string[]> } } })
        ?.response?.data
      const first = msg?.errors ? Object.values(msg.errors).flat()[0] : null
      setError(first || msg?.detail || msg?.title || 'Could not save this product.')
    }
  })

  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }))

  const canOpenCategory = !!selectedType?.isReady
  const canOpenDetails = canOpenCategory && !!selectedCategory?.isReady && !!categoryId

  return (
    <div className="space-y-5 pb-10 max-w-4xl">
      <div>
        <button type="button" onClick={() => navigate('/products')} className="text-sm font-semibold text-suzuki-blue mb-2">
          ← Back to products
        </button>
        <h1 className="text-2xl font-extrabold text-suzuki-navy">{isNew ? 'Add Product' : 'Edit Product'}</h1>
        <p className="text-sm text-suzuki-mute mt-1">
          {isNew
            ? 'Each choice filters the next list. Fields come from master data, not free text.'
            : 'Type, category, and part number stay fixed. Update details, prices, and images below.'}
        </p>
      </div>

      <ol className="flex flex-wrap gap-2 text-sm">
        {['Type', 'Category', 'Details'].map((label, i) => (
          <li
            key={label}
            className={`rounded-full px-3 py-1 font-semibold ${step === i + 1 ? 'bg-suzuki-red text-white' : 'bg-suzuki-ice text-suzuki-navy'}`}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {error && (
        <div className="rounded-lg border border-suzuki-red/30 bg-red-50 px-3 py-2 text-sm text-suzuki-red">{error}</div>
      )}

      <section className="bg-white rounded-2xl border border-suzuki-line shadow-card p-6 space-y-4">
        <h2 className="text-lg font-bold text-suzuki-navy">1. Type</h2>
        <label className="block">
          <span className="text-xs font-bold text-suzuki-mute uppercase">Product type</span>
          <select
            className="field mt-1"
            value={typeId}
            disabled={!isNew}
            onChange={(e) => {
              setTypeId(e.target.value)
              setCategoryId('')
              setPTypeId('')
              setLockSupplier(false)
              setStep(2)
            }}
          >
            <option value="">Select type</option>
            {(lookups.data?.productTypes ?? []).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        {!isNew && (
          <p className="text-xs text-suzuki-mute">Type cannot be changed after the product is created.</p>
        )}
        {selectedType && !selectedType.isReady && (
          <p className="text-sm text-suzuki-mute bg-suzuki-mist rounded-lg p-3">
            {selectedType.notReadyMessage || 'This type is not ready yet.'}
          </p>
        )}
      </section>

      {typeId && (
        <section className="bg-white rounded-2xl border border-suzuki-line shadow-card p-6 space-y-4">
          <h2 className="text-lg font-bold text-suzuki-navy">2. Category</h2>
          {!canOpenCategory ? (
            <p className="text-sm text-suzuki-mute">Choose a ready type to see categories.</p>
          ) : (
            <label className="block">
              <span className="text-xs font-bold text-suzuki-mute uppercase">Category</span>
              <select
                className="field mt-1"
                value={categoryId}
                disabled={!isNew}
                onChange={(e) => {
                  const next = categories.find((c) => c.id === e.target.value)
                  setCategoryId(e.target.value)
                  setPTypeId('')
                  setLockSupplier(false)
                  if (next?.formProfile.unitTypes?.[0]) set({ unitType: next.formProfile.unitTypes[0] })
                  setStep(3)
                }}
              >
                <option value="">Select category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          )}
          {!isNew && (
            <p className="text-xs text-suzuki-mute">Category cannot be changed after the product is created.</p>
          )}
          {selectedCategory && !selectedCategory.isReady && (
            <p className="text-sm text-suzuki-mute bg-suzuki-mist rounded-lg p-3">
              {selectedCategory.notReadyMessage || profile?.placeholderMessage || 'This category is not ready yet.'}
            </p>
          )}
        </section>
      )}

      {canOpenDetails && (
        <section className="bg-white rounded-2xl border border-suzuki-line shadow-card p-6 space-y-5">
          <h2 className="text-lg font-bold text-suzuki-navy">3. {selectedCategory?.name} details</h2>
          <p className="text-sm text-suzuki-mute">
            Pack quantity is units per carton. Prices are per pack. Retailers order this product in cartons.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Part item no.">
              <input className="field" value={form.partItemNo} disabled={!isNew} onChange={(e) => set({ partItemNo: e.target.value })} />
            </Field>
            <Field label="Mobile app description">
              <input className="field" value={form.description} onChange={(e) => set({ description: e.target.value })} />
            </Field>
            <Field label="PType">
              <select className="field" value={pTypeId} onChange={(e) => { setPTypeId(e.target.value); setLockSupplier(false) }}>
                <option value="">Select PType</option>
                {pTypes.map((p) => (
                  <option key={p.id} value={p.id}>{p.code} — {p.deliveryType}</option>
                ))}
              </select>
            </Field>
            <Field label="Source">
              <select className="field" value={form.sourceCode} onChange={(e) => { set({ sourceCode: e.target.value }); setLockSupplier(false) }}>
                <option value="">Select source</option>
                {(lookups.data?.sources ?? []).map((s) => (
                  <option key={s.code} value={s.code}>{s.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Supplier">
              <select className="field" value={form.supplierCode} onChange={(e) => { set({ supplierCode: e.target.value }); setLockSupplier(true) }}>
                <option value="">Select supplier</option>
                {(lookups.data?.suppliers ?? []).map((s) => (
                  <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
                ))}
              </select>
            </Field>
            <Field label="SGO flag">
              <input className="field" disabled value={selectedPType?.sgoFlag || defaults.data?.sgoFlag ? 'Y' : 'N'} />
            </Field>
            {profile?.showModelCode !== false && (
              <Field label="Model code">
                <input className="field" value={form.modelCode} onChange={(e) => { set({ modelCode: e.target.value }); setLockSupplier(false) }} />
              </Field>
            )}
            {profile?.showViscosity !== false && (
              <Field label="Viscosity">
                <input className="field" value={form.viscosity} onChange={(e) => set({ viscosity: e.target.value })} />
              </Field>
            )}
            {profile?.showApiStandard !== false && (
              <Field label="API standard">
                <input className="field" value={form.apiStandard} onChange={(e) => set({ apiStandard: e.target.value })} />
              </Field>
            )}
            <Field label="Unit size">
              <div className="flex gap-2">
                <input type="number" step="any" className="field" value={form.unitValue} onChange={(e) => set({ unitValue: e.target.value })} />
                <select className="field max-w-[7rem]" value={form.unitType} onChange={(e) => set({ unitType: e.target.value })}>
                  {(profile?.unitTypes ?? ['L']).map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </Field>
            <Field label="Pack quantity (units per carton)">
              <input type="number" min={1} className="field" value={form.packQuantity} onChange={(e) => set({ packQuantity: e.target.value })} />
            </Field>
            {visibility?.canSeeCost && (
              <Field label="Cost price (per pack)">
                <input type="number" step="any" className="field" value={form.costPrice} onChange={(e) => set({ costPrice: e.target.value })} />
              </Field>
            )}
            {visibility?.canSeePurchase && (
              <Field label="Purchase price (per pack)">
                <input type="number" step="any" className="field" value={form.purchasePrice} onChange={(e) => set({ purchasePrice: e.target.value })} />
              </Field>
            )}
            {visibility?.canSeeSale && (
              <Field label="Sale price (per pack, incl. tax)">
                <input type="number" step="any" className="field" value={form.salePrice} onChange={(e) => set({ salePrice: e.target.value })} />
              </Field>
            )}
            {visibility?.canSeeSale && (
              <Field label="Sale price excl. taxes (per pack)">
                <input type="number" step="any" className="field" value={form.salePriceExclTaxes} onChange={(e) => set({ salePriceExclTaxes: e.target.value })} />
              </Field>
            )}
            <Field label="Sale per unit (computed)">
              <input className="field" disabled value={pricePerUnit == null ? '—' : money(pricePerUnit)} />
            </Field>
            {showProfit && (
              <div className="md:col-span-2 rounded-xl border border-suzuki-line bg-suzuki-mist/40 p-4 space-y-4">
                <div className="text-xs font-bold uppercase tracking-wide text-suzuki-mute">
                  Live profit (per pack, vs sale incl. tax)
                </div>
                <ProfitBar label="Pak Suzuki Profit" percent={profitMargins.suzuki} amount={profitMargins.suzukiAmount} icon="suzuki" />
                <ProfitBar label="Distributor Profit" percent={profitMargins.distributor} amount={profitMargins.distributorAmount} icon="truck" />
                <p className="text-[11px] text-suzuki-mute leading-relaxed">
                  Suzuki % = (Sale − Purchase) ÷ Sale. Distributor % = (Purchase − Cost) ÷ Sale. Updates as you type prices.
                </p>
              </div>
            )}
            <Field label="Apply date">
              <input type="date" className="field" value={form.applyDate} onChange={(e) => set({ applyDate: e.target.value })} />
            </Field>
            <Field label="FED applicable">
              <select className="field" value={form.fedApplicable ? 'Y' : 'N'} onChange={(e) => set({ fedApplicable: e.target.value === 'Y' })}>
                <option value="Y">Y</option>
                <option value="N">N</option>
              </select>
            </Field>
            <Field label="Discontinue">
              <select className="field" value={form.discontinued ? 'Y' : 'N'} onChange={(e) => set({ discontinued: e.target.value === 'Y' })}>
                <option value="N">N</option>
                <option value="Y">Y</option>
              </select>
            </Field>
            <Field label="Accessory (stored only)">
              <input className="field" value={form.accessory} onChange={(e) => set({ accessory: e.target.value })} />
            </Field>
            <Field label="RPDC flag (stored only)">
              <select className="field" value={form.rpdcFlag ? 'Y' : 'N'} onChange={(e) => set({ rpdcFlag: e.target.value === 'Y' })}>
                <option value="N">N</option>
                <option value="Y">Y</option>
              </select>
            </Field>
          </div>

          <div className="space-y-3 border-t border-suzuki-line pt-4">
            <h3 className="text-sm font-extrabold text-suzuki-navy">Product images</h3>
            <p className="text-xs text-suzuki-mute">
              Primary image shows in the catalog. Extra images appear on the product detail page.
            </p>
            <div className="flex flex-wrap gap-4 items-start">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-suzuki-mute">Primary</span>
                <div className="mt-1 flex flex-col gap-2">
                  {primaryImageUrl ? (
                    <img src={primaryImageUrl} alt="Primary" className="h-28 w-28 rounded-xl object-cover border border-suzuki-line" />
                  ) : (
                    <div className="h-28 w-28 rounded-xl border border-dashed border-suzuki-line bg-suzuki-mist/50" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingImage}
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      if (!file) return
                      setUploadingImage(true)
                      setError(null)
                      try {
                        setPrimaryImageUrl(await uploadProductMedia(file))
                      } catch {
                        setError('Could not upload primary image.')
                      } finally {
                        setUploadingImage(false)
                      }
                    }}
                    className="text-xs"
                  />
                  {primaryImageUrl && (
                    <button type="button" className="text-xs font-bold text-suzuki-red" onClick={() => setPrimaryImageUrl('')}>
                      Remove
                    </button>
                  )}
                </div>
              </label>

              <div className="flex-1 min-w-[12rem]">
                <span className="text-xs font-bold uppercase tracking-wide text-suzuki-mute">Gallery</span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {sectionImageUrls.map((url) => (
                    <div key={url} className="relative">
                      <img src={url} alt="" className="h-20 w-20 rounded-lg object-cover border border-suzuki-line" />
                      <button
                        type="button"
                        className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-suzuki-red text-white text-xs font-bold"
                        onClick={() => setSectionImageUrls((prev) => prev.filter((u) => u !== url))}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <label className="h-20 w-20 rounded-lg border border-dashed border-suzuki-line bg-suzuki-mist/40 flex items-center justify-center text-xs font-bold text-suzuki-mute cursor-pointer">
                    +
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingImage}
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        e.target.value = ''
                        if (!file) return
                        setUploadingImage(true)
                        setError(null)
                        try {
                          const url = await uploadProductMedia(file)
                          setSectionImageUrls((prev) => [...prev, url])
                        } catch {
                          setError('Could not upload gallery image.')
                        } finally {
                          setUploadingImage(false)
                        }
                      }}
                    />
                  </label>
                </div>
                {uploadingImage && <p className="text-xs text-suzuki-mute mt-1">Uploading…</p>}
              </div>
            </div>
          </div>

          {defaults.data && (
            <p className="text-xs text-suzuki-mute">
              GST {Math.round((defaults.data.gstRate || 0) * 10000) / 100}% · FED {Math.round((defaults.data.fedRate || 0) * 10000) / 100}%
              {defaults.data.gstInvoiceTypeCode ? ` · Invoice ${defaults.data.gstInvoiceTypeCode}` : ''}
              {profile?.flags?.lubeFlag ? ' · Lube flag Y' : ''}
              {profile?.flags?.gearOilFlag ? ' · Gear oil flag Y' : ''}
              {profile?.flags?.chemicalsFlag ? ' · Chemicals flag Y' : ''}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => navigate('/products')} className="rounded-lg bg-suzuki-ice text-suzuki-navy px-5 py-2 text-sm font-bold">
              Cancel
            </button>
            <button
              type="button"
              disabled={save.isPending || !pTypeId || !form.partItemNo || !form.description || !form.sourceCode || !form.supplierCode}
              onClick={() => { setError(null); save.mutate() }}
              className="rounded-lg bg-suzuki-red text-white px-5 py-2 text-sm font-bold disabled:opacity-50"
            >
              {save.isPending ? 'Saving…' : 'Save product'}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-suzuki-mute uppercase">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

function ProfitBar({
  label,
  percent,
  amount,
  icon
}: {
  label: string
  percent: number
  amount: number
  icon: 'suzuki' | 'truck'
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <div className="flex items-center gap-2 text-sm font-bold text-suzuki-navy">
          {icon === 'truck' ? (
            <Truck size={16} className="text-suzuki-blue" />
          ) : (
            <span className="text-suzuki-red text-xs font-black">S</span>
          )}
          {label}
        </div>
        <div className="text-right shrink-0">
          <span className="text-sm font-bold text-suzuki-ink">{percent}%</span>
          <span className="ml-2 text-xs font-semibold text-suzuki-mute">{money(amount)}</span>
        </div>
      </div>
      <div className="h-2 rounded-full bg-suzuki-line overflow-hidden">
        <div
          className={clsx('h-full rounded-full', icon === 'truck' ? 'bg-suzuki-blue' : 'bg-suzuki-red')}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </div>
  )
}
