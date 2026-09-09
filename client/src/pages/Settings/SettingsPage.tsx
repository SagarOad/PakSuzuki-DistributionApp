import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Eye, EyeOff, FileText, Layers, LogOut, Package, Pencil, ShoppingBag, UserRound
} from 'lucide-react'
import clsx from 'clsx'
import { api } from '@/api/axiosClient'
import { useAuth } from '@/context/AuthContext'
import { useAuthStore } from '@/context/authStore'
import PlaceholderImage from '@/components/ui/PlaceholderImage'
import type { CatalogLookups } from '@/pages/Products/productWizardTypes'
import ProductGroupsPage from '@/pages/Incentives/ProductGroupsPage'

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

interface DistributorBiz {
  id: string
  name: string
  cnic: string
  mobileNumber: string
  email: string
  businessName: string
  ntn: string
  iban: string
  businessAddress: string
  regionName: string
  latitude: number
  longitude: number
  profileImageUrl?: string | null
  images: { id: string; storageUrl: string; fileName: string }[]
}

type SettingsTab = 'profile' | 'privacy' | 'refund' | 'threshold' | 'product-groups'

export default function SettingsPage() {
  const { logout, role: authRole } = useAuth()
  const isStaff = authRole === 'SuperAdmin' || authRole === 'Admin'
  const isDistributor = authRole === 'Distributor'
  const profileId = useAuthStore((s) => s.profileId)
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const token = useAuthStore((s) => s.token)
  const role = useAuthStore((s) => s.role)
  const qc = useQueryClient()

  const [tab, setTab] = useState<SettingsTab>('profile')
  const [showPassword, setShowPassword] = useState(false)
  const [showPhone, setShowPhone] = useState(true)

  const profileQuery = useQuery({
    queryKey: ['settings-profile'],
    queryFn: async () => (await api.get<Profile>('/settings/profile')).data
  })

  const bizQuery = useQuery({
    queryKey: ['settings-distributor', profileId],
    enabled: isDistributor && !!profileId,
    queryFn: async () => (await api.get<DistributorBiz>(`/distributors/${profileId}`)).data
  })

  const thresholdQuery = useQuery({
    queryKey: ['ship-threshold'],
    enabled: tab === 'threshold' && isStaff,
    queryFn: async () => (await api.get<SettingDto>('/settings/ship-to-party-threshold')).data
  })

  const whtQuery = useQuery({
    queryKey: ['wht-percent'],
    enabled: tab === 'threshold' && isStaff,
    queryFn: async () => (await api.get<SettingDto>('/settings/wht-percent')).data
  })

  const catalogQuery = useQuery({
    queryKey: ['master-catalog-lookups'],
    enabled: tab === 'threshold' && isStaff,
    queryFn: async () => (await api.get<CatalogLookups>('/master-catalog/lookups')).data
  })

  const [userName, setUserName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [cnic, setCnic] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [ntn, setNtn] = useState('')
  const [iban, setIban] = useState('')
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null)
  const [threshold, setThreshold] = useState('')
  const [editingThreshold, setEditingThreshold] = useState(false)
  const [whtPercent, setWhtPercent] = useState('')
  const [editingWht, setEditingWht] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const profileFileRef = useRef<HTMLInputElement>(null)
  const businessFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const p = profileQuery.data
    if (!p) return
    setUserName(p.userName)
    setEmail(p.email)
    setPhone(p.phoneNumber ?? '')
  }, [profileQuery.data])

  useEffect(() => {
    const b = bizQuery.data
    if (!b) return
    setUserName(b.name || userName)
    setCnic(b.cnic)
    setEmail(b.email || email)
    setPhone(b.mobileNumber || phone)
    setBusinessName(b.businessName)
    setNtn(b.ntn)
    setIban(b.iban)
    setCity(b.regionName)
    setAddress(b.businessAddress)
    setProfileImageUrl(b.profileImageUrl ?? null)
  }, [bizQuery.data])

  const uploadProfileImage = useMutation({
    mutationFn: async (file: File) => {
      if (!profileId) throw new Error('Missing profile id')
      const form = new FormData()
      form.append('file', file)
      const { data } = await api.post<{ url: string }>(`/distributors/profile-image/${profileId}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      return data.url
    },
    onSuccess: (url) => {
      setProfileImageUrl(url)
      setMessage('Profile image uploaded.')
      setError(null)
      void qc.invalidateQueries({ queryKey: ['settings-distributor'] })
    },
    onError: () => setError('Could not upload profile image.')
  })

  const uploadBusinessImages = useMutation({
    mutationFn: async (files: FileList) => {
      if (!profileId) throw new Error('Missing profile id')
      const form = new FormData()
      Array.from(files).forEach((f) => form.append('files', f))
      const { data } = await api.post<{ urls: string[] }>(`/distributors/business-images/${profileId}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      return data.urls
    },
    onSuccess: () => {
      setMessage('Business images uploaded.')
      setError(null)
      void qc.invalidateQueries({ queryKey: ['settings-distributor'] })
    },
    onError: () => setError('Could not upload business images.')
  })

  useEffect(() => {
    if (thresholdQuery.data) {
      const n = Number(thresholdQuery.data.value)
      setThreshold(Number.isNaN(n) ? thresholdQuery.data.value : n.toLocaleString('en-PK'))
    }
  }, [thresholdQuery.data])

  useEffect(() => {
    if (whtQuery.data) {
      setWhtPercent(whtQuery.data.value)
    }
  }, [whtQuery.data])

  const saveProfile = useMutation({
    mutationFn: async () => {
      await api.put('/settings/profile', {
        userName,
        email,
        phoneNumber: phone || null,
        newPassword: password || null
      })
      if (isDistributor && profileId) {
        await api.put(`/distributors/${profileId}`, {
          name: userName,
          mobileNumber: phone,
          email,
          businessName,
          ntn,
          iban,
          businessAddress: address,
          latitude: bizQuery.data?.latitude ?? 0,
          longitude: bizQuery.data?.longitude ?? 0
        })
      }
    },
    onSuccess: () => {
      setPassword('')
      setError(null)
      setMessage(isDistributor ? 'Edit request / profile saved.' : 'Profile updated.')
      if (token && role) setAuth(token, userName, role, { profileId })
      void qc.invalidateQueries({ queryKey: ['settings-profile'] })
      void qc.invalidateQueries({ queryKey: ['settings-distributor'] })
    },
    onError: (e: unknown) => {
      setMessage(null)
      setError((e as { response?: { data?: { title?: string; message?: string } } })?.response?.data?.title
        ?? (e as { response?: { data?: { message?: string } } })?.response?.data?.message
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

  const saveWht = useMutation({
    mutationFn: async () => {
      const percent = Number(String(whtPercent).replace(/%/g, '').trim())
      if (Number.isNaN(percent) || percent < 0 || percent > 100) {
        throw new Error('Enter a valid WHT percent between 0 and 100.')
      }
      await api.put('/settings/wht-percent', { percent })
    },
    onSuccess: () => {
      setEditingWht(false)
      setError(null)
      setMessage('WHT (Advance Income Tax) percent saved.')
      void qc.invalidateQueries({ queryKey: ['wht-percent'] })
    },
    onError: (e: unknown) => {
      setMessage(null)
      setError((e as { message?: string; response?: { data?: { title?: string; message?: string } } })?.response?.data?.title
        ?? (e as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? (e as Error)?.message
        ?? 'Could not save WHT percent.')
    }
  })

  const onLogout = () => {
    logout()
    navigate('/login')
  }

  const bizImages = bizQuery.data?.images ?? []
  const imageSlots = [0, 1, 2, 3].map((i) => bizImages[i]?.storageUrl ?? null)

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-suzuki-line shadow-card overflow-hidden min-h-[560px] grid grid-cols-1 lg:grid-cols-[240px_1fr]">
        <aside className="border-b lg:border-b-0 lg:border-r border-suzuki-line p-5 space-y-2">
          <h1 className="text-xl font-extrabold text-suzuki-navy mb-4">Settings</h1>
          <SideItem
            active={tab === 'profile'}
            icon={<UserRound size={18} />}
            label={isDistributor ? 'Profile' : 'General'}
            onClick={() => { setTab('profile'); setMessage(null); setError(null) }}
          />
          {isDistributor && (
            <>
              <SideItem
                active={tab === 'privacy'}
                icon={<FileText size={18} />}
                label="Privacy Policy"
                onClick={() => { setTab('privacy'); setMessage(null); setError(null) }}
              />
              <SideItem
                active={tab === 'refund'}
                icon={<Package size={18} />}
                label="Refund Policy"
                onClick={() => { setTab('refund'); setMessage(null); setError(null) }}
              />
            </>
          )}
          {isStaff && (
            <>
              <SideItem
                active={tab === 'threshold'}
                icon={<ShoppingBag size={18} />}
                label="Tax & Thresholds"
                onClick={() => { setTab('threshold'); setMessage(null); setError(null) }}
              />
              <SideItem
                active={tab === 'product-groups'}
                icon={<Layers size={18} />}
                label="Product groups"
                onClick={() => { setTab('product-groups'); setMessage(null); setError(null) }}
              />
            </>
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

          {tab === 'profile' && (
            <div className="space-y-8 max-w-4xl">
              <h2 className="text-xl font-extrabold text-suzuki-navy">Profile Information</h2>

              <div className="flex flex-col sm:flex-row gap-5 items-start">
                <div className="space-y-2 shrink-0">
                  <PlaceholderImage
                    src={profileImageUrl}
                    className="h-32 w-32 rounded-xl border border-suzuki-line bg-white"
                    imgClassName="h-full w-full object-contain p-3"
                    alt="Profile"
                  />
                  {isDistributor && (
                    <>
                      <input
                        ref={profileFileRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) uploadProfileImage.mutate(f)
                          e.target.value = ''
                        }}
                      />
                      <div className="flex gap-3 text-sm font-bold text-suzuki-red">
                        <button
                          type="button"
                          className="hover:underline disabled:opacity-50"
                          disabled={uploadProfileImage.isPending}
                          onClick={() => profileFileRef.current?.click()}
                        >
                          {uploadProfileImage.isPending ? 'Uploading…' : 'Upload Photo'}
                        </button>
                        {profileImageUrl && (
                          <button
                            type="button"
                            className="hover:underline text-suzuki-mute"
                            onClick={() => setProfileImageUrl(null)}
                          >
                            Remove Photo
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                  <Field label="User Name" value={userName} onChange={setUserName} />
                  {isDistributor && <Field label="CNIC" value={cnic} onChange={setCnic} />}
                  <Field label="Email" value={email} onChange={setEmail} />
                  <label className="block space-y-1.5">
                    <span className="text-sm font-bold text-suzuki-navy">Password</span>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Leave blank to keep"
                        className="w-full rounded-xl border border-suzuki-line bg-white px-3.5 py-2.5 pr-10 text-sm outline-none focus:border-suzuki-blue"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-suzuki-mute"
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-sm font-bold text-suzuki-navy">Phone</span>
                    <div className="relative">
                      <input
                        type={showPhone ? 'text' : 'password'}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full rounded-xl border border-suzuki-line bg-white px-3.5 py-2.5 pr-10 text-sm outline-none focus:border-suzuki-blue"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-suzuki-mute"
                        onClick={() => setShowPhone((v) => !v)}
                      >
                        {showPhone ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </label>
                </div>
              </div>

              {isDistributor && (
                <div className="space-y-4 border-t border-suzuki-line pt-6">
                  <h3 className="text-lg font-extrabold text-suzuki-navy">Business Profile Details:</h3>
                  <div className="flex flex-wrap gap-3 items-center">
                    {imageSlots.map((url, i) => (
                      <PlaceholderImage
                        key={i}
                        src={url}
                        alt={`Business ${i + 1}`}
                        className="h-20 w-20 rounded-xl border border-suzuki-line bg-white"
                        imgClassName="h-full w-full object-contain p-1.5"
                      />
                    ))}
                    <input
                      ref={businessFileRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.length) uploadBusinessImages.mutate(e.target.files)
                        e.target.value = ''
                      }}
                    />
                    <button
                      type="button"
                      disabled={uploadBusinessImages.isPending}
                      onClick={() => businessFileRef.current?.click()}
                      className="h-20 w-20 rounded-xl border border-dashed border-suzuki-red/50 text-suzuki-red text-xs font-bold hover:bg-rose-50 disabled:opacity-50"
                    >
                      {uploadBusinessImages.isPending ? '…' : '+ Add'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Business Name" value={businessName} onChange={setBusinessName} />
                    <Field label="NTN Number" value={ntn} onChange={setNtn} />
                    <Field label="IBAN" value={iban} onChange={setIban} />
                    <Field label="City" value={city} onChange={setCity} />
                    <div className="sm:col-span-2">
                      <Field label="Address" value={address} onChange={setAddress} />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (profileQuery.data) {
                      setUserName(profileQuery.data.userName)
                      setEmail(profileQuery.data.email)
                      setPhone(profileQuery.data.phoneNumber ?? '')
                      setPassword('')
                    }
                    if (bizQuery.data) {
                      setCnic(bizQuery.data.cnic)
                      setBusinessName(bizQuery.data.businessName)
                      setNtn(bizQuery.data.ntn)
                      setIban(bizQuery.data.iban)
                      setCity(bizQuery.data.regionName)
                      setAddress(bizQuery.data.businessAddress)
                    }
                  }}
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
                  {isDistributor ? 'REQUEST EDIT' : 'UPDATE'}
                </button>
              </div>
            </div>
          )}

          {tab === 'privacy' && (
            <PolicyPanel title="Privacy Policy">
              Pakistan Suzuki respects your privacy. Personal and business information collected through this portal
              is used only to operate the distribution network, process orders, and meet regulatory requirements.
              We do not sell your data to third parties. Contact your regional office for data access or deletion requests.
            </PolicyPanel>
          )}

          {tab === 'refund' && (
            <PolicyPanel title="Refund Policy">
              Order cancellations and returns follow the commercial terms agreed with your assigned Pak Suzuki
              counterpart. Approved claims and incentive payouts are processed per the active program rules.
              For disputes, open a claim from My Orders / Claims or contact Pakistan Suzuki support.
            </PolicyPanel>
          )}

          {tab === 'product-groups' && isStaff && (
            <ProductGroupsPage embedded />
          )}

          {tab === 'threshold' && isStaff && (
            <div className="space-y-8 max-w-3xl">
              <div className="space-y-6">
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

              <div className="space-y-6 border-t border-suzuki-line pt-6">
                <h2 className="text-xl font-extrabold text-suzuki-navy">WHT (Advance Income Tax)</h2>
                <p className="text-sm text-suzuki-mute">
                  Applied once on the order subtotal for every new order — not per product.
                </p>
                <div>
                  <div className="text-sm font-bold text-suzuki-blue mb-2">System WHT percent (%)</div>
                  <div className="flex items-center gap-2">
                    <input
                      value={whtPercent}
                      onChange={(e) => setWhtPercent(e.target.value)}
                      disabled={!editingWht}
                      className="flex-1 rounded-xl border border-sky-100 bg-sky-50 px-3.5 py-2.5 text-sm font-semibold text-suzuki-navy outline-none focus:border-suzuki-blue disabled:opacity-80"
                    />
                    <button
                      type="button"
                      onClick={() => setEditingWht(true)}
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
                      setEditingWht(false)
                      if (whtQuery.data) setWhtPercent(whtQuery.data.value)
                    }}
                    className="rounded-xl bg-sky-100 text-suzuki-navy font-bold px-6 py-2.5"
                  >
                    CANCEL
                  </button>
                  <button
                    type="button"
                    disabled={saveWht.isPending || !editingWht}
                    onClick={() => saveWht.mutate()}
                    className="rounded-xl bg-suzuki-red text-white font-bold px-6 py-2.5 disabled:opacity-50"
                  >
                    SAVE
                  </button>
                </div>
              </div>

              {catalogQuery.data && (
                <CatalogRulesPanel
                  lookups={catalogQuery.data}
                  onSaved={() => {
                    setMessage('Catalog rule saved.')
                    setError(null)
                    void qc.invalidateQueries({ queryKey: ['master-catalog-lookups'] })
                  }}
                  onError={(msg) => {
                    setMessage(null)
                    setError(msg)
                  }}
                />
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function CatalogRulesPanel({
  lookups,
  onSaved,
  onError
}: {
  lookups: CatalogLookups
  onSaved: () => void
  onError: (message: string) => void
}) {
  const [taxDrafts, setTaxDrafts] = useState(
    Object.fromEntries(lookups.taxRules.map((t) => [t.id, { rate: String(t.rate), appliesTo: t.appliesTo }]))
  )
  const [thresholdDrafts, setThresholdDrafts] = useState(
    Object.fromEntries(lookups.deliveryThresholds.map((t) => [t.id, String(t.quantityThreshold)]))
  )

  useEffect(() => {
    setTaxDrafts(Object.fromEntries(lookups.taxRules.map((t) => [t.id, { rate: String(t.rate), appliesTo: t.appliesTo }])))
    setThresholdDrafts(Object.fromEntries(lookups.deliveryThresholds.map((t) => [t.id, String(t.quantityThreshold)])))
  }, [lookups])

  const saveTax = useMutation({
    mutationFn: async (id: string) => {
      const draft = taxDrafts[id]
      const rate = Number(draft.rate)
      if (Number.isNaN(rate) || rate < 0 || rate > 1) throw new Error('Rate must be a fraction between 0 and 1 (0.18 = 18%).')
      await api.put(`/master-catalog/tax-rules/${id}`, { rate, appliesTo: draft.appliesTo, isActive: true })
    },
    onSuccess: onSaved,
    onError: (e: unknown) => onError((e as Error).message || 'Could not save tax rule.')
  })

  const saveThreshold = useMutation({
    mutationFn: async (id: string) => {
      const row = lookups.deliveryThresholds.find((t) => t.id === id)
      if (!row) throw new Error('Threshold not found.')
      const quantity = Number(thresholdDrafts[id])
      if (Number.isNaN(quantity) || quantity <= 0) throw new Error('Enter a quantity greater than 0.')
      await api.post('/master-catalog/thresholds', {
        id: row.id,
        categoryId: row.categoryId,
        distributorId: row.distributorId,
        unit: row.unit,
        quantityThreshold: quantity,
        approverRoles: row.approverRoles,
        isActive: true
      })
    },
    onSuccess: onSaved,
    onError: (e: unknown) => onError((e as Error).message || 'Could not save threshold.')
  })

  return (
    <div className="space-y-8 border-t border-suzuki-line pt-6">
      <div className="space-y-3">
        <h2 className="text-xl font-extrabold text-suzuki-navy">Tax rules</h2>
        <p className="text-sm text-suzuki-mute">Rates are fractions (0.05 = 5%). Change these here — they are not hardcoded.</p>
        <div className="space-y-3">
          {lookups.taxRules.map((rule) => (
            <div key={rule.id} className="grid grid-cols-1 md:grid-cols-[7rem_8rem_1fr_auto] gap-2 items-end">
              <div>
                <div className="text-xs font-bold text-suzuki-mute uppercase">Code</div>
                <div className="field bg-suzuki-mist">{rule.code}</div>
              </div>
              <label>
                <span className="text-xs font-bold text-suzuki-mute uppercase">Rate</span>
                <input
                  className="field mt-1"
                  value={taxDrafts[rule.id]?.rate ?? ''}
                  onChange={(e) => setTaxDrafts((prev) => ({ ...prev, [rule.id]: { ...prev[rule.id], rate: e.target.value } }))}
                />
              </label>
              <label>
                <span className="text-xs font-bold text-suzuki-mute uppercase">Applies to</span>
                <input
                  className="field mt-1"
                  value={taxDrafts[rule.id]?.appliesTo ?? ''}
                  onChange={(e) => setTaxDrafts((prev) => ({ ...prev, [rule.id]: { ...prev[rule.id], appliesTo: e.target.value } }))}
                />
              </label>
              <button
                type="button"
                onClick={() => saveTax.mutate(rule.id)}
                className="rounded-xl bg-suzuki-red text-white font-bold px-4 py-2.5 text-sm"
              >
                Save
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-xl font-extrabold text-suzuki-navy">Direct-delivery thresholds</h2>
        <p className="text-sm text-suzuki-mute">
          Defaults are per category. You can later add a row per distributor — that value overrides the default.
        </p>
        <div className="space-y-3">
          {lookups.deliveryThresholds.map((row) => (
            <div key={row.id} className="grid grid-cols-1 md:grid-cols-[1fr_7rem_8rem_1fr_auto] gap-2 items-end">
              <div>
                <div className="text-xs font-bold text-suzuki-mute uppercase">Category</div>
                <div className="field bg-suzuki-mist">{row.categoryName}{row.distributorId ? ' (distributor)' : ' (default)'}</div>
              </div>
              <div>
                <div className="text-xs font-bold text-suzuki-mute uppercase">Unit</div>
                <div className="field bg-suzuki-mist">{row.unit}</div>
              </div>
              <label>
                <span className="text-xs font-bold text-suzuki-mute uppercase">Threshold</span>
                <input
                  className="field mt-1"
                  value={thresholdDrafts[row.id] ?? ''}
                  onChange={(e) => setThresholdDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                />
              </label>
              <div>
                <div className="text-xs font-bold text-suzuki-mute uppercase">Approvers</div>
                <div className="field bg-suzuki-mist">{row.approverRoles.join(', ')}</div>
              </div>
              <button
                type="button"
                onClick={() => saveThreshold.mutate(row.id)}
                className="rounded-xl bg-suzuki-red text-white font-bold px-4 py-2.5 text-sm"
              >
                Save
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function PolicyPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-4 max-w-3xl">
      <h2 className="text-xl font-extrabold text-suzuki-navy">{title}</h2>
      <p className="text-sm leading-relaxed text-suzuki-mute">{children}</p>
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
      <span className={clsx('flex h-7 w-7 items-center justify-center rounded-full', active ? 'bg-white/20' : 'bg-suzuki-mist')}>
        {icon}
      </span>
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
