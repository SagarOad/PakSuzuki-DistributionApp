import { createContext, useContext, type ReactNode } from 'react'
import { useAuthStore } from './authStore'

interface AuthContextValue {
  isAuthenticated: boolean
  role: string | null
  userName: string | null
  requiresCorrection: boolean
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { token, role, userName, requiresCorrection, logout } = useAuthStore()
  const value: AuthContextValue = {
    isAuthenticated: !!token,
    role,
    userName,
    requiresCorrection,
    logout
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
