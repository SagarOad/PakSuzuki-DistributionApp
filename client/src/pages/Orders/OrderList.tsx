import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/axiosClient'
import clsx from 'clsx'

interface OrderRow {
  id: string
  orderNumber: string
  source: string
  retailerName?: string
  distributorName: string
  status: string
  grandTotal: number
  createdAtUtc: string
}
interface PagedResult { items: OrderRow[]; totalCount: number }

const statusColor: Record<string, string> = {
  PendingDistributorApproval: 'bg-amber-100 text-amber-800',
  ApprovedByDistributor: 'bg-emerald-100 text-emerald-800',
  RejectedByDistributor: 'bg-red-100 text-red-800',
  InvoiceConfirmed: 'bg-navy-100 text-navy-800'
}

export default function OrderList() {
  const { data, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => (await api.get<PagedResult>('/orders')).data
  })

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy-950 mb-6">Orders</h1>

      <div className="bg-white rounded-xl border border-navy-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-navy-100 text-navy-700 text-left">
            <tr>
              <th className="px-4 py-3">Order #</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Retailer</th>
              <th className="px-4 py-3">Distributor</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-navy-500">Loading…</td></tr>
            )}
            {!isLoading && data?.items.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-navy-500">No orders yet.</td></tr>
            )}
            {data?.items.map((o) => (
              <tr key={o.id} className="border-t border-navy-100">
                <td className="px-4 py-3 font-mono text-xs">{o.orderNumber}</td>
                <td className="px-4 py-3">{o.source}</td>
                <td className="px-4 py-3">{o.retailerName ?? '—'}</td>
                <td className="px-4 py-3">{o.distributorName}</td>
                <td className="px-4 py-3">
                  <span className={clsx('px-2 py-1 rounded-full text-xs font-medium', statusColor[o.status] ?? 'bg-navy-100 text-navy-800')}>
                    {o.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">Rs {o.grandTotal.toLocaleString()}</td>
                <td className="px-4 py-3">{new Date(o.createdAtUtc).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
