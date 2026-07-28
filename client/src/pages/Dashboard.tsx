import { useAuth } from '@/context/AuthContext'
import SuperAdminDashboard from './SuperAdminDashboard'
import DistributorHomePage from './Catalog/DistributorHomePage'
import { Navigate } from 'react-router-dom'

/** Role-aware home: staff dashboard; Distributor sees oil storefront. */
export default function Dashboard() {
  const { role } = useAuth()
  if (role === 'Retailer') return <Navigate to="/use-mobile-app" replace />
  if (role === 'Distributor') return <DistributorHomePage />
  return <SuperAdminDashboard />
}
