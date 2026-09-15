import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from '@/api/axiosClient'

export interface CartLine {
  productId: string
  variantId: string
  sku: string
  name: string
  description?: string | null
  categoryName?: string | null
  imageUrl?: string | null
  packLabel: string
  unitPrice: number
  packQuantity?: number | null
  unitValue?: number | null
  unitType?: string | null
  /** Variant GST % — same basis as order creation (line subtotal × %). */
  gstPercent?: number
  /** Variant FED % — same basis as order creation. */
  fedPercent?: number
  quantity: number
  unit?: string
}

/** Header lane for a manufacturer PO — one source + delivery type + supplier per cart. */
export interface OrderContext {
  vendorCode: string
  vendorName: string
  materialSourceCode: string
  deliveryTypeCode: string
  deliveryTypeName: string
  supplierCode: string
  supplierName: string
}

interface CartMeta {
  originatingRetailerOrderId: string | null
  orderContext: OrderContext | null
}

interface CartContextValue {
  items: CartLine[]
  itemCount: number
  subTotal: number
  originatingRetailerOrderId: string | null
  orderContext: OrderContext | null
  justAdded: boolean
  addItem: (line: Omit<CartLine, 'quantity'>, qty?: number) => void
  setQuantity: (productId: string, variantId: string, quantity: number) => void
  removeItem: (productId: string, variantId: string) => void
  syncTaxRates: (
    rates: Record<string, { gstPercent: number; fedPercent: number }>
  ) => void
  patchLinePackMeta: (
    productId: string,
    variantId: string,
    meta: Pick<CartLine, 'packQuantity' | 'unitValue' | 'unitType' | 'packLabel'>
  ) => void
  replaceFromRetailerOrder: (lines: CartLine[], originatingRetailerOrderId: string) => void
  setOrderContext: (ctx: OrderContext, options?: { clearCart?: boolean }) => void
  clearOrderContext: () => void
  clear: () => void
}

const STORAGE_KEY = 'paksuzuki.distributor.cart'
const META_KEY = 'paksuzuki.distributor.cart.meta'
const CartContext = createContext<CartContextValue | null>(null)

function loadCart(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CartLine[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function loadMeta(): CartMeta {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (!raw) return { originatingRetailerOrderId: null, orderContext: null }
    const parsed = JSON.parse(raw) as CartMeta
    return {
      originatingRetailerOrderId: parsed?.originatingRetailerOrderId ?? null,
      orderContext: parsed?.orderContext ?? null
    }
  } catch {
    return { originatingRetailerOrderId: null, orderContext: null }
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLine[]>(() => loadCart())
  const [meta, setMeta] = useState<CartMeta>(() => loadMeta())
  const [justAdded, setJustAdded] = useState(false)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  useEffect(() => {
    localStorage.setItem(META_KEY, JSON.stringify(meta))
  }, [meta])

  useEffect(() => {
    if (!justAdded) return
    const t = setTimeout(() => setJustAdded(false), 2200)
    return () => clearTimeout(t)
  }, [justAdded])

  const value = useMemo<CartContextValue>(() => {
    const addItem: CartContextValue['addItem'] = (line, qty = 1) => {
      setItems((prev) => {
        const idx = prev.findIndex((x) => x.productId === line.productId && x.variantId === line.variantId)
        if (idx >= 0) {
          const next = [...prev]
          const existing = next[idx]
          next[idx] = {
            ...existing,
            quantity: existing.quantity + qty,
            unitPrice: line.unitPrice,
            packLabel: line.packLabel || existing.packLabel,
            packQuantity: line.packQuantity ?? existing.packQuantity,
            unitValue: line.unitValue ?? existing.unitValue,
            unitType: line.unitType ?? existing.unitType,
            gstPercent: line.gstPercent ?? existing.gstPercent,
            fedPercent: line.fedPercent ?? existing.fedPercent
          }
          return next
        }
        return [...prev, { ...line, quantity: qty }]
      })
      setJustAdded(true)
    }

    const setQuantity: CartContextValue['setQuantity'] = (productId, variantId, quantity) => {
      setItems((prev) =>
        prev
          .map((x) =>
            x.productId === productId && x.variantId === variantId
              ? { ...x, quantity: Math.max(0, quantity) }
              : x
          )
          .filter((x) => x.quantity > 0)
      )
    }

    const removeItem: CartContextValue['removeItem'] = (productId, variantId) => {
      setItems((prev) => prev.filter((x) => !(x.productId === productId && x.variantId === variantId)))
    }

    const syncTaxRates: CartContextValue['syncTaxRates'] = (rates) => {
      setItems((prev) => {
        let changed = false
        const next = prev.map((item) => {
          const rate = rates[item.variantId]
          if (!rate) return item
          if (item.gstPercent === rate.gstPercent && item.fedPercent === rate.fedPercent) return item
          changed = true
          return { ...item, gstPercent: rate.gstPercent, fedPercent: rate.fedPercent }
        })
        return changed ? next : prev
      })
    }

    const patchLinePackMeta: CartContextValue['patchLinePackMeta'] = (productId, variantId, meta) => {
      setItems((prev) => {
        let changed = false
        const next = prev.map((x) => {
          if (x.productId !== productId || x.variantId !== variantId) return x
          const packQuantity = meta.packQuantity ?? x.packQuantity
          const unitValue = meta.unitValue ?? x.unitValue
          const unitType = meta.unitType ?? x.unitType
          const packLabel = meta.packLabel || x.packLabel
          if (
            packQuantity === x.packQuantity &&
            unitValue === x.unitValue &&
            unitType === x.unitType &&
            packLabel === x.packLabel
          ) {
            return x
          }
          changed = true
          return { ...x, packQuantity, unitValue, unitType, packLabel }
        })
        return changed ? next : prev
      })
    }

    const replaceFromRetailerOrder: CartContextValue['replaceFromRetailerOrder'] = (
      lines,
      originatingRetailerOrderId
    ) => {
      setItems(lines.filter((l) => l.quantity > 0))
      setMeta((prev) => ({ ...prev, originatingRetailerOrderId }))
    }

    const setOrderContext: CartContextValue['setOrderContext'] = (ctx, options) => {
      const clearCart = options?.clearCart !== false
      setMeta((prev) => ({ ...prev, orderContext: ctx }))
      if (clearCart) {
        setItems([])
        setMeta((prev) => ({ ...prev, orderContext: ctx, originatingRetailerOrderId: null }))
      }
    }

    return {
      items,
      itemCount: items.reduce((s, i) => s + i.quantity, 0),
      subTotal: items.reduce((s, i) => s + i.unitPrice * i.quantity, 0),
      originatingRetailerOrderId: meta.originatingRetailerOrderId,
      orderContext: meta.orderContext,
      justAdded,
      addItem,
      setQuantity,
      removeItem,
      syncTaxRates,
      patchLinePackMeta,
      replaceFromRetailerOrder,
      setOrderContext,
      clearOrderContext: () => {
        setItems([])
        setMeta({ originatingRetailerOrderId: null, orderContext: null })
      },
      clear: () => {
        setItems([])
        setMeta((prev) => ({ ...prev, originatingRetailerOrderId: null }))
      }
    }
  }, [items, justAdded, meta])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}

export function catalogFilterParams(ctx: OrderContext | null | undefined) {
  if (!ctx) return {}
  return {
    materialSourceCode: ctx.materialSourceCode,
    deliveryTypeCode: ctx.deliveryTypeCode,
    supplierCode: ctx.supplierCode
  }
}

/** Fill pack size / liters on older cart rows that were saved without those fields. */
export function useHydrateCartPackMeta() {
  const { items, patchLinePackMeta } = useCart()
  const tried = useRef(new Set<string>())

  useEffect(() => {
    for (const item of items) {
      if (item.unitValue != null && Number(item.unitValue) > 0) continue
      if (tried.current.has(item.productId)) continue
      tried.current.add(item.productId)
      void api
        .get<{
          packQuantity?: number | null
          unitValue?: number | null
          unitType?: string | null
          packLabel?: string | null
          variants?: { id: string; packQuantity?: number | null; unitValue?: number | null; unitType?: string | null }[]
        }>(`/catalog/products/${item.productId}`)
        .then((res) => {
          const d = res.data
          const v = d.variants?.find((x) => x.id === item.variantId)
          patchLinePackMeta(item.productId, item.variantId, {
            packQuantity: d.packQuantity ?? v?.packQuantity ?? null,
            unitValue: d.unitValue ?? v?.unitValue ?? null,
            unitType: d.unitType ?? v?.unitType ?? null,
            packLabel: item.packLabel
          })
        })
        .catch(() => {
          /* keep cart usable if catalog lookup fails */
        })
    }
  }, [items, patchLinePackMeta])
}
