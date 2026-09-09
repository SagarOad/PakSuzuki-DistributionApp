import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/api/axiosClient'
import { useAuthStore } from '@/context/authStore'
import { SuzukiLogo, EcstarLogo } from '@/components/brand/Logos'
import ImageUploadFields from '@/components/forms/ImageUploadFields'
import ImageGallery from '@/components/ui/ImageGallery'
import PlaceholderImage from '@/components/ui/PlaceholderImage'
import axios from 'axios'

interface ProfilePhotos {
  profileImageUrl?: string | null
  images?: { id: string; storageUrl: string; fileName: string }[]
}

interface RetailerProfile extends ProfilePhotos {
  id: string
  name: string
  mobileNumber: string
  email: string
  businessName: string
  ntn: string
  iban: string
  businessAddress: string
  latitude: number
  longitude: number
  approvalRemarks?: string
  distributorApprovalStatus: string
  superAdminApprovalStatus: string
}

interface DistributorProfile extends ProfilePhotos {
  id: string
  name: string
  mobileNumber: string
  email: string
  businessName: string
  ntn: string
  iban: string
  businessAddress: string
  latitude: number
  longitude: number
  approvalRemarks?: string
  approvalStatus: string
}

/** Shown when login returns requiresCorrection=true (sent back for correction). */
export default function RegistrationCorrectionPage() {
  const navigate = useNavigate()
  const { role, profileId, approvalRemarks, logout, token, userName } = useAuthStore()
  const isRetailer = role === 'Retailer'
  const isDistributor = role === 'Distributor'

  const [form, setForm] = useState({
    name: '',
    mobileNumber: '',
    email: '',
    businessName: '',
    ntn: '',
    iban: '',
    businessAddress: '',
    latitude: 0,
    longitude: 0
  })
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newProfileImage, setNewProfileImage] = useState<File | null>(null)
  const [newBusinessImages, setNewBusinessImages] = useState<File[]>([])

  const profileQuery = useQuery({
    queryKey: ['correction-profile', role, profileId],
    enabled: !!profileId && (isRetailer || isDistributor),
    queryFn: async () => {
      if (isRetailer) return (await api.get<RetailerProfile>(`/retailers/${profileId}`)).data
      return (await api.get<DistributorProfile>(`/distributors/${profileId}`)).data
    }
  })

  useEffect(() => {
    const p = profileQuery.data
    if (!p) return
    setForm({
      name: p.name,
      mobileNumber: p.mobileNumber,
      email: p.email,
      businessName: p.businessName,
      ntn: p.ntn,
      iban: p.iban,
      businessAddress: p.businessAddress,
      latitude: p.latitude,
      longitude: p.longitude
    })
  }, [profileQuery.data])

  const saveAndResubmit = useMutation({
    mutationFn: async () => {
      if (!profileId) throw new Error('Missing profile id')
      const scope = isRetailer ? 'retailers' : 'distributors'

      await api.put(`/${scope}/${profileId}`, form)

      if (newProfileImage) {
        const body = new FormData()
        body.append('file', newProfileImage)
        await api.post(`/${scope}/profile-image/${profileId}`, body)
      }

      if (newBusinessImages.length > 0) {
        const body = new FormData()
        newBusinessImages.forEach((file) => body.append('files', file))
        await api.post(`/${scope}/business-images/${profileId}`, body)
      }

      await api.post(`/${scope}/resubmit/${profileId}`)
    },
    onSuccess: () => {
      setMessage('Details updated and resubmitted for review. You will be signed out — login works again after approval.')
      setTimeout(() => {
        logout()
        navigate('/login')
      }, 2500)
    },
    onError: (err) => {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.title ?? 'Failed to resubmit. Please try again.')
      } else {
        setError('Failed to resubmit. Please try again.')
      }
    }
  })

  if (!token || (!isRetailer && !isDistributor)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <button type="button" className="text-suzuki-blue font-bold" onClick={() => navigate('/login')}>
          Sign in
        </button>
      </div>
    )
  }

  const remarks = approvalRemarks || profileQuery.data?.approvalRemarks

  return (
    <div className="min-h-screen flex flex-col bg-suzuki-mist">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 bg-white border-b border-suzuki-line">
        <SuzukiLogo className="h-7 max-w-[100px] sm:h-9 sm:max-w-[140px]" />
        <EcstarLogo className="hidden sm:block h-7 max-w-[120px] sm:h-9 sm:max-w-[140px]" />
      </div>

      <div className="flex-1 max-w-2xl w-full mx-auto px-4 py-8">
        <h1 className="text-2xl font-extrabold text-suzuki-navy">Correct your registration</h1>
        <p className="text-sm text-suzuki-mute mt-1 mb-4">
          Signed in as {userName}. Update the fields below, then resubmit for review.
        </p>

        {remarks && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div className="font-bold mb-1">Reviewer remarks</div>
            {remarks}
          </div>
        )}

        {profileQuery.isLoading && <p className="text-sm text-suzuki-mute">Loading your details…</p>}

        {!profileQuery.isLoading && (
          <form
            className="bg-white rounded-2xl border border-suzuki-line shadow-card p-6 space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              setError(null)
              setMessage(null)
              saveAndResubmit.mutate()
            }}
          >
            {(
              [
                ['name', 'Name'],
                ['mobileNumber', 'Mobile'],
                ['email', 'Email'],
                ['businessName', 'Business Name'],
                ['ntn', 'NTN'],
                ['iban', 'IBAN'],
                ['businessAddress', 'Business Address']
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label className="block text-xs font-bold text-suzuki-mute mb-1">{label}</label>
                <input
                  className="w-full rounded-xl border border-suzuki-line px-3 py-2.5 text-sm"
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  required
                />
              </div>
            ))}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-suzuki-mute mb-1">Latitude</label>
                <input
                  type="number"
                  step="any"
                  className="w-full rounded-xl border border-suzuki-line px-3 py-2.5 text-sm"
                  value={form.latitude}
                  onChange={(e) => setForm((f) => ({ ...f, latitude: Number(e.target.value) }))}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-suzuki-mute mb-1">Longitude</label>
                <input
                  type="number"
                  step="any"
                  className="w-full rounded-xl border border-suzuki-line px-3 py-2.5 text-sm"
                  value={form.longitude}
                  onChange={(e) => setForm((f) => ({ ...f, longitude: Number(e.target.value) }))}
                  required
                />
              </div>
            </div>

            <div className="rounded-xl border border-suzuki-line p-4 space-y-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-suzuki-mute mb-2">
                  Photos you submitted
                </div>
                <div className="flex items-start gap-4">
                  <PlaceholderImage
                    src={profileQuery.data?.profileImageUrl}
                    alt="Current profile photo"
                    className="h-16 w-16 shrink-0 rounded-xl border border-suzuki-line bg-suzuki-mist"
                    imgClassName="h-full w-full object-cover"
                  />
                  <div className="flex-1">
                    <ImageGallery
                      images={profileQuery.data?.images ?? []}
                      emptyText="No shop photos on file."
                      placeholders={3}
                      className="grid-cols-3 sm:grid-cols-5"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-suzuki-line pt-4">
                <div className="text-xs font-bold uppercase tracking-wide text-suzuki-mute mb-3">
                  Add clearer photos (optional)
                </div>
                <ImageUploadFields
                  profileImage={newProfileImage}
                  businessImages={newBusinessImages}
                  onProfileChange={setNewProfileImage}
                  onBusinessChange={setNewBusinessImages}
                  businessHint="New shop photos are added to the ones above before your application is reviewed again."
                  businessRequired={false}
                />
              </div>
            </div>

            {error && <p className="text-sm text-suzuki-red font-medium">{error}</p>}
            {message && <p className="text-sm text-suzuki-ok font-medium">{message}</p>}

            <button
              type="submit"
              disabled={saveAndResubmit.isPending}
              className="w-full rounded-xl bg-suzuki-navy text-white font-bold py-3 disabled:opacity-60"
            >
              {saveAndResubmit.isPending ? 'Submitting…' : 'Save & Resubmit for Review'}
            </button>

            <button
              type="button"
              onClick={() => { logout(); navigate('/login') }}
              className="w-full text-sm text-suzuki-mute font-semibold py-2"
            >
              Sign out
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
