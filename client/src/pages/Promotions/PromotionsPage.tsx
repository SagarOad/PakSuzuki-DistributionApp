import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, ImageIcon, Pencil, Plus, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { api } from '@/api/axiosClient'
import { OrderTable, ListTabPill, DataTable } from '@/components/ui/DataTable'
import type { CatalogLookups } from '@/pages/Products/productWizardTypes'
import {
  DEFAULT_BANNER_CATEGORIES,
  categoryLabel,
  uploadShopMedia,
  validateBannerAspect,
  type ShopBannerRow
} from '@/pages/Shop/shopTypes'

type PromoType = 'NewsletterPopUp' | 'PromotionBanner'
type Tab = 'header' | 'category' | 'NewsletterPopUp' | 'PromotionBanner' | 'all'
type ShopBannerMode = 'header' | 'category'

interface PromoRow {
  id: string
  title: string
  type: string
  imageUrl: string
  redirectUrl?: string | null
  targetRoles: string
  isActive: boolean
  startDateUtc: string
  endDateUtc: string
  createdAtUtc: string
}

interface Paged<T> {
  items: T[]
  pageNumber: number
  totalPages: number
  totalCount: number
}

const typeLabel = (t: string) =>
  t === 'NewsletterPopUp' ? 'Newsletter Pop-Up' : t === 'PromotionBanner' ? 'Promotion Banner' : t

function toDateInput(iso?: string) {
  if (!iso) return ''
  return iso.slice(0, 10)
}

const addBtnClass =
  'inline-flex items-center gap-1.5 rounded-xl bg-sky-100 text-suzuki-navy font-bold px-4 py-2.5 hover:bg-sky-200'

export default function PromotionsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('header')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const [promoModalOpen, setPromoModalOpen] = useState(false)
  const [editingPromo, setEditingPromo] = useState<PromoRow | null>(null)

  const [bannerModalOpen, setBannerModalOpen] = useState(false)
  const [bannerMode, setBannerMode] = useState<ShopBannerMode>('header')
  const [editingBanner, setEditingBanner] = useState<ShopBannerRow | null>(null)

  const isShopTab = tab === 'header' || tab === 'category'
  const promoTypeFilter =
    tab === 'all' ? undefined : tab === 'NewsletterPopUp' || tab === 'PromotionBanner' ? tab : undefined

  const headersQuery = useQuery({
    queryKey: ['shop-banners', 'Header', search],
    enabled: tab === 'header',
    queryFn: async () =>
      (await api.get<Paged<ShopBannerRow>>('/shopbanners', {
        params: { type: 'Header', search: search || undefined, pageSize: 50 }
      })).data
  })

  const categoriesQuery = useQuery({
    queryKey: ['shop-banners', 'Category', search],
    enabled: tab === 'category',
    queryFn: async () =>
      (await api.get<Paged<ShopBannerRow>>('/shopbanners', {
        params: { type: 'Category', search: search || undefined, pageSize: 50 }
      })).data
  })

  const listQuery = useQuery({
    queryKey: ['promotions', promoTypeFilter, search, page],
    enabled: !isShopTab,
    queryFn: async () =>
      (await api.get<Paged<PromoRow>>('/promotions', {
        params: { type: promoTypeFilter, search: search || undefined, pageNumber: page, pageSize: 10 }
      })).data
  })

  const deleteBanner = useMutation({
    mutationFn: async (id: string) => api.delete(`/shopbanners/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['shop-banners'] })
      void qc.invalidateQueries({ queryKey: ['catalog-banners'] })
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/promotions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promotions'] })
  })

  const items = listQuery.data?.items ?? []
  const shopItems = tab === 'header' ? (headersQuery.data?.items ?? []) : (categoriesQuery.data?.items ?? [])

  const openAdd = () => {
    if (isShopTab) {
      setBannerMode(tab === 'category' ? 'category' : 'header')
      setEditingBanner(null)
      setBannerModalOpen(true)
    } else {
      setEditingPromo(null)
      setPromoModalOpen(true)
    }
  }

  const addLabel = tab === 'header'
    ? 'Add Header Banner'
    : tab === 'category'
      ? 'Add Category Banner'
      : 'Add New'

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-start gap-3 justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-suzuki-navy">Banner &amp; Promotions</h1>
          <p className="text-sm text-suzuki-mute mt-1 max-w-2xl">
            Header banners show on Start Order and Distributor dashboard.
            Category banners show as category tiles on Start Order.
            Promotion / newsletter items pop up when Distributor or Retailer signs in (within start–end dates).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ['header', 'Header banners'],
              ['category', 'Category banners'],
              ['NewsletterPopUp', 'Newsletter pop-up'],
              ['PromotionBanner', 'Promotion banners'],
              ['all', 'All promotions']
            ] as const
          ).map(([key, label]) => (
            <ListTabPill
              key={key}
              active={tab === key}
              onClick={() => { setTab(key); setPage(1); setSearch('') }}
            >
              {label}
            </ListTabPill>
          ))}
          <button type="button" onClick={openAdd} className={addBtnClass}>
            <Plus size={16} /> {addLabel}
          </button>
        </div>
      </div>

      {isShopTab ? (
        <DataTable
          title={
            <h2 className="text-lg font-bold text-suzuki-navy">
              {tab === 'header' ? 'Header Banner List' : 'Category Banner List'}
            </h2>
          }
          search={search}
          onSearchChange={setSearch}
          columns={[
            { key: 'image', header: 'Image' },
            { key: 'code', header: 'Code' },
            { key: 'name', header: 'Banner' },
            { key: 'category', header: 'Category' },
            { key: 'status', header: 'Status' },
            { key: 'action', header: 'Action', align: 'right' }
          ]}
          loading={tab === 'header' ? headersQuery.isLoading : categoriesQuery.isLoading}
          empty={tab === 'header' ? 'No header banners yet.' : 'No category banners yet.'}
        >
          {shopItems.map((b) => (
            <tr key={b.id} className="border-b border-[#E2E4EA]/80 hover:bg-[#F5F7FB]/60">
              <td className="pl-4 pr-3 py-3.5">
                {b.imageUrl ? (
                  <img src={b.imageUrl} alt="" className="h-10 w-16 rounded object-cover" />
                ) : (
                  '—'
                )}
              </td>
              <td className="px-3 py-3.5 font-semibold text-suzuki-blue">{b.productCode}</td>
              <td className="px-3 py-3.5 text-[#0B2E59] font-semibold">{b.bannerName || '—'}</td>
              <td className="px-3 py-3.5 text-[#64748B]">{categoryLabel(null, b.categoryName)}</td>
              <td className="px-3 py-3.5">
                <span className={clsx(
                  'inline-flex rounded-full px-3 py-1 text-[11px] font-bold',
                  b.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                )}>
                  {b.isActive ? 'Active' : 'In Active'}
                </span>
              </td>
              <td className="pl-3 pr-4 py-3.5">
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    className="p-1.5 text-suzuki-blue hover:bg-suzuki-ice rounded-lg"
                    onClick={() => {
                      setBannerMode(tab === 'category' ? 'category' : 'header')
                      setEditingBanner(b)
                      setBannerModalOpen(true)
                    }}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    className="p-1.5 text-suzuki-navy hover:bg-rose-50 hover:text-suzuki-red rounded-lg"
                    onClick={() => {
                      if (confirm('Delete this banner?')) deleteBanner.mutate(b.id)
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      ) : (
        <OrderTable
          title="Promotions List"
          search={search}
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          columns={[
            { key: 'title', header: 'Title', wide: true },
            { key: 'media', header: 'Image/Redirect URL' },
            { key: 'dates', header: 'Active period' },
            { key: 'type', header: 'Type' },
            { key: 'audience', header: 'Publish to' },
            { key: 'status', header: 'Status' },
            { key: 'action', header: 'Action', align: 'right' }
          ]}
          loading={listQuery.isLoading}
          empty="No promotions yet."
          pagination={{
            page,
            totalPages: listQuery.data?.totalPages ?? 1,
            onChange: setPage,
            variant: 'full',
            showingText: `Showing ${items.length === 0 ? '00' : '01'} to ${String(items.length).padStart(2, '0')} of ${listQuery.data?.totalCount ?? 0} entries`
          }}
        >
          {items.map((p) => (
            <tr key={p.id} className="border-b border-[#E2E4EA]/80 hover:bg-[#F5F7FB]/60">
              <td className="pl-4 pr-3 py-3.5 font-semibold text-[#0B2E59]">{p.title}</td>
              <td className="px-3 py-3.5">
                {p.redirectUrl ? (
                  <a href={p.redirectUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-suzuki-blue hover:underline">
                    <ExternalLink size={14} /> Go To Link
                  </a>
                ) : (
                  <a href={p.imageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-suzuki-blue hover:underline">
                    <ImageIcon size={14} /> View Image
                  </a>
                )}
              </td>
              <td className="px-3 py-3.5 text-[#64748B] text-sm">
                {new Date(p.startDateUtc).toLocaleDateString('en-GB')}
                {' – '}
                {new Date(p.endDateUtc).toLocaleDateString('en-GB')}
              </td>
              <td className="px-3 py-3.5 text-[#64748B]">{typeLabel(p.type)}</td>
              <td className="px-3 py-3.5 text-[#64748B] text-sm">{p.targetRoles || '—'}</td>
              <td className="px-3 py-3.5">
                <span className={clsx(
                  'inline-flex rounded-full px-3 py-1 text-[11px] font-bold',
                  p.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                )}>
                  {p.isActive ? 'Active' : 'In Active'}
                </span>
              </td>
              <td className="pl-3 pr-4 py-3.5">
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    className="p-1.5 text-suzuki-blue hover:bg-suzuki-ice rounded-lg"
                    onClick={() => { setEditingPromo(p); setPromoModalOpen(true) }}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    className="p-1.5 text-suzuki-navy hover:bg-rose-50 hover:text-suzuki-red rounded-lg"
                    onClick={() => { if (confirm(`Delete "${p.title}"?`)) deleteMutation.mutate(p.id) }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </OrderTable>
      )}

      {bannerModalOpen && (
        <AddShopBannerModal
          mode={bannerMode}
          initial={editingBanner}
          onClose={() => setBannerModalOpen(false)}
          onSaved={() => {
            setBannerModalOpen(false)
            void qc.invalidateQueries({ queryKey: ['shop-banners'] })
            void qc.invalidateQueries({ queryKey: ['catalog-banners'] })
          }}
        />
      )}

      {promoModalOpen && (
        <AddPromotionModal
          initial={editingPromo}
          defaultType={tab === 'PromotionBanner' ? 'PromotionBanner' : 'NewsletterPopUp'}
          onClose={() => setPromoModalOpen(false)}
          onSaved={() => {
            setPromoModalOpen(false)
            void qc.invalidateQueries({ queryKey: ['promotions'] })
            void qc.invalidateQueries({ queryKey: ['catalog-active-promotions'] })
          }}
        />
      )}
    </div>
  )
}

function AddShopBannerModal({
  mode,
  initial,
  onClose,
  onSaved
}: {
  mode: ShopBannerMode
  initial: ShopBannerRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [productCode, setProductCode] = useState(initial?.productCode ?? '')
  const [bannerName, setBannerName] = useState(initial?.bannerName ?? '')
  const [categoryName, setCategoryName] = useState(initial?.categoryName || DEFAULT_BANNER_CATEGORIES[0])
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(initial?.imageUrl ?? null)
  const [error, setError] = useState<string | null>(null)

  const lookups = useQuery({
    queryKey: ['master-catalog-lookups'],
    queryFn: async () => (await api.get<CatalogLookups>('/master-catalog/lookups')).data
  })

  const categories = useMemo(() => {
    const fromApi = (lookups.data?.categories ?? [])
      .filter((c) => c.isReady !== false)
      .map((c) => c.name)
      .filter(Boolean)
    const unique = [...new Set(fromApi)]
    return unique.length > 0 ? unique : [...DEFAULT_BANNER_CATEGORIES]
  }, [lookups.data])

  useEffect(() => {
    if (!categories.includes(categoryName) && categories[0]) setCategoryName(categories[0])
  }, [categories, categoryName])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!productCode.trim()) throw new Error('Product code is required.')
      if (!categoryName) throw new Error('Category is required.')
      if (!initial && !file) throw new Error('Banner image is required.')

      let imageUrl = initial?.imageUrl ?? ''
      if (file) {
        imageUrl = await uploadShopMedia(
          file,
          mode === 'header' ? 'header-banners' : 'category-banners',
          mode === 'header' ? 'Header' : 'Category'
        )
      }
      if (!imageUrl) throw new Error('Banner image is required.')

      const body = {
        type: mode === 'header' ? 'Header' : 'Category',
        productCode: productCode.trim(),
        bannerName: bannerName.trim() || (mode === 'category' ? categoryName : null),
        categoryName,
        imageUrl,
        productId: null,
        isActive,
        sortOrder: initial?.sortOrder ?? 0
      }

      if (initial) await api.put(`/shopbanners/${initial.id}`, body)
      else await api.post('/shopbanners', body)
    },
    onSuccess: onSaved,
    onError: (e: unknown) => {
      setError(
        (e as { response?: { data?: { detail?: string; title?: string; message?: string } }; message?: string })
          ?.response?.data?.detail
          ?? (e as { response?: { data?: { title?: string } } })?.response?.data?.title
          ?? (e as Error)?.message
          ?? 'Could not save banner.'
      )
    }
  })

  const title = mode === 'header'
    ? (initial ? 'Edit Header Banner' : 'Add Header Banner')
    : (initial ? 'Edit Category Banner' : 'Add Category Banner')

  return (
    <ModalShell title={title} onClose={onClose}>
      <p className="text-xs text-suzuki-mute mb-5">
        {mode === 'header'
          ? 'Shows at the top of Start Order and Distributor dashboard.'
          : 'Shows as a category tile on Start Order (Engine Oil, Gear Oil, etc.).'}
      </p>

      {error && <ErrorBox message={error} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <span className="text-sm font-bold text-suzuki-navy">Product Code</span>
          <input value={productCode} onChange={(e) => setProductCode(e.target.value)} className="field" placeholder="12345" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-bold text-suzuki-navy">Category*</span>
          <select value={categoryName} onChange={(e) => setCategoryName(e.target.value)} className="field">
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="block mt-4 space-y-1.5">
        <span className="text-sm font-bold text-suzuki-navy">
          Banner Name {mode === 'header' ? '(Optional)' : ''}
        </span>
        <input
          value={bannerName}
          onChange={(e) => setBannerName(e.target.value)}
          className="field"
          placeholder={mode === 'category' ? 'Engine Oil' : 'Summer offer'}
        />
      </label>

      <div className="mt-4 space-y-1.5">
        <div className="text-sm font-bold text-suzuki-navy">Banner Image</div>
        <div className="text-xs text-suzuki-mute">
          Required aspect: {mode === 'header' ? '16:5 (wide header)' : '16:10 (category card)'} · JPG/PNG
        </div>
        <ImageDropZone
          preview={preview}
          onPick={() => fileRef.current?.click()}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null
            if (!f) return
            void validateBannerAspect(f, mode === 'header' ? 'Header' : 'Category')
              .then(() => {
                setError(null)
                setFile(f)
                setPreview(URL.createObjectURL(f))
              })
              .catch((err: Error) => {
                setFile(null)
                setError(err.message)
                e.target.value = ''
              })
          }}
        />
      </div>

      <div className="mt-4">
        <div className="text-sm font-bold text-suzuki-navy mb-2">Status</div>
        <CheckOption checked={isActive} onChange={setIsActive} label="Active" tone="green" />
      </div>

      <ModalActions
        onCancel={onClose}
        onSave={() => { setError(null); saveMutation.mutate() }}
        saving={saveMutation.isPending}
        isEdit={!!initial}
      />
      <ModalFieldStyles />
    </ModalShell>
  )
}

function AddPromotionModal({
  initial,
  defaultType,
  onClose,
  onSaved
}: {
  initial: PromoRow | null
  defaultType: PromoType
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [type, setType] = useState<PromoType>((initial?.type as PromoType) || defaultType)
  const [redirectUrl, setRedirectUrl] = useState(initial?.redirectUrl ?? '')
  const [publishDistributor, setPublishDistributor] = useState(initial?.targetRoles.includes('Distributor') ?? true)
  const [publishRetailer, setPublishRetailer] = useState(initial?.targetRoles.includes('Retailer') ?? true)
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  const [startDate, setStartDate] = useState(toDateInput(initial?.startDateUtc) || toDateInput(new Date().toISOString()))
  const [endDate, setEndDate] = useState(
    toDateInput(initial?.endDateUtc) ||
      toDateInput(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString())
  )
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(initial?.imageUrl ?? null)
  const [error, setError] = useState<string | null>(null)
  const [typeOpen, setTypeOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const dims = useMemo(
    () => (type === 'NewsletterPopUp' ? '335 x 156 pixels' : '330 x 330 pixels'),
    [type]
  )

  const saveMutation = useMutation({
    mutationFn: async () => {
      const roles = [
        publishDistributor ? 'Distributor' : null,
        publishRetailer ? 'Retailer' : null
      ].filter(Boolean).join(',')
      if (!roles) throw new Error('Select at least one Publish To audience.')
      if (!title.trim()) throw new Error('Title is required.')
      if (!initial && !file) throw new Error('Banner image is required.')
      if (!startDate || !endDate) throw new Error('Start and end dates are required.')
      if (endDate < startDate) throw new Error('End date must be after start date.')

      const form = new FormData()
      form.append('title', title.trim())
      form.append('type', type)
      form.append('targetRoles', roles)
      form.append('isActive', String(isActive))
      form.append('startDateUtc', new Date(`${startDate}T00:00:00.000Z`).toISOString())
      form.append('endDateUtc', new Date(`${endDate}T23:59:59.000Z`).toISOString())
      if (redirectUrl.trim()) form.append('redirectUrl', redirectUrl.trim())
      if (initial?.imageUrl) form.append('existingImageUrl', initial.imageUrl)
      if (file) form.append('image', file)

      if (initial) await api.put(`/promotions/${initial.id}`, form)
      else await api.post('/promotions', form)
    },
    onSuccess: onSaved,
    onError: (e: unknown) => {
      setError((e as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
        ?? (e as Error)?.message
        ?? 'Could not save advertisement.')
    }
  })

  return (
    <ModalShell title={initial ? 'Edit Advertisement' : 'Add Advertisement'} onClose={onClose}>
      <p className="text-xs text-suzuki-mute mb-5">
        When active and within the date range, this shows as a popup after Distributor / Retailer login.
      </p>

      {error && <ErrorBox message={error} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <span className="text-sm font-bold text-suzuki-navy">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="field" placeholder="Promotion" />
        </label>
        <div className="relative space-y-1.5">
          <span className="text-sm font-bold text-suzuki-navy">Type</span>
          <button
            type="button"
            onClick={() => setTypeOpen((v) => !v)}
            className="field w-full text-left flex items-center justify-between"
          >
            {typeLabel(type)}
            <span className="text-suzuki-mute text-xs">▾</span>
          </button>
          {typeOpen && (
            <div className="absolute z-10 mt-1 w-full rounded-xl border border-suzuki-line bg-white shadow-card overflow-hidden">
              {(['NewsletterPopUp', 'PromotionBanner'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={clsx(
                    'w-full text-left px-3 py-2.5 text-sm font-semibold',
                    type === t ? 'bg-sky-50 text-suzuki-navy' : 'hover:bg-suzuki-mist text-suzuki-ink'
                  )}
                  onClick={() => { setType(t); setTypeOpen(false) }}
                >
                  {typeLabel(t)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <span className="text-sm font-bold text-suzuki-navy">Start date</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="field" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-bold text-suzuki-navy">End date</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="field" />
        </label>
      </div>

      <div className="mt-4 space-y-1.5">
        <div className="text-sm font-bold text-suzuki-navy">Banner Image</div>
        <div className="text-xs text-suzuki-mute">
          Required aspect: {dims} · JPG/PNG
        </div>
        <ImageDropZone preview={preview} onPick={() => fileRef.current?.click()} />
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null
            if (!f) return
            void validateBannerAspect(f, type)
              .then(() => {
                setError(null)
                setFile(f)
                setPreview(URL.createObjectURL(f))
              })
              .catch((err: Error) => {
                setFile(null)
                setError(err.message)
                e.target.value = ''
              })
          }}
        />
      </div>

      <label className="block mt-4 space-y-1.5">
        <span className="text-sm font-bold text-suzuki-navy">Redirect URL (Optional)</span>
        <input value={redirectUrl} onChange={(e) => setRedirectUrl(e.target.value)} className="field" placeholder="https://..." />
      </label>

      <div className="mt-4">
        <div className="text-sm font-bold text-suzuki-navy mb-2">Publish To</div>
        <div className="flex flex-wrap gap-4">
          <CheckOption checked={publishDistributor} onChange={setPublishDistributor} label="Distributor" tone="red" />
          <CheckOption checked={publishRetailer} onChange={setPublishRetailer} label="Retailers" tone="red" />
        </div>
      </div>

      <div className="mt-4">
        <div className="text-sm font-bold text-suzuki-navy mb-2">Status</div>
        <CheckOption checked={isActive} onChange={setIsActive} label="Active" tone="green" />
      </div>

      <ModalActions
        onCancel={onClose}
        onSave={() => { setError(null); saveMutation.mutate() }}
        saving={saveMutation.isPending}
        isEdit={!!initial}
      />
      <ModalFieldStyles />
    </ModalShell>
  )
}

function ModalShell({
  title,
  onClose,
  children
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-card w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-extrabold text-suzuki-navy mb-2">{title}</h3>
        {children}
      </div>
    </div>
  )
}

function ModalActions({
  onCancel,
  onSave,
  saving,
  isEdit
}: {
  onCancel: () => void
  onSave: () => void
  saving: boolean
  isEdit: boolean
}) {
  return (
    <div className="mt-6 flex justify-end gap-3">
      <button type="button" onClick={onCancel} className="rounded-xl bg-sky-100 text-suzuki-navy font-bold px-6 py-2.5">
        CANCEL
      </button>
      <button
        type="button"
        disabled={saving}
        onClick={onSave}
        className="rounded-xl bg-suzuki-red text-white font-bold px-6 py-2.5 disabled:opacity-50"
      >
        {isEdit ? 'SAVE' : 'ADD'}
      </button>
    </div>
  )
}

function ImageDropZone({ preview, onPick }: { preview: string | null; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="mt-1 w-full min-h-[140px] rounded-xl border border-dashed border-sky-200 bg-sky-50 flex flex-col items-center justify-center gap-2 text-sm font-semibold text-suzuki-mute hover:bg-sky-100 overflow-hidden"
    >
      {preview ? (
        <img src={preview} alt="" className="max-h-36 object-contain" />
      ) : (
        <>Click or drag and drop image</>
      )}
    </button>
  )
}

function ErrorBox({ message }: { message: string }) {
  return <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{message}</div>
}

function ModalFieldStyles() {
  return (
    <style>{`
      .field {
        width: 100%;
        border-radius: 0.75rem;
        border: 1px solid #e2e8f0;
        background: #f8fafc;
        padding: 0.65rem 0.85rem;
        font-size: 0.875rem;
        outline: none;
      }
      .field:focus { border-color: #005BAC; background: #fff; }
    `}</style>
  )
}

function CheckOption({
  checked,
  onChange,
  label,
  tone
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  tone: 'red' | 'green'
}) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={clsx(
          'h-5 w-5 rounded flex items-center justify-center text-white text-xs font-bold',
          checked
            ? tone === 'green' ? 'bg-emerald-500' : 'bg-rose-500'
            : 'bg-white border border-suzuki-line'
        )}
      >
        {checked ? '✓' : ''}
      </button>
      <span className="text-sm font-semibold text-suzuki-navy">{label}</span>
    </label>
  )
}
