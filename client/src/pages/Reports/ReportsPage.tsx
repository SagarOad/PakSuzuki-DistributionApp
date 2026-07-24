import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { api } from '@/api/axiosClient'
import { OrderTable, ExportExcelButton, DateFilterField, FilterSelect } from '@/components/ui/DataTable'

interface ReportRow {
  id: string
  title: string
  date: string
  lastUpdate: string
  endpoint?: string
}

const CATALOG: ReportRow[] = [
  { id: 'distributor-sales', title: 'Distributor Sales Report', date: '10-09-2025', lastUpdate: '10-09-2025', endpoint: '/orders' },
  { id: 'retailer-orders', title: 'Retailer Orders Report', date: '10-09-2025', lastUpdate: '10-09-2025', endpoint: '/orders' },
  { id: 'product-sales', title: 'Product-Wise Sales Report', date: '10-09-2025', lastUpdate: '10-09-2025', endpoint: '/products' },
  { id: 'target-achievement', title: 'Target Vs Achievement Report', date: '10-09-2025', lastUpdate: '10-09-2025', endpoint: '/incentives' },
  { id: 'claims', title: 'Claims Summary Report', date: '10-09-2025', lastUpdate: '10-09-2025', endpoint: '/claims' }
]

export default function ReportsPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const filtered = useMemo(() => {
    let rows = CATALOG
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter((r) => r.title.toLowerCase().includes(q))
    }
    return rows
  }, [search])

  const pageSize = 10
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize)

  const downloadCsv = async (row: ReportRow) => {
    try {
      if (row.endpoint) {
        const { data } = await api.get(row.endpoint, { params: { pageSize: 100, from: fromDate || undefined, to: toDate || undefined } })
        const items = data.items ?? data ?? []
        const keys = items[0] ? Object.keys(items[0]) : ['message']
        const lines = [
          keys.join(','),
          ...items.map((it: Record<string, unknown>) =>
            keys.map((k) => JSON.stringify(it[k] ?? '')).join(',')
          )
        ]
        if (items.length === 0) lines.push('"No rows for this report"')
        triggerDownload(lines.join('\n'), `${row.id}.csv`)
      }
    } catch {
      triggerDownload(`title,note\n"${row.title}","Export failed — try again later"\n`, `${row.id}.csv`)
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
          <div className="flex flex-wrap gap-2">
            <ExportExcelButton onClick={() => pageItems[0] && void downloadCsv(pageItems[0])} />
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1.5 rounded-[10px] border-[1.5px] border-[#005BAC] bg-white text-[#005BAC] px-4 py-2.5 text-sm font-bold hover:bg-[#F0F7FC]"
              onClick={() => pageItems[0] && void downloadCsv(pageItems[0])}
            >
              <Download size={15} /> Export PDF
            </button>
          </div>
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
                onClick={() => void downloadCsv(r)}
                className="p-1.5 rounded-lg text-suzuki-blue hover:bg-suzuki-ice"
                title="Download"
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

function triggerDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
