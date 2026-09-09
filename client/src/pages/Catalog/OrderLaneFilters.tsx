import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/axiosClient'
import { useCart, type OrderContext } from '@/context/CartContext'
import type { CatalogLookups } from '@/pages/Products/productWizardTypes'

interface Props {
  /** When true, applying filters does not navigate away — products update on this page. */
  compact?: boolean
  onApplied?: (ctx: OrderContext) => void
}

/**
 * Inline source / delivery / supplier picker.
 * When all three are chosen, the active order lane updates and the catalog refreshes in place.
 */
export function OrderLaneFilters({ compact, onApplied }: Props) {
  const { items, orderContext, setOrderContext, clearOrderContext, itemCount } = useCart()

  const [sourceCode, setSourceCode] = useState(orderContext?.materialSourceCode ?? '')
  const [deliveryTypeCode, setDeliveryTypeCode] = useState(orderContext?.deliveryTypeCode ?? '')
  const [supplierCode, setSupplierCode] = useState(orderContext?.supplierCode ?? '')

  useEffect(() => {
    setSourceCode(orderContext?.materialSourceCode ?? '')
    setDeliveryTypeCode(orderContext?.deliveryTypeCode ?? '')
    setSupplierCode(orderContext?.supplierCode ?? '')
  }, [
    orderContext?.materialSourceCode,
    orderContext?.deliveryTypeCode,
    orderContext?.supplierCode
  ])

  const lookups = useQuery({
    queryKey: ['master-catalog-lookups'],
    queryFn: async () => (await api.get<CatalogLookups>('/master-catalog/lookups')).data
  })

  const deliveryOptions = useMemo(() => {
    const rows = (lookups.data?.categories ?? []).flatMap((c) =>
      c.pTypes.map((p) => ({
        code: p.code,
        name: p.deliveryType,
        sgoFlag: p.sgoFlag,
        sourceScope: p.sourceScope,
        categoryName: c.name,
        id: p.id,
        categoryId: c.id
      }))
    )
    const filtered = sourceCode
      ? rows.filter((d) => !d.sourceScope?.length || d.sourceScope.includes(sourceCode))
      : rows
    return filtered.sort((a, b) => a.code.localeCompare(b.code))
  }, [lookups.data, sourceCode])

  const selectedDelivery = deliveryOptions.find((d) => d.code === deliveryTypeCode)

  // If current delivery is invalid for the new source, clear it.
  useEffect(() => {
    if (!deliveryTypeCode) return
    if (deliveryOptions.some((d) => d.code === deliveryTypeCode)) return
    setDeliveryTypeCode('')
    setSupplierCode('')
  }, [deliveryOptions, deliveryTypeCode])

  const defaults = useQuery({
    queryKey: ['wizard-defaults-order', deliveryTypeCode, sourceCode],
    enabled: !!deliveryTypeCode && !!sourceCode && !!selectedDelivery,
    queryFn: async () =>
      (
        await api.get<{ supplierCode?: string | null }>('/master-catalog/wizard-defaults', {
          params: {
            categoryId: selectedDelivery!.categoryId,
            pTypeId: selectedDelivery!.id,
            sourceCode
          }
        })
      ).data
  })

  const suggestedSupplier = defaults.data?.supplierCode ?? ''
  const effectiveSupplier = supplierCode || suggestedSupplier
  const supplierOptions = lookups.data?.suppliers ?? []

  const previewFilters =
    sourceCode && deliveryTypeCode && effectiveSupplier
      ? {
          materialSourceCode: sourceCode,
          deliveryTypeCode,
          supplierCode: effectiveSupplier
        }
      : null

  const previewQuery = useQuery({
    queryKey: ['catalog-products-preview', previewFilters],
    enabled: !!previewFilters,
    queryFn: async () =>
      (
        await api.get<{ totalCount: number }>('/catalog/products', {
          params: { pageSize: 1, ...previewFilters }
        })
      ).data
  })

  const applyLane = (nextSource: string, nextDelivery: string, nextSupplier: string) => {
    if (!nextSource || !nextDelivery || !nextSupplier) return
    const delivery = deliveryOptions.find((d) => d.code === nextDelivery)
    if (!delivery) return

    const next: OrderContext = {
      vendorCode: 'PSMC',
      vendorName: 'Pak Suzuki Motor Company',
      materialSourceCode: nextSource,
      deliveryTypeCode: nextDelivery,
      deliveryTypeName: delivery.name,
      supplierCode: nextSupplier,
      supplierName: supplierOptions.find((s) => s.code === nextSupplier)?.name ?? nextSupplier
    }

    const same =
      orderContext &&
      orderContext.materialSourceCode === next.materialSourceCode &&
      orderContext.deliveryTypeCode === next.deliveryTypeCode &&
      orderContext.supplierCode === next.supplierCode

    if (same) {
      onApplied?.(next)
      return
    }

    if (items.length > 0) {
      const ok = window.confirm(
        'Changing source, delivery type, or supplier clears the current cart (one lane per order). Continue?'
      )
      if (!ok) {
        setSourceCode(orderContext?.materialSourceCode ?? '')
        setDeliveryTypeCode(orderContext?.deliveryTypeCode ?? '')
        setSupplierCode(orderContext?.supplierCode ?? '')
        return
      }
    }

    setOrderContext(next, { clearCart: true })
    onApplied?.(next)
  }

  const fieldClass =
    'w-full rounded-lg border border-suzuki-line bg-white px-3 py-2 text-sm text-suzuki-navy outline-none focus:ring-2 focus:ring-suzuki-red/20'

  return (
    <div
      className={
        compact
          ? 'rounded-xl border border-suzuki-line bg-white p-3 sm:p-4 space-y-3 shadow-card'
          : 'rounded-2xl border border-suzuki-line bg-white p-5 space-y-4 shadow-card'
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-extrabold text-suzuki-navy">Order lane</p>
          <p className="text-xs text-suzuki-mute mt-0.5">
            Pick source, delivery type, and supplier — matching products load below.
          </p>
        </div>
        {orderContext && (
          <button
            type="button"
            onClick={() => {
              if (itemCount > 0 && !window.confirm('Clear this order lane and cart?')) return
              clearOrderContext()
              setSourceCode('')
              setDeliveryTypeCode('')
              setSupplierCode('')
            }}
            className="text-xs font-bold text-suzuki-mute hover:text-suzuki-red"
          >
            Clear lane
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wide text-suzuki-mute">Source</span>
          <select
            className={`${fieldClass} mt-1`}
            value={sourceCode}
            onChange={(e) => {
              const v = e.target.value
              setSourceCode(v)
              setDeliveryTypeCode('')
              setSupplierCode('')
            }}
          >
            <option value="">Select source</option>
            {(lookups.data?.sources ?? []).map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wide text-suzuki-mute">Delivery type</span>
          <select
            className={`${fieldClass} mt-1`}
            value={deliveryTypeCode}
            disabled={!sourceCode}
            onChange={(e) => {
              const v = e.target.value
              setDeliveryTypeCode(v)
              setSupplierCode('')
            }}
          >
            <option value="">{sourceCode ? 'Select delivery type' : 'Select source first'}</option>
            {deliveryOptions.map((d) => (
              <option key={d.code} value={d.code}>
                {d.code} — {d.name}
                {d.sgoFlag ? ' (SGO)' : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wide text-suzuki-mute">Supplier</span>
          <select
            className={`${fieldClass} mt-1`}
            value={effectiveSupplier}
            disabled={!deliveryTypeCode}
            onChange={(e) => {
              const v = e.target.value
              setSupplierCode(v)
              if (sourceCode && deliveryTypeCode && v) applyLane(sourceCode, deliveryTypeCode, v)
            }}
          >
            <option value="">{deliveryTypeCode ? 'Select supplier' : 'Select delivery type first'}</option>
            {supplierOptions.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code} — {s.name}
                {suggestedSupplier === s.code ? ' (suggested)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {previewFilters && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-suzuki-mist/70 px-3 py-2">
          <p className="text-xs text-suzuki-navy">
            {previewQuery.isLoading
              ? 'Checking matching products…'
              : previewQuery.data
                ? `${previewQuery.data.totalCount} product${previewQuery.data.totalCount === 1 ? '' : 's'} match this lane`
                : 'Could not load product count'}
          </p>
          {sourceCode && deliveryTypeCode && effectiveSupplier && (
            <button
              type="button"
              onClick={() => applyLane(sourceCode, deliveryTypeCode, effectiveSupplier)}
              className="rounded-lg bg-suzuki-red text-white text-xs font-bold px-3 py-1.5"
            >
              {orderContext ? 'Apply / refresh lane' : 'Show products'}
            </button>
          )}
        </div>
      )}

      {previewFilters && !previewQuery.isLoading && previewQuery.data?.totalCount === 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          No published products for this combination. Change source, delivery type, or supplier above — no need to clear and restart.
        </p>
      )}
    </div>
  )
}
