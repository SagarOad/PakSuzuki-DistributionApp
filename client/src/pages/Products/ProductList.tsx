import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/axiosClient'

interface ProductRow {
  id: string
  sku: string
  name: string
  category: string
  categoryName?: string | null
  baseUnit: string
  costPrice?: number
  sellingPrice?: number
  retailPrice: number
  marginFixed?: number
  marginPercent?: number
}

interface PagedResult { items: ProductRow[]; totalCount: number }

// Field visibility (cost/selling/margin vs retail-only) is entirely server-driven
// per the viewer's role (3.2) - this component just renders whatever the API returns,
// no client-side role branching needed for pricing columns.
export default function ProductList() {
  const { data, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => (await api.get<PagedResult>('/products')).data
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-navy-950">Products</h1>
        <button className="rounded-lg bg-accent hover:bg-accent-dark text-white text-sm font-medium px-4 py-2">
          + New Product
        </button>
      </div>

      <div className="bg-white rounded-xl border border-navy-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-navy-100 text-navy-700 text-left">
            <tr>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3 text-right">Retail Price</th>
              <th className="px-4 py-3 text-right">Selling Price</th>
              <th className="px-4 py-3 text-right">Margin</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-navy-500">Loading…</td></tr>
            )}
            {!isLoading && data?.items.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-navy-500">No products yet.</td></tr>
            )}
            {data?.items.map((p) => (
              <tr key={p.id} className="border-t border-navy-100">
                <td className="px-4 py-3 font-mono text-xs">{p.sku}</td>
                <td className="px-4 py-3">{p.name}</td>
                <td className="px-4 py-3">{p.categoryName || p.category}</td>
                <td className="px-4 py-3">{p.baseUnit}</td>
                <td className="px-4 py-3 text-right">Rs {p.retailPrice.toLocaleString()}</td>
                <td className="px-4 py-3 text-right">{p.sellingPrice != null ? `Rs ${p.sellingPrice.toLocaleString()}` : '—'}</td>
                <td className="px-4 py-3 text-right">{p.marginPercent != null ? `${p.marginPercent}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
