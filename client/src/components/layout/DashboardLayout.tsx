import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, Outlet, useNavigate, useLocation, Link } from 'react-router-dom'
import {
  LayoutDashboard, Map, Truck, Package, ShoppingBasket,
  UsersRound, LogOut, CircleEllipsis, Image, FileBarChart2, Settings, Gift,
  Home, Droplets, ClipboardList, ShoppingCart, FilePlus2
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useCart } from '@/context/CartContext'
import { SuzukiLogo, EcstarLogo } from '@/components/brand/Logos'
import NotificationBell from '@/components/layout/NotificationBell'
import PromoPopup from '@/components/banners/PromoPopup'
import clsx from 'clsx'

const staffNavItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, roles: ['SuperAdmin', 'Admin', 'RegionalHead'] },
  { to: '/map', label: 'Map View', icon: Map, roles: ['SuperAdmin', 'Admin', 'RegionalHead'] },
  { to: '/distributors', label: 'Distributors', icon: Truck, roles: ['SuperAdmin', 'Admin'] },
  { to: '/retailers', label: 'Retailers', icon: Package, roles: ['SuperAdmin', 'Admin'] },
  { to: '/products', label: 'Products', icon: Droplets, roles: ['SuperAdmin', 'Admin'] },
  { to: '/orders', label: 'Orders', icon: ShoppingBasket, roles: ['SuperAdmin', 'Admin', 'RegionalHead'] },
  { to: '/claims', label: 'Claims', icon: UsersRound, roles: ['SuperAdmin', 'Admin'] }
]

const distributorNavItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/order/start', label: 'Start Order', icon: FilePlus2 },
  { to: '/orders', label: 'My Orders', icon: ClipboardList },
  { to: '/cart', label: 'Cart', icon: ShoppingCart }
]

const retailerNavItems = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/order/start', label: 'Start Order', icon: FilePlus2 },
  { to: '/orders', label: 'My Orders', icon: ClipboardList },
  { to: '/cart', label: 'Cart', icon: ShoppingCart }
]

const staffMoreLinks = [
  { to: '/promotions', label: 'Banner & Promotions', icon: Image, roles: ['SuperAdmin', 'Admin'] },
  { to: '/reports', label: 'Reports', icon: FileBarChart2, roles: ['SuperAdmin', 'Admin'] },
  { to: '/settings', label: 'Settings', icon: Settings, roles: ['SuperAdmin', 'Admin'] },
  { to: '/incentive-schemes', label: 'Incentive schemes', icon: Gift, roles: ['SuperAdmin', 'Admin'] },
  { to: '/incentives', label: 'Legacy incentives', icon: Gift, roles: ['SuperAdmin', 'Admin'] },
  { to: '/orders/middleware', label: 'SAP Queue', icon: ClipboardList, roles: ['SuperAdmin', 'Admin'] }
]

const distributorMoreLinks = [
  { to: '/retailers', label: 'My Retailers', icon: Package },
  { to: '/incentives', label: 'Incentives', icon: Gift },
  { to: '/settings', label: 'Settings', icon: Settings }
]

function pathMatches(pathname: string, to: string, end = false) {
  if (end) return pathname === to
  return pathname === to || pathname.startsWith(`${to}/`)
}

/** Primary Orders tab must not light up for SAP Queue (/orders/middleware). */
function isPrimaryNavActive(pathname: string, to: string, end = false) {
  if (to === '/orders') {
    if (pathname.startsWith('/orders/middleware')) return false
    return pathname === '/orders' || pathname.startsWith('/orders/')
  }
  return pathMatches(pathname, to, end)
}

export default function DashboardLayout() {
  const { userName, role, logout } = useAuth()
  const { itemCount, justAdded } = useCart()
  const navigate = useNavigate()
  const location = useLocation()
  const isDistributor = role === 'Distributor'
  const isRetailer = role === 'Retailer'
  const showCatalogCart = isDistributor || isRetailer

  const navItems = isDistributor
    ? distributorNavItems
    : isRetailer
      ? retailerNavItems
      : staffNavItems.filter((item) => !role || item.roles.includes(role))

  const moreItems = isDistributor
    ? distributorMoreLinks
    : isRetailer
      ? []
      : staffMoreLinks.filter((item) => !role || item.roles.includes(role))

  const [moreOpen, setMoreOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const moreBtnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // More is active only for routes that live under More for this role —
  // never for primary nav tabs (that caused dual red highlights).
  const moreActive = useMemo(() => {
    const path = location.pathname
    const onPrimary = navItems.some((item) =>
      isPrimaryNavActive(path, item.to, 'end' in item ? Boolean(item.end) : false)
    )
    if (onPrimary) return false
    if (path === '/more' || path.startsWith('/more/') || path.startsWith('/product-groups') || path.startsWith('/overview'))
      return moreItems.length > 0
    return moreItems.some((item) => pathMatches(path, item.to))
  }, [location.pathname, navItems, moreItems])

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
            {navItems.map((item) => {
              const end = 'end' in item ? Boolean(item.end) : false
              const active = isPrimaryNavActive(location.pathname, item.to, end)
              return (
              <NavLink
                key={item.to}
                to={item.to}
                end={end}
                className={clsx(
                  'nav-item shrink-0 min-w-[52px] md:min-w-[72px] relative',
                  active && 'nav-item-active'
                )}
              >
                <span className="relative">
                  <item.icon
                    size={20}
                    strokeWidth={active ? 2.4 : 1.8}
                    className={clsx(
                      active ? 'text-suzuki-red' : 'text-suzuki-mute',
                      item.to === '/cart' && justAdded && 'animate-bounce'
                    )}
                  />
                  {item.to === '/cart' && itemCount > 0 && (
                    <span
                      className={clsx(
                        'absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-suzuki-red text-white text-[9px] font-bold inline-flex items-center justify-center',
                        justAdded && 'ring-2 ring-suzuki-red/40 scale-110'
                      )}
                    >
                      {itemCount > 99 ? '99+' : itemCount}
                    </span>
                  )}
                </span>
                <span className="hidden md:inline">{item.label}</span>
              </NavLink>
              )
            })}

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

            <NotificationBell />
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
                  pathMatches(location.pathname, item.to)
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

      <PromoPopup />

      {showCatalogCart && itemCount > 0 && location.pathname !== '/cart' && (
        <button
          type="button"
          onClick={() => navigate('/cart')}
          className={clsx(
            'fixed bottom-6 right-5 z-[90] h-14 w-14 rounded-full bg-suzuki-red text-white shadow-lg',
            'inline-flex items-center justify-center hover:bg-red-700 transition-transform',
            justAdded && 'scale-110'
          )}
          aria-label={`Open cart (${itemCount})`}
        >
          <ShoppingCart size={22} />
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-white text-suzuki-red text-[11px] font-extrabold inline-flex items-center justify-center border border-suzuki-red">
            {itemCount > 99 ? '99+' : itemCount}
          </span>
        </button>
      )}

      {showCatalogCart && justAdded && (
        <div className="fixed bottom-24 right-5 z-[90] rounded-xl bg-suzuki-navy text-white text-sm font-semibold px-4 py-2.5 shadow-card">
          Added to cart
        </div>
      )}

      <footer className="py-4 text-center text-xs text-suzuki-mute">
        © Copyright {new Date().getFullYear()} Pakistan Suzuki
      </footer>
    </div>
  )
}
