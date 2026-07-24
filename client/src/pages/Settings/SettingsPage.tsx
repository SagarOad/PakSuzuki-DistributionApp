import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LogOut, Pencil, ShoppingBag, UserRound } from 'lucide-react'
import clsx from 'clsx'
import { api } from '@/api/axiosClient'
import { useAuth } from '@/context/AuthContext'
import { useAuthStore } from '@/context/authStore'
import { SuzukiLogo } from '@/components/brand/Logos'

interface Profile {
  id: string
  userName: string
  email: string
  phoneNumber?: string | null
  role: string
}

interface SettingDto {
  key: string
  value: string
}

type SettingsTab = 'general' | 'threshold'

export default function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('general')
  const { logout, role: authRole } = useAuth()
  const isStaff = authRole === 'SuperAdmin' || authRole === 'Admin'
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const token = useAuthStore((s) => s.token)
  const role = useAuthStore((s) => s.role)
  const qc = useQueryClient()

  const profileQuery = useQuery({
    queryKey: ['settings-profile'],
    queryFn: async () => (await api.get<Profile>('/settings/profile')).data
  })

  const thresholdQuery = useQuery({
    queryKey: ['ship-threshold'],
    enabled: tab === 'threshold',
    queryFn: async () => (await api.get<SettingDto>('/settings/ship-to-party-threshold')).data
  })

  const [userName, setUserName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [threshold, setThreshold] = useState('')
  const [editingThreshold, setEditingThreshold] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const p = profileQuery.data
    if (!p) return
    setUserName(p.userName)
    setEmail(p.email)
    setPhone(p.phoneNumber ?? '')
  }, [profileQuery.data])

  useEffect(() => {
    if (thresholdQuery.data) {
      const n = Number(thresholdQuery.data.value)
      setThreshold(Number.isNaN(n) ? thresholdQuery.data.value : n.toLocaleString('en-PK'))
    }
  }, [thresholdQuery.data])

  const saveProfile = useMutation({
    mutationFn: async () =>
      api.put('/settings/profile', {
        userName,
        email,
        phoneNumber: phone || null,
        newPassword: password || null
      }),
    onSuccess: () => {
      setPassword('')
      setError(null)
      setMessage('Profile updated.')
      if (token && role) setAuth(token, userName, role)
      void qc.invalidateQueries({ queryKey: ['settings-profile'] })
    },
    onError: (e: unknown) => {
      setMessage(null)
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Could not update profile.')
    }
  })

  const saveThreshold = useMutation({
    mutationFn: async () => {
      const amount = Number(String(threshold).replace(/,/g, ''))
      if (Number.isNaN(amount) || amount < 0) throw new Error('Enter a valid threshold amount.')
      await api.put('/settings/ship-to-party-threshold', { amount })
    },
    onSuccess: () => {
      setEditingThreshold(false)
      setError(null)
      setMessage('Order threshold saved.')
      void qc.invalidateQueries({ queryKey: ['ship-threshold'] })
    },
    onError: (e: unknown) => {
      setMessage(null)
      setError((e as { message?: string; response?: { data?: { message?: string } } })?.response?.data?.message
        ?? (e as Error)?.message
        ?? 'Could not save threshold.')
    }
  })

  const onLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-suzuki-line shadow-card overflow-hidden min-h-[560px] grid grid-cols-1 lg:grid-cols-[240px_1fr]">
        <aside className="border-b lg:border-b-0 lg:border-r border-suzuki-line p-5 space-y-2">
          <h1 className="text-xl font-extrabold text-suzuki-navy mb-4">Settings</h1>
          <SideItem
            active={tab === 'general'}
            icon={<UserRound size={18} />}
            label="General"
            onClick={() => { setTab('general'); setMessage(null); setError(null) }}
          />
          {isStaff && (
            <SideItem
              active={tab === 'threshold'}
              icon={<ShoppingBag size={18} />}
              label="Order Threshold"
              onClick={() => { setTab('threshold'); setMessage(null); setError(null) }}
            />
          )}
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold text-suzuki-navy hover:bg-suzuki-mist mt-2"
          >
            <LogOut size={18} /> Logout
          </button>
        </aside>

        <section className="p-5 sm:p-8">
          {message && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div>}
          {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

          {tab === 'general' && (
            <div className="space-y-6 max-w-3xl">
              <h2 className="text-xl font-extrabold text-suzuki-navy">Profile Information</h2>

              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <div className="h-28 w-28 rounded-xl border border-suzuki-line bg-white flex items-center justify-center overflow-hidden p-2">
                  <SuzukiLogo className="h-16" />
                </div>
                <div className="flex gap-4 text-sm font-bold text-suzuki-red pt-2">
                  <button type="button" className="hover:underline">Upload Photo</button>
                  <button type="button" className="hover:underline">Remove Photo</button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="User Name" value={userName} onChange={setUserName} />
                <Field label="Password" value={password} onChange={setPassword} type="password" placeholder="Leave blank to keep" />
                <Field label="Email" value={email} onChange={setEmail} />
                <Field label="Phone Number" value={phone} onChange={setPhone} />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => profileQuery.data && (
                    setUserName(profileQuery.data.userName),
                    setEmail(profileQuery.data.email),
                    setPhone(profileQuery.data.phoneNumber ?? ''),
                    setPassword('')
                  )}
                  className="rounded-xl bg-sky-100 text-suzuki-navy font-bold px-6 py-2.5"
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  disabled={saveProfile.isPending}
                  onClick={() => saveProfile.mutate()}
                  className="rounded-xl bg-suzuki-red text-white font-bold px-6 py-2.5 disabled:opacity-50"
                >
                  UPDATE
                </button>
              </div>
            </div>
          )}

          {tab === 'threshold' && (
            <div className="space-y-6 max-w-xl">
              <h2 className="text-xl font-extrabold text-suzuki-navy">Order Threshold</h2>
              <div>
                <div className="text-sm font-bold text-suzuki-blue mb-2">
                  Threshold Amount Per Order For Ship To Party
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    disabled={!editingThreshold}
                    className="flex-1 rounded-xl border border-sky-100 bg-sky-50 px-3.5 py-2.5 text-sm font-semibold text-suzuki-navy outline-none focus:border-suzuki-blue disabled:opacity-80"
                  />
                  <button
                    type="button"
                    onClick={() => setEditingThreshold(true)}
                    className="p-2 rounded-lg text-suzuki-blue hover:bg-suzuki-ice"
                    title="Edit"
                  >
                    <Pencil size={16} />
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingThreshold(false)
                    if (thresholdQuery.data) {
                      const n = Number(thresholdQuery.data.value)
                      setThreshold(Number.isNaN(n) ? thresholdQuery.data.value : n.toLocaleString('en-PK'))
                    }
                  }}
                  className="rounded-xl bg-sky-100 text-suzuki-navy font-bold px-6 py-2.5"
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  disabled={saveThreshold.isPending || !editingThreshold}
                  onClick={() => saveThreshold.mutate()}
                  className="rounded-xl bg-suzuki-red text-white font-bold px-6 py-2.5 disabled:opacity-50"
                >
                  SAVE
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function SideItem({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors',
        active ? 'bg-suzuki-red text-white' : 'text-suzuki-navy hover:bg-suzuki-mist'
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-bold text-suzuki-navy">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-suzuki-line bg-white px-3.5 py-2.5 text-sm outline-none focus:border-suzuki-blue"
      />
    </label>
  )
}
