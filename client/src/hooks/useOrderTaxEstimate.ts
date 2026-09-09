import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/axiosClient'
import { useCart, type CartLine } from '@/context/CartContext'
import type { CatalogProductDetail } from '@/pages/Catalog/catalogTypes'

function roundMoney(n: number) {
  return Math.round(n * 100) / 100
}

/**
 * Cart/checkout estimate using the same formula as order creation:
 * line GST/FED = lineSubtotal × %; WHT once on order subtotal; grand = sub + gst + fed + wht.
 * Always reloads tax % from catalog (and system tax rules as fallback) so stale cart gst=0 cannot hide tax.
 */
export function useOrderTaxEstimate(items: CartLine[]) {
  const { syncTaxRates } = useCart()

  const subTotal = useMemo(
    () => roundMoney(items.reduce((s, i) => s + i.unitPrice * i.quantity, 0)),
    [items]
  )

  const productIds = useMemo(
    () => [...new Set(items.map((i) => i.productId).filter(Boolean))].sort(),
    [items]
  )

  const taxQuery = useQuery({
    queryKey: ['cart-tax-rates', productIds],
    enabled: productIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const details = await Promise.all(
        productIds.map(
          async (id) => (await api.get<CatalogProductDetail>(`/catalog/products/${id}`)).data
        )
      )
      const byVariant: Record<string, { gstPercent: number; fedPercent: number }> = {}
      for (const detail of details) {
        for (const v of detail.variants ?? []) {
          const gst = Number(v.gstPercent)
          const fed = Number(v.fedPercent)
          byVariant[v.id] = {
            gstPercent: Number.isFinite(gst) ? gst : 0,
            fedPercent: Number.isFinite(fed) ? fed : 0
          }
        }
      }
      return byVariant
    }
  })

  const systemTaxQuery = useQuery({
    queryKey: ['order-tax-percents'],
    queryFn: async () =>
      (await api.get<{ gstPercent: number; fedPercent: number }>('/settings/order-tax-percents')).data,
    staleTime: 60_000
  })

  useEffect(() => {
    if (!taxQuery.data) return
    const system = systemTaxQuery.data
    const merged: Record<string, { gstPercent: number; fedPercent: number }> = {}
    for (const item of items) {
      const fromApi = taxQuery.data[item.variantId]
      let gst = fromApi?.gstPercent ?? 0
      let fed = fromApi?.fedPercent ?? 0
      if (gst <= 0 && system?.gstPercent) gst = Number(system.gstPercent)
      if (fed <= 0 && system?.fedPercent) fed = Number(system.fedPercent)
      if (gst > 0 || fed > 0) merged[item.variantId] = { gstPercent: gst, fedPercent: fed }
    }
    if (Object.keys(merged).length > 0) syncTaxRates(merged)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when rates arrive
  }, [taxQuery.data, systemTaxQuery.data, items.length])

  const whtQuery = useQuery({
    queryKey: ['wht-percent'],
    queryFn: async () => (await api.get<{ key: string; value: string }>('/settings/wht-percent')).data,
    staleTime: 60_000
  })

  return useMemo(() => {
    const live = taxQuery.data ?? {}
    const systemGst = Number(systemTaxQuery.data?.gstPercent ?? 0)
    const systemFed = Number(systemTaxQuery.data?.fedPercent ?? 0)
    let totalGst = 0
    let totalFed = 0

    for (const item of items) {
      const lineSub = item.unitPrice * item.quantity
      const fromApi = live[item.variantId]
      let gstPct = Number(fromApi?.gstPercent ?? item.gstPercent ?? 0)
      let fedPct = Number(fromApi?.fedPercent ?? item.fedPercent ?? 0)
      if (!(gstPct > 0) && systemGst > 0) gstPct = systemGst
      if (!(fedPct > 0) && systemFed > 0) fedPct = systemFed
      totalGst += (lineSub * (Number.isFinite(gstPct) ? gstPct : 0)) / 100
      totalFed += (lineSub * (Number.isFinite(fedPct) ? fedPct : 0)) / 100
    }

    const gstAmount = roundMoney(totalGst)
    const fedAmount = roundMoney(totalFed)
    const gstPercent = subTotal > 0 ? roundMoney((gstAmount / subTotal) * 100) : 0

    const whtRaw = Number(whtQuery.data?.value ?? 0)
    const whtPercent = Number.isFinite(whtRaw) && whtRaw > 0 ? whtRaw : 0
    const whtAmount = roundMoney((subTotal * whtPercent) / 100)
    const estimatedTotal = roundMoney(subTotal + gstAmount + fedAmount + whtAmount)

    return {
      subTotal,
      gstPercent,
      gstAmount,
      fedAmount,
      whtPercent,
      whtAmount,
      estimatedTotal,
      isLoading:
        whtQuery.isLoading ||
        systemTaxQuery.isLoading ||
        (productIds.length > 0 && taxQuery.isLoading)
    }
  }, [
    items,
    subTotal,
    taxQuery.data,
    taxQuery.isLoading,
    systemTaxQuery.data,
    systemTaxQuery.isLoading,
    whtQuery.data?.value,
    whtQuery.isLoading,
    productIds.length
  ])
}
