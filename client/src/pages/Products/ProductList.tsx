import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Download, Pencil, Trash2, Upload } from 'lucide-react'
import { api } from '@/api/axiosClient'
import { useAuth } from '@/context/AuthContext'
import { TablePagination } from '@/components/ui/DataTable'
import { money, type CatalogLookups, type MasterProductRow } from './productWizardTypes'

interface PagedResult {
  items: MasterProductRow[]
  totalCount: number
  pageNumber: number
  totalPages: number
}

const PAGE_SIZE = 10

export default function ProductList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { role } = useAuth()
  const canManage = role === 'SuperAdmin' || role === 'Admin'
  const [search, setSearch] = useState('')
  const [productTypeId, setProductTypeId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [pTypeId, setPTypeId] = useState('')
  const [sourceCode, setSourceCode] = useState('')
  const [supplierCode, setSupplierCode] = useState('')
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)

  const lookups = useQuery({
    queryKey: ['master-catalog-lookups'],
    queryFn: async () => (await api.get<CatalogLookups>('/master-catalog/lookups')).data
  })

  const categories = useMemo(() => {
    const all = lookups.data?.categories ?? []
    if (!productTypeId) return all
    return all.filter((c) => c.productTypeId === productTypeId)
  }, [lookups.data, productTypeId])

  const deliveryTypes = useMemo(() => {
    if (categoryId) {
      return categories.find((c) => c.id === categoryId)?.pTypes ?? []
    }
    const map = new Map<string, (typeof categories)[0]['pTypes'][0]>()
    for (const c of categories) {
      for (const p of c.pTypes) map.set(p.id, p)
    }
    return [...map.values()]
  }, [categories, categoryId])

  const products = useQuery({
    queryKey: ['master-products', search, productTypeId, categoryId, pTypeId, sourceCode, supplierCode, page],
    queryFn: async () =>
      (await api.get<PagedResult>('/master-catalog/products', {
        params: {
          search: search || undefined,
          productTypeId: productTypeId || undefined,
          categoryId: categoryId || undefined,
          pTypeId: pTypeId || undefined,
          sourceCode: sourceCode || undefined,
          supplierCode: supplierCode || undefined,
          pageNumber: page,
          pageSize: PAGE_SIZE
        }
      })).data
  })

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => api.delete(`/master-catalog/products/${id}`),
    onSuccess: async () => {
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['master-products'] })
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { title?: string } } })?.response?.data?.title ||
        'Could not delete product.'
      setError(msg)
    }
  })

  const resetPage = () => setPage(1)
  const visibility = lookups.data?.priceVisibility
  const rows = products.data
  const showingText = useMemo(() => {
    if (!rows) return ''
    const start = rows.totalCount === 0 ? 0 : (rows.pageNumber - 1) * PAGE_SIZE + 1
    const end = Math.min(rows.pageNumber * PAGE_SIZE, rows.totalCount)
    return `Showing ${String(start).padStart(2, '0')} to ${String(end).padStart(2, '0')} of ${rows.totalCount} entries`
  }, [rows])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-suzuki-navy">Product master</h1>
          <p className="text-sm text-suzuki-mute mt-1">
            Filter by type, category, delivery, source, and supplier. Lubricants are carton-based.
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              className="rounded-lg border border-suzuki-line bg-white text-suzuki-navy text-sm font-bold px-4 py-2 hover:bg-suzuki-ice"
            >
              Upload bulk
            </button>
            <button
              type="button"
              onClick={() => navigate('/products/new')}
              className="rounded-lg bg-suzuki-red hover:bg-red-700 text-white text-sm font-bold px-4 py-2"
            >
              + Add Product
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-navy-100 overflow-hidden">
        <div className="p-4 sm:px-6 border-b border-navy-100 flex flex-wrap gap-3">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              resetPage()
            }}
            placeholder="Search part number or name"
            className="field max-w-sm"
          />
          <select
            value={productTypeId}
            onChange={(e) => {
              setProductTypeId(e.target.value)
              setCategoryId('')
              setPTypeId('')
              resetPage()
            }}
            className="field max-w-[11rem]"
          >
            <option value="">All types</option>
            {(lookups.data?.productTypes ?? []).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <select
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value)
              setPTypeId('')
              resetPage()
            }}
            className="field max-w-[12rem]"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={pTypeId}
            onChange={(e) => {
              setPTypeId(e.target.value)
              resetPage()
            }}
            className="field max-w-[14rem]"
          >
            <option value="">All delivery types</option>
            {deliveryTypes.map((p) => (
              <option key={p.id} value={p.id}>{p.code} — {p.deliveryType}</option>
            ))}
          </select>
          <select
            value={sourceCode}
            onChange={(e) => {
              setSourceCode(e.target.value)
              resetPage()
            }}
            className="field max-w-[10rem]"
          >
            <option value="">All sources</option>
            {(lookups.data?.sources ?? []).map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
                {s.isReady === false ? ' (awaiting data)' : ''}
              </option>
            ))}
          </select>
          <select
            value={supplierCode}
            onChange={(e) => {
              setSupplierCode(e.target.value)
              resetPage()
            }}
            className="field max-w-[12rem]"
          >
            <option value="">All suppliers</option>
            {(lookups.data?.suppliers ?? []).map((s) => (
              <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead className="bg-navy-100 text-navy-700 text-left">
              <tr>
                <th className="px-4 py-3">Part no.</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Delivery</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Pack</th>
                <th className="px-4 py-3 text-center">Discontinue</th>
                {visibility?.canSeeCost && <th className="px-4 py-3 text-right">Cost / pack</th>}
                {visibility?.canSeePurchase && <th className="px-4 py-3 text-right">Purchase / pack</th>}
                {visibility?.canSeeSale && <th className="px-4 py-3 text-right">Sale / pack</th>}
                {canManage && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {products.isLoading && (
                <tr><td colSpan={14} className="px-4 py-6 text-center text-navy-500">Loading…</td></tr>
              )}
              {!products.isLoading && rows?.items.length === 0 && (
                <tr><td colSpan={14} className="px-4 py-6 text-center text-navy-500">No products match these filters.</td></tr>
              )}
              {rows?.items.map((p) => (
                <tr key={p.id} className="border-t border-navy-100 hover:bg-suzuki-mist/60">
                  <td className="px-4 py-3 font-mono text-xs">{p.partItemNo}</td>
                  <td className="px-4 py-3">{p.description}</td>
                  <td className="px-4 py-3">{p.productType}</td>
                  <td className="px-4 py-3">{p.category}</td>
                  <td className="px-4 py-3 text-xs">{p.pType || '—'}</td>
                  <td className="px-4 py-3">{p.source || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{p.supplier || '—'}</td>
                  <td className="px-4 py-3">{p.packLabel}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={p.discontinued ? 'text-suzuki-red font-bold' : 'text-suzuki-mute font-semibold'}>
                      {p.discontinued ? 'Y' : 'N'}
                    </span>
                  </td>
                  {visibility?.canSeeCost && <td className="px-4 py-3 text-right">{money(p.costPrice)}</td>}
                  {visibility?.canSeePurchase && <td className="px-4 py-3 text-right">{money(p.purchasePrice)}</td>}
                  {visibility?.canSeeSale && <td className="px-4 py-3 text-right">{money(p.salePrice)}</td>}
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          className="p-1.5 text-suzuki-blue hover:bg-suzuki-ice rounded-lg"
                          title="Edit"
                          onClick={() => navigate(`/products/${p.id}`)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          className="p-1.5 text-suzuki-navy hover:bg-rose-50 hover:text-suzuki-red rounded-lg disabled:opacity-50"
                          title="Delete"
                          disabled={deleteProduct.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete "${p.description}" (${p.partItemNo})? It will be removed from the catalog.`
                              )
                            ) {
                              deleteProduct.mutate(p.id)
                            }
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-4 sm:px-6 py-4 border-t border-[#E2E4EA] flex flex-col sm:flex-row gap-3 items-center justify-between text-xs text-[#64748B]">
          <span>{showingText}</span>
          <TablePagination
            page={rows?.pageNumber ?? 1}
            totalPages={Math.max(rows?.totalPages ?? 1, 1)}
            onChange={setPage}
          />
        </div>
      </div>

      {bulkOpen && (
        <BulkUploadModal
          onClose={() => setBulkOpen(false)}
          onImported={async () => {
            await queryClient.invalidateQueries({ queryKey: ['master-products'] })
          }}
        />
      )}
    </div>
  )
}

type BulkRowResult = {
  excelRowNumber: number
  partItemNo?: string | null
  status: string
  message?: string | null
  productId?: string | null
}

type BulkImportResult = {
  totalRows: number
  created: number
  updated: number
  failed: number
  rows: BulkRowResult[]
}

function BulkUploadModal({
  onClose,
  onImported
}: {
  onClose: () => void
  onImported: () => Promise<void>
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState<'lubricants' | 'parts'>('lubricants')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BulkImportResult | null>(null)

  const downloadSample = async () => {
    setError(null)
    try {
      const { data } = await api.get('/master-catalog/products/bulk-template', { responseType: 'blob' })
      const blob = new Blob([data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'PSMC_Lubricants_Chemicals_Bulk_Upload.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Could not download the sample Excel.')
    }
  }

  const upload = useMutation({
    mutationFn: async () => {
      if (kind !== 'lubricants') throw new Error('Parts bulk upload will use a different Excel format. Coming soon.')
      if (!file) throw new Error('Choose an .xlsx file.')
      if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('Only .xlsx files are accepted.')
      const form = new FormData()
      form.append('file', file)
      const { data } = await api.post<BulkImportResult>('/master-catalog/products/bulk-upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      return data
    },
    onSuccess: async (data) => {
      setResult(data)
      await onImported()
    },
    onError: (e: unknown) => {
      setResult(null)
      setError(
        (e as { response?: { data?: { title?: string; detail?: string } }; message?: string })?.response?.data?.detail
          ?? (e as { response?: { data?: { title?: string } } })?.response?.data?.title
          ?? (e as Error)?.message
          ?? 'Upload failed.'
      )
    }
  })

  const failedRows = result?.rows.filter((r) => r.status === 'Failed') ?? []

  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-card w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-extrabold text-suzuki-navy">Upload bulk products</h3>
        <p className="text-xs text-suzuki-mute mt-1 mb-5">
          Lubricants &amp; Chemicals use the 24-column client Excel. Existing part numbers are updated. Rows with missing required fields are skipped.
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>
        )}

        <div className="space-y-1.5">
          <div className="text-sm font-bold text-suzuki-navy">Product group</div>
          <div className="flex flex-wrap gap-3">
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-suzuki-navy">
              <input
                type="radio"
                name="bulk-kind"
                checked={kind === 'lubricants'}
                onChange={() => { setKind('lubricants'); setResult(null) }}
              />
              Lubricants &amp; Chemicals
            </label>
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-suzuki-mute">
              <input
                type="radio"
                name="bulk-kind"
                checked={kind === 'parts'}
                onChange={() => { setKind('parts'); setResult(null); setError(null) }}
              />
              Parts <span className="text-xs font-normal">(coming soon — different format)</span>
            </label>
          </div>
        </div>

        {kind === 'lubricants' && (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void downloadSample()}
                className="inline-flex items-center gap-2 rounded-lg bg-suzuki-ice text-suzuki-navy text-sm font-bold px-4 py-2"
              >
                <Download size={16} /> Download sample Excel
              </button>
            </div>

            <div className="mt-4 space-y-1.5">
              <div className="text-sm font-bold text-suzuki-navy">Excel file (.xlsx)</div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null)
                  setResult(null)
                  setError(null)
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full rounded-xl border border-dashed border-suzuki-line px-4 py-6 text-sm text-suzuki-navy hover:bg-suzuki-mist/50"
              >
                <Upload size={18} className="inline mr-2" />
                {file ? file.name : 'Choose .xlsx file'}
              </button>
            </div>
          </>
        )}

        {result && (
          <div className="mt-5 rounded-xl border border-suzuki-line p-4 text-sm">
            <div className="font-bold text-suzuki-navy mb-2">Import result</div>
            <p>
              {result.totalRows} rows · {result.created} created · {result.updated} updated · {result.failed} failed
            </p>
            {failedRows.length > 0 && (
              <div className="mt-3 max-h-48 overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-suzuki-mute">
                      <th className="py-1 pr-2">Row</th>
                      <th className="py-1 pr-2">Part no.</th>
                      <th className="py-1">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failedRows.map((r) => (
                      <tr key={r.excelRowNumber} className="border-t border-suzuki-line/70">
                        <td className="py-1 pr-2">{r.excelRowNumber}</td>
                        <td className="py-1 pr-2 font-mono">{r.partItemNo || '—'}</td>
                        <td className="py-1 text-rose-700">{r.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl bg-sky-100 text-suzuki-navy font-bold px-6 py-2.5">
            CLOSE
          </button>
          {kind === 'lubricants' && (
            <button
              type="button"
              disabled={upload.isPending || !file}
              onClick={() => { setError(null); upload.mutate() }}
              className="rounded-xl bg-suzuki-red text-white font-bold px-6 py-2.5 disabled:opacity-50"
            >
              {upload.isPending ? 'UPLOADING…' : 'UPLOAD'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
