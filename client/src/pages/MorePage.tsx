import { Link } from 'react-router-dom'
import { Droplets, FileBarChart2, Gift, Image, Settings } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

export default function MorePage() {
  const { role } = useAuth()

  const items = [
    {
      to: '/products',
      title: 'Product master',
      note: 'Add lubricants through the sequential wizard. Parts fields wait on client master data.',
      icon: Droplets,
      roles: ['SuperAdmin', 'Admin']
    },
    {
      to: '/promotions',
      title: 'Banner & Promotions',
      note: 'Header & category banners for Start Order / dashboard, plus login popups for distributors and retailers.',
      icon: Image,
      roles: ['SuperAdmin', 'Admin']
    },
    {
      to: '/reports',
      title: 'Reports',
      note: 'Sales, orders, targets, and claims report exports.',
      icon: FileBarChart2,
      roles: ['SuperAdmin', 'Admin', 'Distributor']
    },
    {
      to: '/settings',
      title: 'Settings',
      note: 'Profile, tax thresholds, and product groups for incentive schemes.',
      icon: Settings,
      roles: ['SuperAdmin', 'Admin', 'Distributor']
    },
    {
      to: '/incentive-schemes',
      title: 'Incentive schemes',
      note: 'Product groups, slab schemes, live evaluation, and distributor PDF reports.',
      icon: Gift,
      roles: ['SuperAdmin', 'Admin']
    },
    {
      to: '/incentives',
      title: 'Legacy incentives',
      note: 'View legacy incentive programs, targets, and achievement.',
      icon: Gift,
      roles: ['SuperAdmin', 'Admin', 'Distributor']
    }
  ].filter((i) => !role || i.roles.includes(role))

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-suzuki-navy">More</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="bg-white rounded-2xl border border-suzuki-line shadow-card p-5 hover:border-suzuki-blue/40 transition-colors"
          >
            <div className="h-10 w-10 rounded-xl bg-suzuki-ice text-suzuki-navy flex items-center justify-center mb-3">
              <item.icon size={20} />
            </div>
            <div className="font-bold text-suzuki-navy">{item.title}</div>
            <p className="text-sm text-suzuki-mute mt-1">{item.note}</p>
            <span className="inline-block mt-3 text-xs font-bold text-suzuki-blue">Open →</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
