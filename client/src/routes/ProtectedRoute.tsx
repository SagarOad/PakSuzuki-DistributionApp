import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

interface Props {
  allowedRoles?: string[]
}

export default function ProtectedRoute({ allowedRoles }: Props) {
  const { isAuthenticated, role, requiresCorrection } = useAuth()

  if (!isAuthenticated) return <Navigate to="/login" replace />

  // Retailers may use the web only to correct a sent-back registration.
  if (role === 'Retailer' && !requiresCorrection) {
    return <Navigate to="/use-mobile-app" replace />
  }

  if (requiresCorrection) return <Navigate to="/correct-registration" replace />
  if (allowedRoles && role && !allowedRoles.includes(role)) return <Navigate to="/" replace />

  return <Outlet />
}
