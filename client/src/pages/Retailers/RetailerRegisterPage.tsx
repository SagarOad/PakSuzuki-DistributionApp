import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Search } from 'lucide-react'
import { api } from '@/api/axiosClient'
import { BrandPair } from '@/components/brand/Logos'
import LocationPickerMap, { type LatLng } from '@/components/maps/LocationPickerMap'

interface NearestDistributor {
  id: string
  distributorCode: string
  name: string
  businessName: string
  regionName: string
  businessAddress: string
  latitude: number
  longitude: number
  distanceKm: number
  rank: number
}

const emptyForm = {
  name: '',
  cnic: '',
  mobileNumber: '',
  email: '',
  password: '',
  confirmPassword: '',
  businessName: '',
  ntn: '',
  iban: '',
  businessAddress: ''
}

export default function RetailerRegisterPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState(emptyForm)
  const [location, setLocation] = useState<LatLng | null>(null)
  const [assigned, setAssigned] = useState<NearestDistributor | null>(null)
  const [findError, setFindError] = useState<string | null>(null)
  const [finding, setFinding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function setField<K extends keyof typeof emptyForm>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function formatCnic(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 13)
    if (digits.length <= 5) return digits
    if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`
    return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`
  }

  function onLocationChange(v: LatLng) {
    setLocation(v)
    setAssigned(null)
    setFindError(null)
  }

  async function findNearestDistributor() {
    setFindError(null)
    setAssigned(null)
    if (!location) {
      setFindError('Set your shop location on the map or via GPS first.')
      return
    }
    setFinding(true)
    try {
      const { data } = await api.get<NearestDistributor[]>('/distributors/nearest', {
        params: {
          latitude: location.latitude,
          longitude: location.longitude,
          take: 1
        }
      })
      if (!data?.length) {
        setFindError('No approved distributor found near this location. Try another pin or contact support.')
        return
      }
      setAssigned(data[0])
    } catch {
      setFindError('Could not find a distributor. Check your connection and try again.')
    } finally {
      setFinding(false)
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!location) {
      setError('Please set your shop location on the map or via GPS.')
      return
    }
    if (!assigned) {
      setError('Click “Find nearest distributor” to assign a distributor before submitting.')
      return
    }
    if (form.password !== form.confirmPassword) {
      setError('Password and confirmation do not match.')
      return
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    try {
      const { data } = await api.post<{
        id: string
        distributorId: string
        distributorName: string
        distanceKm?: number
      }>('/retailers/register', {
        name: form.name.trim(),
        cnic: form.cnic.trim(),
        mobileNumber: form.mobileNumber.trim(),
        email: form.email.trim(),
        password: form.password,
        businessName: form.businessName.trim(),
        ntn: form.ntn.trim(),
        iban: form.iban.trim(),
        businessAddress: form.businessAddress.trim(),
        latitude: location.latitude,
        longitude: location.longitude,
        distributorId: assigned.id
      })
      setSuccess(
        `Registration submitted and assigned to ${data.distributorName || assigned.businessName}. ` +
          'Your distributor and Pakistan Suzuki Super Admin will review your application. ' +
          'After approval, use the mobile app to sign in.'
      )
      setForm(emptyForm)
      setLocation(null)
      setAssigned(null)
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const data = err.response?.data as {
          title?: string
          detail?: string
          errors?: Record<string, string[]>
        } | undefined
        const first = data?.errors ? Object.values(data.errors).flat()[0] : null
        setError(first || data?.detail || data?.title || 'Registration failed. Check your details and try again.')
      } else {
        setError('Registration failed. Try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const assignedLabel = useMemo(() => {
    if (!assigned) return null
    return `${assigned.businessName} (${assigned.distanceKm.toFixed(1)} km)`
  }, [assigned])

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#070B18] text-white">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div
          className="absolute inset-0 bg-cover bg-right bg-no-repeat opacity-40 max-lg:opacity-25"
          style={{ backgroundImage: "url('/login-ecstar-oils.png')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#070B18] via-[#070B18]/95 to-[#070B18]/70" />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <BrandPair variant="light" />
        <h1 className="mt-10 text-3xl font-extrabold tracking-tight sm:text-4xl">Retailer registration</h1>
        <p className="mt-2 text-sm text-white/70 max-w-xl">
          Set your shop location, find the nearest distributor, then submit. After approval, use the mobile app.
        </p>

        <form
          onSubmit={onSubmit}
          className="mt-8 rounded-2xl border border-white/10 bg-white text-suzuki-ink shadow-card p-5 sm:p-8 space-y-6"
        >
          <Section title="Personal details">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full name *">
                <input className="field" required value={form.name} onChange={(e) => setField('name', e.target.value)} />
              </Field>
              <Field label="CNIC * (00000-0000000-0)">
                <input
                  className="field"
                  required
                  placeholder="42101-1234567-1"
                  value={form.cnic}
                  onChange={(e) => setField('cnic', formatCnic(e.target.value))}
                />
              </Field>
              <Field label="Mobile * (03xxxxxxxxx)">
                <input
                  className="field"
                  required
                  placeholder="03001234567"
                  value={form.mobileNumber}
                  onChange={(e) => setField('mobileNumber', e.target.value.replace(/\D/g, '').slice(0, 11))}
                />
              </Field>
              <Field label="Email (login) *">
                <input
                  className="field"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setField('email', e.target.value)}
                />
              </Field>
              <Field label="Password *">
                <input
                  className="field"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setField('password', e.target.value)}
                />
              </Field>
              <Field label="Confirm password *">
                <input
                  className="field"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={(e) => setField('confirmPassword', e.target.value)}
                />
              </Field>
            </div>
          </Section>

          <Section title="Business details">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Business name *">
                <input className="field" required value={form.businessName} onChange={(e) => setField('businessName', e.target.value)} />
              </Field>
              <Field label="NTN *">
                <input className="field" required value={form.ntn} onChange={(e) => setField('ntn', e.target.value)} />
              </Field>
              <Field label="IBAN *">
                <input className="field" required value={form.iban} onChange={(e) => setField('iban', e.target.value)} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Business address *">
                  <textarea
                    className="field min-h-[72px]"
                    required
                    value={form.businessAddress}
                    onChange={(e) => setField('businessAddress', e.target.value)}
                  />
                </Field>
              </div>
            </div>
          </Section>

          <Section title="Shop location & distributor *">
            <LocationPickerMap value={location} onChange={onLocationChange} className="h-72" />

            <div className="flex flex-col sm:flex-row gap-3 sm:items-center pt-1">
              <button
                type="button"
                onClick={findNearestDistributor}
                disabled={finding || !location}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-suzuki-navy/20 bg-suzuki-ice px-5 py-2.5 text-sm font-bold text-suzuki-navy hover:bg-white disabled:opacity-50"
              >
                <Search size={16} />
                {finding ? 'Finding…' : 'Find nearest distributor'}
              </button>
              {assignedLabel && (
                <p className="text-sm text-suzuki-ink">
                  Assigned: <span className="font-extrabold text-suzuki-navy">{assignedLabel}</span>
                </p>
              )}
            </div>
            {assigned && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <p className="font-bold">{assigned.businessName}</p>
                <p className="text-emerald-800/80 mt-0.5">
                  {assigned.name} · {assigned.regionName} · {assigned.distanceKm.toFixed(1)} km away
                </p>
                <p className="text-xs text-emerald-800/70 mt-1">{assigned.businessAddress}</p>
              </div>
            )}
            {findError && (
              <p className="text-sm font-medium text-suzuki-red">{findError}</p>
            )}
          </Section>

          {error && (
            <div className="rounded-xl border border-suzuki-red/30 bg-red-50 px-4 py-3 text-sm text-suzuki-red whitespace-pre-wrap">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 whitespace-pre-wrap">
              {success}
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="rounded-lg bg-suzuki-navy text-white text-xs font-bold px-4 py-2"
                >
                  Go to login
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between pt-2">
            <Link to="/login" className="text-sm font-semibold text-suzuki-blue hover:underline">
              Already registered? Sign in
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-suzuki-red px-8 py-3 text-sm font-bold text-white hover:bg-[#c50511] disabled:opacity-60"
            >
              {loading ? 'Submitting…' : 'Submit registration'}
            </button>
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-white/45">
          © Copyright {new Date().getFullYear()} Pakistan Suzuki
        </p>
      </div>

      <style>{`
        .field {
          width: 100%;
          border: 1px solid #E2E8F0;
          border-radius: 0.75rem;
          padding: 0.7rem 0.85rem;
          font-size: 0.875rem;
          color: #1A2B4A;
          background: white;
          outline: none;
        }
        .field:focus { border-color: #7EB6E8; box-shadow: 0 0 0 3px rgba(126,182,232,0.25); }
      `}</style>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-extrabold uppercase tracking-wide text-suzuki-navy border-b border-suzuki-line pb-2">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold text-suzuki-mute">{label}</span>
      {children}
    </label>
  )
}
