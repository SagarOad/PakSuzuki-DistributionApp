import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Map, Truck, Package, Store, ShoppingBasket,
  UsersRound, MoreHorizontal, Bell, LogOut
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
  { to: '/claims', label: 'Claims', icon: UsersRound, roles: ['SuperAdmin', 'Admin', 'Distributor'] },
  { to: '/more', label: 'More', icon: MoreHorizontal, roles: ['SuperAdmin', 'Admin', 'Distributor'] }
]

export default function DashboardLayout() {
  const { userName, role, logout } = useAuth()
  const navigate = useNavigate()
  const navItems = allNavItems.filter((item) => !role || item.roles.includes(role))

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 bg-white border-b border-suzuki-line shadow-sm">
        <div className="mx-auto max-w-[1440px] px-4 lg:px-6 h-[72px] flex items-center gap-4">
          <button type="button" onClick={() => navigate('/')} className="shrink-0" aria-label="Home">
            <SuzukiLogo className="h-10" />
          </button>

          <nav className="flex-1 flex items-end justify-center gap-0.5 overflow-x-auto scrollbar-none min-h-[56px] pt-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  clsx('nav-item min-w-[72px]', isActive && 'nav-item-active')
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon
                      size={20}
                      strokeWidth={isActive ? 2.4 : 1.8}
                      className={isActive ? 'text-suzuki-red' : 'text-suzuki-mute'}
                    />
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            ))}

            <button type="button" className="nav-item min-w-[64px]" aria-label="Notifications">
              <Bell size={20} className="text-suzuki-mute" />
              <span>Alerts</span>
            </button>
          </nav>

          <div className="shrink-0 flex items-center gap-4">
            <EcstarLogo className="h-10" />
            <div className="hidden md:flex flex-col items-end border-l border-suzuki-line pl-4">
              <span className="text-xs font-semibold text-suzuki-ink truncate max-w-[140px]">{userName}</span>
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

      <main className="flex-1 mx-auto w-full max-w-[1440px] px-4 lg:px-6 py-5">
        <Outlet />
      </main>

      <footer className="py-4 text-center text-xs text-suzuki-mute">
        © Copyright {new Date().getFullYear()} Pakistan Suzuki
      </footer>
    </div>
  )
}
