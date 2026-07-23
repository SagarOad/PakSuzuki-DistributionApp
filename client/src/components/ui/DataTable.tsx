import { Children } from 'react'
import {
  FileSpreadsheet, Search, Upload, ChevronLeft, ChevronRight,
  ChevronDown, Calendar
} from 'lucide-react'
import clsx from 'clsx'

export type DataTableColumn = {
  key: string
  header: React.ReactNode
  align?: 'left' | 'right'
  /** Extra width hint for longer columns (name / location / address). */
  wide?: boolean
  className?: string
}

export type DataTablePagination = {
  page: number
  totalPages: number
  onChange: (page: number) => void
  showingText?: string
  variant?: 'full' | 'simple'
}

function TitleNode({ title }: { title: React.ReactNode }) {
  if (typeof title === 'string') {
    return <h3 className="text-lg sm:text-[22px] font-bold text-[#0B2E59] tracking-tight">{title}</h3>
  }
  return <>{title}</>
}

export function DataTable({
  title,
  search,
  onSearchChange,
  searchPlaceholder = 'Search',
  headerActions,
  toolbarActions,
  filterBar,
  columns,
  children,
  loading,
  empty = 'No results found.',
  error,
  pagination,
  className,
  embedded
}: {
  title?: React.ReactNode
  search?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  /** Slot beside the title (e.g. Import Products). */
  headerActions?: React.ReactNode
  /** Right side of the filter row (Export Excel) or catalog add button. */
  toolbarActions?: React.ReactNode
  /** Filter controls row (dropdown + date range). Enables list-card layout. */
  filterBar?: React.ReactNode
  columns: DataTableColumn[]
  children?: React.ReactNode
  loading?: boolean
  empty?: string
  error?: React.ReactNode
  pagination?: DataTablePagination
  className?: string
  embedded?: boolean
}) {
  const colCount = columns.length
  const hasRows = Children.toArray(children).length > 0
  const isCatalog = headerActions != null
  const isListCard = !isCatalog && (title != null || onSearchChange != null || filterBar != null)

  const searchField = (
    <div className="flex items-center gap-2 w-full sm:w-[220px] rounded-[10px] border border-[#E2E4EA] bg-white px-3 py-2.5">
      <Search size={14} className="text-[#94A3B8] shrink-0" />
      <input
        value={search ?? ''}
        onChange={(e) => onSearchChange?.(e.target.value)}
        placeholder={searchPlaceholder}
        className="bg-transparent text-sm outline-none w-full text-[#0B2E59] placeholder:text-[#94A3B8] min-w-0"
      />
    </div>
  )

  const body = (
    <>
      {/* Catalog (shop products): title + Import, then search + Add */}
      {isCatalog && (
        <div className="px-4 sm:px-6 flex flex-col gap-3 pt-4 sm:pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            {title != null ? <TitleNode title={title} /> : <span />}
            {headerActions}
          </div>
          {(onSearchChange != null || toolbarActions != null) && (
            <div className="pb-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between border-b border-[#E2E4EA]">
              {onSearchChange != null ? (
                <div className="flex items-center gap-2 w-full sm:flex-1 sm:max-w-md rounded-[10px] border border-[#E2E4EA] bg-white px-3 py-2.5">
                  <Search size={14} className="text-[#94A3B8] shrink-0" />
                  <input
                    value={search ?? ''}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="bg-transparent text-sm outline-none w-full text-[#0B2E59] placeholder:text-[#94A3B8]"
                  />
                </div>
              ) : (
                <span />
              )}
              {toolbarActions}
            </div>
          )}
        </div>
      )}

      {/* List card: title | search → divider → filters | export → divider → table */}
      {isListCard && (
        <div className="px-4 sm:px-6 pt-4 sm:pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between pb-4 sm:pb-5 border-b border-[#E2E4EA]">
            {title != null ? <TitleNode title={title} /> : <span />}
            {onSearchChange != null ? searchField : null}
          </div>

          {(filterBar != null || toolbarActions != null) && (
            <div className="flex flex-col xl:flex-row xl:items-center gap-3 sm:gap-4 py-4 sm:py-5 border-b border-[#E2E4EA]">
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 flex-1 min-w-0">
                {filterBar}
              </div>
              {toolbarActions ? (
                <div className="shrink-0 w-full sm:w-auto xl:ml-auto">{toolbarActions}</div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {error ? (
        <div className="mx-6 mt-4 rounded-lg border border-suzuki-red/30 bg-red-50 px-3 py-2 text-sm text-suzuki-red">
          {error}
        </div>
      ) : null}

      <div className={clsx('overflow-x-auto', isListCard && 'px-2 pt-5')}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-[#E2E4EA]">
              {columns.map((col, i) => (
                <th
                  key={col.key}
                  className={clsx(
                    'pb-3 pt-1 text-[14px] font-bold text-[#0B2E59] tracking-wide whitespace-nowrap',
                    i === 0 ? 'pl-4 pr-3' : i === colCount - 1 ? 'pl-3 pr-4' : 'px-3',
                    col.align === 'right' && 'text-right',
                    col.wide && 'min-w-[140px]',
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={colCount} className="px-4 py-10 text-center text-[#94A3B8]">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && !hasRows && (
              <tr>
                <td colSpan={colCount} className="px-4 py-10 text-center text-[#94A3B8]">
                  {empty}
                </td>
              </tr>
            )}
            {!loading && children}
          </tbody>
        </table>
      </div>

      {pagination && (
        <div className="px-4 sm:px-6 py-4 border-t border-[#E2E4EA] flex flex-col sm:flex-row gap-3 items-center justify-between text-xs text-[#64748B]">
          <span>{pagination.showingText ?? ''}</span>
          <TablePagination
            page={pagination.page}
            totalPages={Math.max(pagination.totalPages, 1)}
            onChange={pagination.onChange}
            variant={pagination.variant ?? 'full'}
          />
        </div>
      )}
    </>
  )

  if (embedded) {
    return <div className={className}>{body}</div>
  }

  return (
    <div
      className={clsx(
        'bg-white rounded-2xl shadow-card overflow-hidden',
        className
      )}
    >
      {body}
    </div>
  )
}

export const OrderTable = DataTable

export function ListTabPill({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'rounded-[10px] px-4 sm:px-6 py-2.5 text-sm sm:text-[15px] font-bold transition-colors',
        active
          ? 'bg-[#D91B5C] text-white'
          : 'bg-white text-[#0B2E59] border border-[#E2E4EA] hover:bg-[#F5F7FB]'
      )}
    >
      {children}
    </button>
  )
}

export function FilterSelect({
  value,
  onChange,
  options
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-[10px] border border-[#E2E4EA] bg-[#F5F7FB] text-[#0B2E59] text-sm font-medium pl-3 pr-9 py-2.5 outline-none cursor-pointer w-full sm:w-auto sm:min-w-[140px]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B]"
      />
    </div>
  )
}

export function DateFilterField({
  value,
  onChange,
  placeholder = 'Select Date'
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <label className="relative inline-flex items-center gap-2 rounded-[10px] border border-[#E2E4EA] bg-[#F5F7FB] px-3 py-2.5 w-full sm:w-auto sm:min-w-[168px] cursor-pointer">
      <Calendar size={15} strokeWidth={2} className="text-[#005BAC] shrink-0" />
      <span className="relative flex-1 min-w-0">
        {!value && (
          <span className="pointer-events-none absolute inset-0 flex items-center text-sm text-[#94A3B8]">
            {placeholder}
          </span>
        )}
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={clsx(
            'bg-transparent text-sm outline-none w-full min-w-0',
            '[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0',
            value ? 'text-[#0B2E59] font-medium' : 'text-transparent'
          )}
          aria-label={placeholder}
        />
      </span>
      <ChevronDown size={14} className="text-[#64748B] shrink-0" />
    </label>
  )
}

export function TablePagination({
  page,
  totalPages,
  onChange,
  variant = 'full'
}: {
  page: number
  totalPages: number
  onChange: (page: number) => void
  variant?: 'full' | 'simple'
}) {
  const pages =
    variant === 'simple'
      ? [page]
      : Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1)

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="px-2 py-1 rounded-lg border border-[#E2E4EA] disabled:opacity-40"
        aria-label="Previous page"
      >
        <ChevronLeft size={14} />
      </button>
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={clsx(
            'h-7 min-w-7 px-2 rounded-lg text-xs font-bold',
            p === page ? 'bg-[#0B2E59] text-white' : 'border border-[#E2E4EA] hover:bg-[#F5F7FB]'
          )}
        >
          {p}
        </button>
      ))}
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className="px-2 py-1 rounded-lg border border-[#E2E4EA] disabled:opacity-40"
        aria-label="Next page"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  )
}

export function ExportExcelButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center gap-1.5 rounded-[10px] border-[1.5px] border-[#005BAC] bg-white text-[#005BAC] px-4 py-2.5 text-sm font-bold hover:bg-[#F0F7FC] w-full sm:w-auto"
    >
      <FileSpreadsheet size={15} className="fill-[#005BAC] text-[#005BAC]" />
      Export Excel
    </button>
  )
}

export function ImportFileButton({
  label = 'Import',
  accept = 'application/json,.json',
  title,
  onFile,
  disabled
}: {
  label?: string
  accept?: string
  title?: string
  onFile: (file: File | null) => void | Promise<void>
  disabled?: boolean
}) {
  if (disabled) return null

  return (
    <label
      className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#D91B5C]/50 text-[#D91B5C] px-3 py-2 text-xs font-semibold hover:bg-red-50 cursor-pointer"
      title={title}
    >
      <Upload size={14} />
      {label}
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null
          void onFile(file)
          e.target.value = ''
        }}
      />
    </label>
  )
}

export function PrimaryAddButton({
  label,
  onClick
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center rounded-[10px] bg-[#005BAC] text-white px-4 py-2 text-sm font-semibold hover:bg-[#0B2E59]"
    >
      {label}
    </button>
  )
}
