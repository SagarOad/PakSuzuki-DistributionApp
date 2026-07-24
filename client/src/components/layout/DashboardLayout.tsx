import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, Outlet, useNavigate, useLocation, Link } from 'react-router-dom'
import {
  LayoutDashboard, Map, Truck, Package, Store, ShoppingBasket,
  UsersRound, Bell, LogOut, CircleEllipsis, Image, FileBarChart2, Settings, Gift
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { SuzukiLogo, EcstarLogo } from '@/components/brand/Logos'
import clsx from 'clsx'

const allNavItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, roles: ['SuperAdmin', 'Admin', 'Distributor', 'RegionalHead'] },
  { to: '/map', label: 'Map View', icon: Map, roles: ['SuperAdmin', 'Admin', 'Distributor', 'RegionalHead'] },
  { to: '/distributors', label: 'Distributors', icon: Truck, roles: ['SuperAdmin', 'Admin'] },
  { to: '/retailers', label: 'Retailers', icon: Package, roles: ['SuperAdmin', 'Admin', 'Distributor'] },
  { to: '/shop', label: 'Shop', icon: Store, roles: ['SuperAdmin', 'Admin', 'Distributor'] },
  { to: '/orders', label: 'Orders', icon: ShoppingBasket, roles: ['SuperAdmin', 'Admin', 'Distributor'] },
  { to: '/claims', label: 'Claims', icon: UsersRound, roles: ['SuperAdmin', 'Admin', 'Distributor'] }
]

const moreLinks = [
  { to: '/promotions', label: 'Banner & Promotions', icon: Image, roles: ['SuperAdmin', 'Admin'] },
  { to: '/reports', label: 'Reports', icon: FileBarChart2, roles: ['SuperAdmin', 'Admin', 'Distributor'] },
  { to: '/settings', label: 'Settings', icon: Settings, roles: ['SuperAdmin', 'Admin', 'Distributor'] },
  { to: '/incentives', label: 'Incentives', icon: Gift, roles: ['SuperAdmin', 'Admin'] }
]

const moreActivePrefixes = ['/promotions', '/reports', '/settings', '/incentives', '/more']

export default function DashboardLayout() {
  const { userName, role, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const navItems = allNavItems.filter((item) => !role || item.roles.includes(role))
  const moreItems = moreLinks.filter((item) => !role || item.roles.includes(role))
  const [moreOpen, setMoreOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const moreBtnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const moreActive = moreActivePrefixes.some((p) => location.pathname.startsWith(p))

  useEffect(() => {
    setMoreOpen(false)
  }, [location.pathname])

  useLayoutEffect(() => {
    if (!moreOpen || !moreBtnRef.current) return
    const rect = moreBtnRef.current.getBoundingClientRect()
    const menuWidth = 224
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - menuWidth / 2),
      window.innerWidth - menuWidth - 8
    )
    setMenuPos({ top: rect.bottom + 8, left })
  }, [moreOpen])

  useEffect(() => {
    if (!moreOpen) return
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node
      if (moreBtnRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setMoreOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [moreOpen])

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <header className="sticky top-0 z-40 bg-white border-b border-suzuki-line shadow-sm overflow-visible">
        <div className="mx-auto max-w-[1440px] px-3 sm:px-4 lg:px-6 h-[64px] sm:h-[72px] flex items-center gap-2 sm:gap-3 lg:gap-4">
          <button type="button" onClick={() => navigate('/')} className="shrink-0" aria-label="Home">
            <SuzukiLogo className="h-6 max-w-[80px] sm:h-7 sm:max-w-[100px] lg:h-8 lg:max-w-[120px]" />
          </button>

          <nav className="flex-1 min-w-0 flex items-end justify-start sm:justify-center gap-0 overflow-x-auto scrollbar-none min-h-[52px] sm:min-h-[56px] pt-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  clsx(
                    'nav-item shrink-0 min-w-[52px] md:min-w-[72px]',
                    isActive && 'nav-item-active'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon
                      size={20}
                      strokeWidth={isActive ? 2.4 : 1.8}
                      className={isActive ? 'text-suzuki-red' : 'text-suzuki-mute'}
                    />
                    <span className="hidden md:inline">{item.label}</span>
                  </>
                )}
              </NavLink>
            ))}

            {moreItems.length > 0 && (
              <button
                ref={moreBtnRef}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setMoreOpen((v) => !v)
                }}
                className={clsx(
                  'nav-item shrink-0 min-w-[52px] md:min-w-[72px]',
                  (moreOpen || moreActive) && 'nav-item-active'
                )}
                aria-expanded={moreOpen}
                aria-haspopup="menu"
              >
                <CircleEllipsis
                  size={20}
                  strokeWidth={moreOpen || moreActive ? 2.4 : 1.8}
                  className={moreOpen || moreActive ? 'text-suzuki-red' : 'text-suzuki-mute'}
                />
                <span className="hidden md:inline">More</span>
              </button>
            )}

            <button type="button" className="nav-item shrink-0 min-w-[52px] md:min-w-[64px]" aria-label="Notifications">
              <Bell size={20} className="text-suzuki-mute" />
              <span className="hidden md:inline">Notifications</span>
            </button>
          </nav>

          <div className="shrink-0 flex items-center gap-2 sm:gap-3 lg:gap-4">
            <EcstarLogo className="hidden lg:block h-8 max-w-[120px]" />
            <div className="hidden md:flex flex-col border-l border-suzuki-line pl-3 lg:pl-4 justify-center">
              <span className="text-xs font-semibold text-suzuki-ink truncate max-w-[100px] lg:max-w-[120px]">{userName}</span>
              <span className="text-[10px] font-medium text-suzuki-mute uppercase tracking-wider">{role}</span>
            </div>
            <button
              type="button"
              onClick={logout}
              className="p-2 rounded-lg text-suzuki-mute hover:bg-suzuki-mist hover:text-suzuki-red transition-colors"
              title="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {moreOpen &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: menuPos.top, left: menuPos.left }}
            className="fixed z-[100] w-56 rounded-xl border border-suzuki-line bg-white shadow-card py-2"
          >
            {moreItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                role="menuitem"
                onClick={() => setMoreOpen(false)}
                className={clsx(
                  'flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold transition-colors',
                  location.pathname.startsWith(item.to)
                    ? 'bg-rose-50 text-suzuki-red'
                    : 'text-suzuki-navy hover:bg-suzuki-mist'
                )}
              >
                <item.icon size={16} />
                {item.label}
              </Link>
            ))}
          </div>,
          document.body
        )}

      <main className="flex-1 mx-auto w-full max-w-[1440px] px-3 sm:px-4 lg:px-6 py-4 sm:py-5 min-w-0">
        <Outlet />
      </main>

      <footer className="py-4 text-center text-xs text-suzuki-mute">
        © Copyright {new Date().getFullYear()} Pakistan Suzuki
      </footer>
    </div>
  )
}
