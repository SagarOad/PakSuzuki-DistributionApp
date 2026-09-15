import { useAuth } from '@/context/AuthContext'
import SuperAdminDashboard from './SuperAdminDashboard'
import RegionalHeadDashboard from './RegionalHeadDashboard'
import DistributorDashboard from './Distributor/DistributorDashboard'
import DistributorHomePage from './Catalog/DistributorHomePage'

/** Role-aware home: staff / regional head / distributor dashboards; retailers shop from catalog. */
export default function Dashboard() {
  const { role } = useAuth()
  if (role === 'Distributor') return <DistributorDashboard />
  if (role === 'Retailer') return <DistributorHomePage />
  if (role === 'RegionalHead') return <RegionalHeadDashboard />
  return <SuperAdminDashboard />
}
