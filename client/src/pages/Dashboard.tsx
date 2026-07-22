import { useAuth } from '@/context/AuthContext'
import SuperAdminDashboard from './SuperAdminDashboard'
import DistributorDashboard from './Distributor/DistributorDashboard'
import { Navigate } from 'react-router-dom'

/** Role-aware home: SuperAdmin/Admin staff dashboard; Distributor sees their own. */
export default function Dashboard() {
  const { role } = useAuth()
  if (role === 'Retailer') return <Navigate to="/use-mobile-app" replace />
  if (role === 'Distributor') return <DistributorDashboard />
  return <SuperAdminDashboard />
}
