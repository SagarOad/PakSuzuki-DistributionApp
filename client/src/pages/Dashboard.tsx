import { useAuth } from '@/context/AuthContext'
import SuperAdminDashboard from './SuperAdminDashboard'
import DistributorDashboard from './Distributor/DistributorDashboard'
import DistributorHomePage from './Catalog/DistributorHomePage'

/** Role-aware home: staff / distributor dashboards; retailers shop from Start Order catalog. */
export default function Dashboard() {
  const { role } = useAuth()
  if (role === 'Distributor') return <DistributorDashboard />
  if (role === 'Retailer') return <DistributorHomePage />
  return <SuperAdminDashboard />
}
