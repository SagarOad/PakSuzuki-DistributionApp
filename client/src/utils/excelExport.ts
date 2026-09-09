import { api } from '@/api/axiosClient'

export type ExcelColumn<T> = {
  header: string
  value: (row: T) => string | number | boolean | null | undefined
}

type PagedResult<T> = {
  items: T[]
  pageNumber?: number
  totalPages: number
  totalCount?: number
}

/** True when `iso` falls inside optional From/To date filters (inclusive, local day bounds). */
export function inDateRange(iso: string | null | undefined, fromDate?: string, toDate?: string): boolean {
  if (!iso) return !fromDate && !toDate
  const value = new Date(iso)
  if (Number.isNaN(value.getTime())) return false
  if (fromDate) {
    const from = new Date(`${fromDate}T00:00:00`)
    if (value < from) return false
  }
  if (toDate) {
    const to = new Date(`${toDate}T23:59:59.999`)
    if (value > to) return false
  }
  return true
}

function cellText(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function escapeCsv(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/**
 * Downloads a UTF-8 CSV file that Excel opens cleanly.
 * Uses CSV (not SpreadsheetML) because blob downloads stay reliable after async fetches.
 */
export function downloadExcel<T>(
  fileName: string,
  columns: ExcelColumn<T>[],
  rows: T[]
): void {
  const safeName = fileName.replace(/[\\/:*?"<>|]+/g, '-').replace(/\.(xlsx?|csv)$/i, '')
  const header = columns.map((c) => escapeCsv(c.header)).join(',')
  const lines = rows.map((row) =>
    columns.map((c) => escapeCsv(cellText(c.value(row)))).join(',')
  )
  // BOM so Excel treats the file as UTF-8 (Urdu / special characters stay correct).
  const csv = `\uFEFF${[header, ...lines].join('\r\n')}`

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${safeName}.csv`
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  // Delay revoke so Safari / Edge finish the download first.
  window.setTimeout(() => {
    link.remove()
    URL.revokeObjectURL(url)
  }, 1500)
}

/**
 * Walks every page of a paged API until all matching rows are collected.
 * Caps at 100 pages as a safety net.
 */
export async function fetchAllPages<T>(
  loadPage: (pageNumber: number, pageSize: number) => Promise<PagedResult<T>>,
  pageSize = 200
): Promise<T[]> {
  const all: T[] = []
  let page = 1
  let totalPages = 1

  do {
    const result = await loadPage(page, pageSize)
    all.push(...(result.items ?? []))
    totalPages = Math.max(result.totalPages || 1, 1)
    page += 1
  } while (page <= totalPages && page <= 100)

  return all
}

/** Convenience wrapper: GET a paged endpoint and collect every page. */
export async function fetchAllFromApi<T>(
  path: string,
  params: Record<string, unknown> = {},
  pageSize = 200
): Promise<T[]> {
  return fetchAllPages(async (pageNumber, size) => {
    const { data } = await api.get<PagedResult<T>>(path, {
      params: { ...params, pageNumber, pageSize: size }
    })
    return data
  }, pageSize)
}

/** Shared failure message so a silent network error doesn't look like a dead button. */
export function exportFailed(err: unknown): void {
  console.error('Export Excel failed', err)
  const message =
    (err as { response?: { data?: { title?: string } }; message?: string })?.response?.data?.title
    || (err as { message?: string })?.message
    || 'Export failed. Please try again.'
  window.alert(message)
}
