import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

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
  quantity: number
  unit?: string
}

interface CartMeta {
  /** Retailer order this manufacturer cart was built from (future / Super Admin link). */
  originatingRetailerOrderId: string | null
}

interface CartContextValue {
  items: CartLine[]
  itemCount: number
  subTotal: number
  originatingRetailerOrderId: string | null
  /** Brief pulse/toast after Add to Cart */
  justAdded: boolean
  addItem: (line: Omit<CartLine, 'quantity'>, qty?: number) => void
  setQuantity: (productId: string, variantId: string, quantity: number) => void
  removeItem: (productId: string, variantId: string) => void
  /** Replace cart contents (e.g. Order to Manufacturer from a retailer order). */
  replaceFromRetailerOrder: (lines: CartLine[], originatingRetailerOrderId: string) => void
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
    if (!raw) return { originatingRetailerOrderId: null }
    const parsed = JSON.parse(raw) as CartMeta
    return { originatingRetailerOrderId: parsed?.originatingRetailerOrderId ?? null }
  } catch {
    return { originatingRetailerOrderId: null }
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
          next[idx] = { ...next[idx], quantity: next[idx].quantity + qty }
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

    const replaceFromRetailerOrder: CartContextValue['replaceFromRetailerOrder'] = (
      lines,
      originatingRetailerOrderId
    ) => {
      setItems(lines.filter((l) => l.quantity > 0))
      setMeta({ originatingRetailerOrderId })
    }

    return {
      items,
      itemCount: items.reduce((s, i) => s + i.quantity, 0),
      subTotal: items.reduce((s, i) => s + i.unitPrice * i.quantity, 0),
      originatingRetailerOrderId: meta.originatingRetailerOrderId,
      justAdded,
      addItem,
      setQuantity,
      removeItem,
      replaceFromRetailerOrder,
      clear: () => {
        setItems([])
        setMeta({ originatingRetailerOrderId: null })
      }
    }
  }, [items, justAdded, meta.originatingRetailerOrderId])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
