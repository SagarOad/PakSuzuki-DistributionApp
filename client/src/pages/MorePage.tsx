import { Link } from 'react-router-dom'
import { Gift, Megaphone, Settings2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

export default function MorePage() {
  const { role } = useAuth()
  const isStaff = role === 'SuperAdmin' || role === 'Admin'

  const items = [
    {
      to: '/incentives',
      title: 'Incentive Management',
      note: 'Create programs by Liters, Cartons, or Amount. Track distributors and retailers live.',
      icon: Gift,
      roles: ['SuperAdmin', 'Admin']
    },
    {
      to: '/claims',
      title: 'Claims',
      note: 'Claims workflow (coming next).',
      icon: Megaphone,
      roles: ['SuperAdmin', 'Admin', 'Distributor']
    },
    {
      to: '/products',
      title: 'Products & Pricing',
      note: 'Catalog and price history tools.',
      icon: Settings2,
      roles: ['SuperAdmin', 'Admin']
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
            {item.to === '/incentives' && isStaff && (
              <span className="inline-block mt-3 text-xs font-bold text-suzuki-blue">Open →</span>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
