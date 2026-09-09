import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import clsx from 'clsx'
import { api } from '@/api/axiosClient'

type NotificationItem = {
  id: string
  title: string
  message: string
  category: string
  linkUrl?: string | null
  relatedEntityId?: string | null
  isRead: boolean
  createdAtUtc: string
}

type PagedNotifications = {
  items: NotificationItem[]
  totalCount: number
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function NotificationBell() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const unread = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => (await api.get<{ count: number }>('/notifications/unread-count')).data,
    refetchInterval: 30_000
  })

  const list = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: async () =>
      (await api.get<PagedNotifications>('/notifications', { params: { pageSize: 15 } })).data,
    enabled: open
  })

  const markRead = useMutation({
    mutationFn: async (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] })
    }
  })

  const markAll = useMutation({
    mutationFn: async () => api.post('/notifications/read-all'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] })
    }
  })

  const count = unread.data?.count ?? 0

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const width = 340
    const left = Math.min(
      Math.max(8, rect.right - width),
      window.innerWidth - width - 8
    )
    setPos({ top: rect.bottom + 8, left })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node
      if (btnRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const openItem = (n: NotificationItem) => {
    if (!n.isRead) markRead.mutate(n.id)
    setOpen(false)
    if (n.linkUrl) navigate(n.linkUrl)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className={clsx('nav-item shrink-0 min-w-[52px] md:min-w-[64px]', open && 'nav-item-active')}
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="relative">
          <Bell
            size={20}
            strokeWidth={open ? 2.4 : 1.8}
            className={open ? 'text-suzuki-red' : 'text-suzuki-mute'}
          />
          {count > 0 && (
            <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-suzuki-red text-white text-[9px] font-bold inline-flex items-center justify-center">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </span>
        <span className="hidden md:inline">Notifications</span>
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Notifications"
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-[100] w-[340px] max-h-[70vh] flex flex-col rounded-xl border border-suzuki-line bg-white shadow-card overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-suzuki-line">
              <p className="text-sm font-bold text-suzuki-navy">Notifications</p>
              {count > 0 && (
                <button
                  type="button"
                  className="text-xs font-semibold text-suzuki-red hover:underline"
                  onClick={() => markAll.mutate()}
                  disabled={markAll.isPending}
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="overflow-y-auto flex-1">
              {list.isLoading && (
                <p className="px-4 py-8 text-sm text-suzuki-mute text-center">Loading…</p>
              )}
              {!list.isLoading && (list.data?.items.length ?? 0) === 0 && (
                <p className="px-4 py-8 text-sm text-suzuki-mute text-center">No notifications yet.</p>
              )}
              {(list.data?.items ?? []).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openItem(n)}
                  className={clsx(
                    'w-full text-left px-4 py-3 border-b border-suzuki-line/70 hover:bg-suzuki-mist/60 transition-colors',
                    !n.isRead && 'bg-rose-50/50'
                  )}
                >
                  <div className="flex items-start gap-2">
                    {!n.isRead && (
                      <span className="mt-1.5 h-2 w-2 rounded-full bg-suzuki-red shrink-0" />
                    )}
                    <div className={clsx('min-w-0', n.isRead && 'pl-4')}>
                      <p className="text-sm font-semibold text-suzuki-navy truncate">{n.title}</p>
                      <p className="text-xs text-suzuki-mute mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-suzuki-mute mt-1">{timeAgo(n.createdAtUtc)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
