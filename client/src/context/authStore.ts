import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type UserRole = 'SuperAdmin' | 'Admin' | 'RegionalHead' | 'Distributor' | 'Retailer'

interface AuthState {
  token: string | null
  userName: string | null
  role: UserRole | null
  requiresCorrection: boolean
  approvalRemarks: string | null
  profileId: string | null
  setAuth: (
    token: string,
    userName: string,
    role: UserRole,
    opts?: { requiresCorrection?: boolean; approvalRemarks?: string | null; profileId?: string | null }
  ) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      userName: null,
      role: null,
      requiresCorrection: false,
      approvalRemarks: null,
      profileId: null,
      setAuth: (token, userName, role, opts) =>
        set({
          token,
          userName,
          role,
          requiresCorrection: opts?.requiresCorrection ?? false,
          approvalRemarks: opts?.approvalRemarks ?? null,
          profileId: opts?.profileId ?? null
        }),
      logout: () =>
        set({
          token: null,
          userName: null,
          role: null,
          requiresCorrection: false,
          approvalRemarks: null,
          profileId: null
        })
    }),
    { name: 'paksuzuki-auth' }
  )
)
