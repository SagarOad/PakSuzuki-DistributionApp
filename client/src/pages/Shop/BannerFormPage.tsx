import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { Camera } from 'lucide-react'
import { api } from '@/api/axiosClient'
import { SHOP_CATEGORIES, uploadShopMedia, type ShopBannerRow } from './shopTypes'

type Mode = 'header' | 'category'

export default function BannerFormPage({ mode }: { mode: Mode }) {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [productCode, setProductCode] = useState('')
  const [bannerName, setBannerName] = useState('')
  const [categoryName, setCategoryName] = useState<string>(SHOP_CATEGORIES[0])
  const [imageUrl, setImageUrl] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  const detailQuery = useQuery({
    queryKey: ['shop-banner', id],
    enabled: !isNew,
    queryFn: async () => (await api.get<ShopBannerRow>(`/shopbanners/${id}`)).data
  })

  useEffect(() => {
    if (!detailQuery.data) return
    setProductCode(detailQuery.data.productCode)
    setBannerName(detailQuery.data.bannerName ?? '')
    setCategoryName(detailQuery.data.categoryName || SHOP_CATEGORIES[0])
    setImageUrl(detailQuery.data.imageUrl)
  }, [detailQuery.data])

  const save = useMutation({
    mutationFn: async () => {
      let url = imageUrl
      if (pendingFile) url = await uploadShopMedia(pendingFile, mode === 'header' ? 'header-banners' : 'category-banners')

      const body = {
        type: mode === 'header' ? 'Header' : 'Category',
        productCode,
        bannerName: mode === 'category' ? (bannerName || categoryName) : bannerName || null,
        categoryName,
        imageUrl: url || '',
        productId: null,
        isActive: true,
        sortOrder: 0
      }

      if (isNew) {
        const { data } = await api.post<{ id: string }>('/shopbanners', body)
        if (pendingFile && !url) {
          const form = new FormData()
          form.append('file', pendingFile)
          await api.post(`/shopbanners/${data.id}/image`, form)
        }
        return data.id
      }

      await api.put(`/shopbanners/${id}`, body)
      return id!
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['shop-banners'] })
      navigate('/shop')
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { title?: string; detail?: string } } })?.response?.data
      setError(msg?.detail || msg?.title || 'Save failed.')
    }
  })

  const onPickImage = (file: File | null) => {
    if (!file) return
    setPendingFile(file)
    setPreview(URL.createObjectURL(file))
  }

  const title = mode === 'header' ? 'Header-Banner' : 'Category Banner'
  const displayImage = preview || imageUrl || null

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-suzuki-navy">{title}</h1>

      <div className="bg-white rounded-2xl border border-suzuki-line shadow-card p-6">
        <h2 className="text-lg font-bold text-suzuki-navy mb-5">Product Information</h2>

        {error && (
          <div className="mb-4 rounded-lg border border-suzuki-red/30 bg-red-50 px-3 py-2 text-sm text-suzuki-red">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-4">
            <Field label="Product Code">
              <input
                value={productCode}
                onChange={(e) => setProductCode(e.target.value)}
                className="field"
                placeholder="12345"
              />
            </Field>

            {mode === 'category' && (
              <Field label="Banner Name">
                <input
                  value={bannerName}
                  onChange={(e) => setBannerName(e.target.value)}
                  className="field"
                  placeholder="Motor Car"
                />
              </Field>
            )}

            <Field label="Categories*">
              <select
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                className="field"
              >
                {SHOP_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => navigate('/shop')}
                className="rounded-lg bg-suzuki-ice text-suzuki-navy px-6 py-2.5 text-sm font-bold"
              >
                CANCEL
              </button>
              <button
                type="button"
                disabled={save.isPending || !productCode.trim() || !categoryName}
                onClick={() => { setError(null); save.mutate() }}
                className="rounded-lg bg-suzuki-red text-white px-6 py-2.5 text-sm font-bold disabled:opacity-50"
              >
                {save.isPending ? 'SAVING…' : 'SAVE'}
              </button>
            </div>
          </div>

          <div>
            <div className="aspect-[4/3] rounded-xl border border-suzuki-line bg-suzuki-mist overflow-hidden flex items-center justify-center">
              {displayImage ? (
                <img src={displayImage} alt="Banner preview" className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm text-suzuki-mute">Banner preview</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-3 inline-flex items-center gap-2 text-suzuki-red text-sm font-semibold underline"
            >
              <Camera size={16} />
              Change Product Image
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onPickImage(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
      </div>

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
      `}</style>
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
