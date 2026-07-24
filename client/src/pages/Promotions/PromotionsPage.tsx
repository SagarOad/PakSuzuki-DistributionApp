import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, ImageIcon, Pencil, Plus, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { api } from '@/api/axiosClient'
import { OrderTable, ListTabPill } from '@/components/ui/DataTable'

type PromoType = 'NewsletterPopUp' | 'PromotionBanner'
type Tab = 'all' | PromoType

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

export default function PromotionsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<PromoRow | null>(null)

  const typeFilter = tab === 'all' ? undefined : tab

  const listQuery = useQuery({
    queryKey: ['promotions', typeFilter, search, page],
    queryFn: async () =>
      (await api.get<Paged<PromoRow>>('/promotions', {
        params: { type: typeFilter, search: search || undefined, pageNumber: page, pageSize: 10 }
      })).data
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/promotions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promotions'] })
  })

  const items = listQuery.data?.items ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
        <h1 className="text-2xl font-extrabold text-suzuki-navy">Banner &amp; Promotions</h1>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ['all', 'All'],
              ['NewsletterPopUp', 'Newsletter Pop-Up'],
              ['PromotionBanner', 'Promotion Banners']
            ] as const
          ).map(([key, label]) => (
            <ListTabPill key={key} active={tab === key} onClick={() => { setTab(key); setPage(1) }}>
              {label}
            </ListTabPill>
          ))}
          <button
            type="button"
            onClick={() => { setEditing(null); setModalOpen(true) }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-sky-100 text-suzuki-navy font-bold px-4 py-2.5 hover:bg-sky-200"
          >
            <Plus size={16} /> Add New
          </button>
        </div>
      </div>

      <OrderTable
        title="Banner & Promotions List"
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        columns={[
          { key: 'title', header: 'Title', wide: true },
          { key: 'media', header: 'Image/Redirect URL' },
          { key: 'date', header: 'Date' },
          { key: 'type', header: 'Type' },
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
            <td className="px-3 py-3.5 text-[#64748B]">{new Date(p.createdAtUtc).toLocaleDateString('en-GB')}</td>
            <td className="px-3 py-3.5 text-[#64748B]">{typeLabel(p.type)}</td>
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
                  onClick={() => { setEditing(p); setModalOpen(true) }}
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

      {modalOpen && (
        <AddPromotionModal
          initial={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false)
            void qc.invalidateQueries({ queryKey: ['promotions'] })
          }}
        />
      )}
    </div>
  )
}

function AddPromotionModal({
  initial,
  onClose,
  onSaved
}: {
  initial: PromoRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [type, setType] = useState<PromoType>((initial?.type as PromoType) || 'NewsletterPopUp')
  const [redirectUrl, setRedirectUrl] = useState(initial?.redirectUrl ?? '')
  const [publishDistributor, setPublishDistributor] = useState(initial?.targetRoles.includes('Distributor') ?? true)
  const [publishRetailer, setPublishRetailer] = useState(initial?.targetRoles.includes('Retailer') ?? true)
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
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

      const form = new FormData()
      form.append('title', title.trim())
      form.append('type', type)
      form.append('targetRoles', roles)
      form.append('isActive', String(isActive))
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
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-card w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-extrabold text-suzuki-navy mb-5">
          {initial ? 'Edit Advertisement' : 'Add Advertisement'}
        </h3>

        {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block space-y-1.5 sm:col-span-1">
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

        <div className="mt-4 space-y-1.5">
          <div className="text-sm font-bold text-suzuki-navy">Banner Image</div>
          <div className="text-xs text-suzuki-mute">Required Dimensions: {dims}</div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="mt-1 w-full min-h-[140px] rounded-xl border border-dashed border-sky-200 bg-sky-50 flex flex-col items-center justify-center gap-2 text-sm font-semibold text-suzuki-mute hover:bg-sky-100 overflow-hidden"
          >
            {preview ? (
              <img src={preview} alt="" className="max-h-36 object-contain" />
            ) : (
              <>Click or drag and drop image</>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              setFile(f)
              setPreview(f ? URL.createObjectURL(f) : preview)
            }}
          />
        </div>

        {type === 'PromotionBanner' && (
          <label className="block mt-4 space-y-1.5">
            <span className="text-sm font-bold text-suzuki-navy">Redirect URL (Optional)</span>
            <input value={redirectUrl} onChange={(e) => setRedirectUrl(e.target.value)} className="field" placeholder="https://..." />
          </label>
        )}

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

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl bg-sky-100 text-suzuki-navy font-bold px-6 py-2.5">
            CANCEL
          </button>
          <button
            type="button"
            disabled={saveMutation.isPending}
            onClick={() => { setError(null); saveMutation.mutate() }}
            className="rounded-xl bg-suzuki-red text-white font-bold px-6 py-2.5 disabled:opacity-50"
          >
            {initial ? 'SAVE' : 'ADD'}
          </button>
        </div>
      </div>

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
    </div>
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
