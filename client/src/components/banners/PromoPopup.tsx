import { useEffect, useMemo, useState } from 'react'
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

const STORAGE_KEY = 'psmc.dismissedPromos'

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

/** Shows active promotional banners as a login popup for Distributor / Retailer. */
export default function PromoPopup() {
  const { role, isAuthenticated } = useAuth()
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)

  const enabled = isAuthenticated && (role === 'Distributor' || role === 'Retailer')

  const query = useQuery({
    queryKey: ['catalog-active-promotions', role],
    enabled,
    queryFn: async () => (await api.get<ActivePromo[]>('/catalog/active-promotions')).data,
    staleTime: 60_000
  })

  const promos = useMemo(() => {
    const dismissed = new Set(readDismissed())
    return (query.data ?? []).filter((p) => !dismissed.has(p.id))
  }, [query.data])

  useEffect(() => {
    if (promos.length > 0) {
      setIndex(0)
      setOpen(true)
    } else {
      setOpen(false)
    }
  }, [promos])

  if (!enabled || !open || promos.length === 0) return null

  const current = promos[Math.min(index, promos.length - 1)]

  const dismissCurrent = () => {
    const next = [...readDismissed(), current.id]
    writeDismissed(next)
    const remaining = promos.filter((p) => p.id !== current.id)
    if (remaining.length === 0) {
      setOpen(false)
      return
    }
    setIndex(0)
  }

  const dismissAll = () => {
    writeDismissed([...readDismissed(), ...promos.map((p) => p.id)])
    setOpen(false)
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4" role="dialog" aria-label="Promotion">
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-card overflow-hidden">
        <button
          type="button"
          onClick={dismissAll}
          className="absolute top-3 right-3 z-10 h-8 w-8 rounded-full bg-white/90 text-suzuki-navy inline-flex items-center justify-center shadow"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="bg-suzuki-navy px-5 py-3 pr-12">
          <p className="text-xs font-semibold text-white/70 uppercase tracking-wide">
            {current.type === 'NewsletterPopUp' ? 'Newsletter' : 'Promotion'}
          </p>
          <h2 className="text-lg font-extrabold text-white">{current.title}</h2>
        </div>

        {current.redirectUrl ? (
          <a href={current.redirectUrl} target="_blank" rel="noreferrer" className="block">
            <img src={current.imageUrl} alt={current.title} className="w-full max-h-[360px] object-contain bg-suzuki-mist" />
          </a>
        ) : (
          <img src={current.imageUrl} alt={current.title} className="w-full max-h-[360px] object-contain bg-suzuki-mist" />
        )}

        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-suzuki-line">
          <p className="text-xs text-suzuki-mute">
            {index + 1} of {promos.length}
          </p>
          <div className="flex gap-2">
            {promos.length > 1 && index < promos.length - 1 && (
              <button
                type="button"
                onClick={() => setIndex((i) => i + 1)}
                className="rounded-xl bg-suzuki-ice px-4 py-2 text-sm font-bold text-suzuki-navy"
              >
                Next
              </button>
            )}
            <button
              type="button"
              onClick={dismissCurrent}
              className="rounded-xl bg-suzuki-red px-4 py-2 text-sm font-bold text-white"
            >
              {index < promos.length - 1 ? 'Dismiss' : 'Got it'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
