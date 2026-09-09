import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/axiosClient'

interface PickupRow {
  orderNumber: string
  distributorCode?: string | null
  retailerCode?: string | null
  shipToCode?: string | null
  billToCode?: string | null
  materialCode: string
  approvedQuantity: number
  uom: string
  approvalDetails?: string | null
  middlewareStatus?: string | null
  sapStatus?: string | null
  errorDetails?: string | null
  poRef: string
}

export default function MiddlewarePickupPage() {
  const query = useQuery({
    queryKey: ['middleware-pickup'],
    queryFn: async () => (await api.get<PickupRow[]>('/orders/middleware-pickup')).data
  })

  const rows = query.data ?? []

  return (
    <div className="space-y-4 pb-8">
      <div>
        <h1 className="text-2xl font-extrabold text-suzuki-navy">Pending Middleware Pickup</h1>
        <p className="text-sm text-suzuki-mute mt-1">
          Orders approved by Pak Suzuki, waiting for SAP. Retailer code appears only when a threshold
          order was passed on.
        </p>
      </div>

      {query.isLoading ? (
        <p className="text-sm text-suzuki-mute">Loading queue…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-suzuki-mute">No rows waiting for middleware pickup.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-suzuki-line bg-white shadow-card">
          <table className="min-w-[1100px] w-full text-left text-xs">
            <thead className="bg-suzuki-mist text-suzuki-mute uppercase tracking-wide">
              <tr>
                {[
                  'Order number',
                  'Distributor code',
                  'Retailer code',
                  'Ship-to',
                  'Bill-to',
                  'Material',
                  'Approved qty',
                  'UOM',
                  'Approval',
                  'Middleware',
                  'SAP status',
                  'Error'
                ].map((h) => (
                  <th key={h} className="px-3 py-2.5 font-bold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.poRef}-${r.materialCode}-${i}`} className="border-t border-suzuki-line align-top">
                  <td className="px-3 py-2 font-bold text-suzuki-navy">{r.orderNumber}</td>
                  <td className="px-3 py-2">{r.distributorCode || '—'}</td>
                  <td className="px-3 py-2">{r.retailerCode || '—'}</td>
                  <td className="px-3 py-2">{r.shipToCode || '—'}</td>
                  <td className="px-3 py-2">{r.billToCode || '—'}</td>
                  <td className="px-3 py-2 font-mono">{r.materialCode}</td>
                  <td className="px-3 py-2">{r.approvedQuantity}</td>
                  <td className="px-3 py-2">{r.uom}</td>
                  <td className="px-3 py-2 max-w-[14rem]">{r.approvalDetails || '—'}</td>
                  <td className="px-3 py-2">{r.middlewareStatus || '—'}</td>
                  <td className="px-3 py-2">{r.sapStatus || '—'}</td>
                  <td className="px-3 py-2 text-suzuki-red max-w-[14rem]">{r.errorDetails || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
