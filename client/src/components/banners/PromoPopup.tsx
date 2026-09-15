import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { api } from '@/api/axiosClient'
import { useAuth } from '@/context/AuthContext'

type ActivePromo = {
  id: string
  title: string
  type: string
  imageUrl: string
  redirectUrl?: string | null
  startDateUtc: string
  endDateUtc: string
}

/** Bump key so older “dismiss all” session data cannot hide new popups. */
const STORAGE_KEY = 'psmc.dismissedLoginPopups.v2'

function readDismissed(): string[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function writeDismissed(ids: string[]) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
}

function normalizePromo(raw: Record<string, unknown>): ActivePromo | null {
  const id = String(raw.id ?? raw.Id ?? '').trim()
  const imageUrl = String(raw.imageUrl ?? raw.ImageUrl ?? '').trim()
  if (!id || !imageUrl) return null
  return {
    id,
    title: String(raw.title ?? raw.Title ?? 'Promotion'),
    type: String(raw.type ?? raw.Type ?? 'LoginPopup'),
    imageUrl,
    redirectUrl: (raw.redirectUrl ?? raw.RedirectUrl ?? null) as string | null,
    startDateUtc: String(raw.startDateUtc ?? raw.StartDateUtc ?? ''),
    endDateUtc: String(raw.endDateUtc ?? raw.EndDateUtc ?? '')
  }
}

function normalizeList(payload: unknown): ActivePromo[] {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { items?: unknown })?.items)
      ? (payload as { items: unknown[] }).items
      : []
  return list
    .map((row) => normalizePromo(row as Record<string, unknown>))
    .filter((p): p is ActivePromo => p != null)
}

/** One image at a time. Closing advances to the next undismissed popup. */
export default function PromoPopup() {
  const { role, isAuthenticated } = useAuth()
  const [queue, setQueue] = useState<ActivePromo[]>([])
  const [hydrated, setHydrated] = useState(false)

  const enabled = isAuthenticated && (role === 'Distributor' || role === 'Retailer')

  const query = useQuery({
    queryKey: ['catalog-active-promotions', role],
    enabled,
    queryFn: async () => {
      const { data } = await api.get<unknown>('/catalog/active-promotions')
      return normalizeList(data)
    },
    staleTime: 0,
    refetchOnMount: 'always'
  })

  // Build the queue whenever the API list changes (keep already-dismissed out).
  useEffect(() => {
    if (!query.data) return
    const dismissed = new Set(readDismissed())
    setQueue(query.data.filter((p) => !dismissed.has(p.id)))
    setHydrated(true)
  }, [query.data])

  const current = queue[0] ?? null
  const open = hydrated && !!current

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!enabled || !current) return null

  const dismiss = () => {
    const id = current.id
    const nextDismissed = [...new Set([...readDismissed(), id])]
    writeDismissed(nextDismissed)
    // Advance immediately to the next popup in the local queue.
    setQueue((prev) => prev.filter((p) => p.id !== id))
  }

  const image = (
    <img
      key={current.id}
      src={current.imageUrl}
      alt={current.title || 'Promotion'}
      className="block w-full max-h-[80vh] object-contain rounded-xl bg-white"
    />
  )

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-4"
      role="dialog"
      aria-label="Promotion"
      aria-modal="true"
    >
      <div className="relative w-full max-w-lg" key={current.id}>
        <button
          type="button"
          onClick={dismiss}
          className="absolute -top-3 -right-3 z-10 h-8 w-8 rounded-full bg-white text-suzuki-navy shadow-md inline-flex items-center justify-center hover:bg-suzuki-ice"
          aria-label="Close"
        >
          <X size={16} strokeWidth={2.5} />
        </button>

        {current.redirectUrl ? (
          <a href={current.redirectUrl} target="_blank" rel="noreferrer" className="block">
            {image}
          </a>
        ) : (
          image
        )}
      </div>
    </div>,
    document.body
  )
}
