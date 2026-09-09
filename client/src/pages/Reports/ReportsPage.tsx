import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { api } from '@/api/axiosClient'
import { OrderTable, ExportExcelButton, DateFilterField, FilterSelect } from '@/components/ui/DataTable'
import { downloadExcel, fetchAllFromApi, inDateRange } from '@/utils/excelExport'

interface ReportRow {
  id: string
  title: string
  date: string
  lastUpdate: string
  endpoint?: string
  kind: 'orders' | 'products' | 'incentives' | 'claims'
}

const CATALOG: ReportRow[] = [
  { id: 'distributor-sales', title: 'Distributor Sales Report', date: '10-09-2025', lastUpdate: '10-09-2025', endpoint: '/orders', kind: 'orders' },
  { id: 'retailer-orders', title: 'Retailer Orders Report', date: '10-09-2025', lastUpdate: '10-09-2025', endpoint: '/orders', kind: 'orders' },
  { id: 'product-sales', title: 'Product-Wise Sales Report', date: '10-09-2025', lastUpdate: '10-09-2025', endpoint: '/products', kind: 'products' },
  { id: 'target-achievement', title: 'Target Vs Achievement Report', date: '10-09-2025', lastUpdate: '10-09-2025', endpoint: '/incentives', kind: 'incentives' },
  { id: 'claims', title: 'Claims Summary Report', date: '10-09-2025', lastUpdate: '10-09-2025', endpoint: '/claims', kind: 'claims' }
]

export default function ReportsPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [exportingId, setExportingId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let rows = CATALOG
    if (filter === 'sales') rows = rows.filter((r) => r.kind === 'orders' || r.kind === 'products')
    if (filter === 'orders') rows = rows.filter((r) => r.kind === 'orders')
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter((r) => r.title.toLowerCase().includes(q))
    }
    return rows
  }, [search, filter])

  const pageSize = 10
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize)

  const downloadReport = async (row: ReportRow) => {
    if (!row.endpoint) return
    setExportingId(row.id)
    try {
      if (row.kind === 'orders') {
        const items = await fetchAllFromApi<Record<string, unknown>>(row.endpoint, {})
        const dated = items.filter((it) =>
          inDateRange(String(it.createdAtUtc ?? ''), fromDate, toDate)
        )
        downloadExcel(
          row.id,
          [
            { header: 'Order Date', value: (o) => String(o.createdAtUtc ?? '').slice(0, 10) },
            { header: 'Order Number', value: (o) => String(o.orderNumber ?? '') },
            { header: 'Retailer', value: (o) => String(o.retailerName ?? '') },
            { header: 'Distributor', value: (o) => String(o.distributorName ?? '') },
            { header: 'Status', value: (o) => String(o.status ?? '') },
            { header: 'Total (PKR)', value: (o) => Number(o.grandTotal ?? 0) }
          ],
          dated
        )
        return
      }

      if (row.kind === 'claims') {
        const items = await fetchAllFromApi<Record<string, unknown>>(row.endpoint, {
          from: fromDate || undefined,
          to: toDate || undefined
        })
        downloadExcel(
          row.id,
          [
            { header: 'Claims Date', value: (c) => String(c.createdAtUtc ?? '').slice(0, 10) },
            { header: 'Order Number', value: (c) => String(c.orderNumber ?? '') },
            { header: 'Distributor', value: (c) => String(c.distributorName ?? '') },
            { header: 'Status', value: (c) => String(c.status ?? '') }
          ],
          items
        )
        return
      }

      const { data } = await api.get(row.endpoint, {
        params: { pageSize: 500, pageNumber: 1, from: fromDate || undefined, to: toDate || undefined }
      })
      const items: Record<string, unknown>[] = data.items ?? data ?? []
      if (items.length === 0) {
        downloadExcel(row.id, [{ header: 'Message', value: () => 'No rows for this report' }], [{}])
        return
      }
      const keys = Object.keys(items[0])
      downloadExcel(
        row.id,
        keys.map((k) => ({ header: k, value: (r: Record<string, unknown>) => r[k] as string | number })),
        items
      )
    } catch {
      downloadExcel(row.id, [
        { header: 'Title', value: () => row.title },
        { header: 'Note', value: () => 'Export failed — try again later' }
      ], [{}])
    } finally {
      setExportingId(null)
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-suzuki-navy">Reports</h1>

      <OrderTable
        title="Report Lists"
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        filterBar={
          <>
            <FilterSelect
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'sales', label: 'Sales' },
                { value: 'orders', label: 'Orders' }
              ]}
            />
            <span className="text-sm font-semibold text-[#0B2E59]">From</span>
            <DateFilterField value={fromDate} onChange={setFromDate} />
            <span className="text-sm font-semibold text-[#0B2E59]">To</span>
            <DateFilterField value={toDate} onChange={setToDate} />
          </>
        }
        toolbarActions={
          <ExportExcelButton
            loading={exportingId === pageItems[0]?.id}
            onClick={() => pageItems[0] && void downloadReport(pageItems[0])}
          />
        }
        columns={[
          { key: 'title', header: 'Title', wide: true },
          { key: 'date', header: 'Date' },
          { key: 'updated', header: 'Last Update' },
          { key: 'action', header: 'Action', align: 'right' }
        ]}
        empty="No reports found."
        pagination={{
          page,
          totalPages,
          onChange: setPage,
          variant: 'full',
          showingText: `Showing ${pageItems.length === 0 ? '00' : '01'} to ${String(pageItems.length).padStart(2, '0')} of ${filtered.length} entries`
        }}
      >
        {pageItems.map((r) => (
          <tr key={r.id} className="border-b border-[#E2E4EA]/80 hover:bg-[#F5F7FB]/60">
            <td className="pl-4 pr-3 py-3.5 font-semibold text-[#0B2E59]">{r.title}</td>
            <td className="px-3 py-3.5 text-[#64748B]">{r.date}</td>
            <td className="px-3 py-3.5 text-[#64748B]">{r.lastUpdate}</td>
            <td className="pl-3 pr-4 py-3.5 text-right">
              <button
                type="button"
                disabled={exportingId === r.id}
                onClick={() => void downloadReport(r)}
                className="p-1.5 rounded-lg text-suzuki-blue hover:bg-suzuki-ice disabled:opacity-50"
                title="Download Excel"
              >
                <Download size={16} />
              </button>
            </td>
          </tr>
        ))}
      </OrderTable>
    </div>
  )
}
