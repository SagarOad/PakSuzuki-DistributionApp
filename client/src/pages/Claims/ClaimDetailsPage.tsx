import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ImageIcon } from 'lucide-react'
import { api } from '@/api/axiosClient'
import { useAuth } from '@/context/AuthContext'
import {
  claimStatusLabel,
  formatClaimDate,
  locationLine,
  type ClaimDetail
} from './claimTypes'
import { ClaimStatusPill } from './ClaimsPage'

export default function ClaimDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { role } = useAuth()
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const canAct = role === 'SuperAdmin' || role === 'Admin'

  const detailQuery = useQuery({
    queryKey: ['claim-detail', id],
    enabled: !!id,
    queryFn: async () => (await api.get<ClaimDetail>(`/claims/${id}`)).data
  })

  const actionMutation = useMutation({
    mutationFn: async (decision: 'confirm' | 'cancel') =>
      api.post(`/claims/${id}/${decision}`, { remarks: null }),
    onSuccess: async () => {
      setError(null)
      await qc.invalidateQueries({ queryKey: ['claim-detail', id] })
      await qc.invalidateQueries({ queryKey: ['claims'] })
      await qc.invalidateQueries({ queryKey: ['claims-stats'] })
    },
    onError: (e: unknown) => {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Could not update claim.')
    }
  })

  const claim = detailQuery.data
  const inProcess = claim?.status === 'InProcess'

  if (detailQuery.isLoading) {
    return <p className="text-sm text-suzuki-mute py-16 text-center">Loading claim…</p>
  }

  if (detailQuery.isError || !claim) {
    return (
      <div className="py-16 text-center space-y-3">
        <p className="text-sm text-suzuki-mute">Claim not found or you do not have access.</p>
        <button type="button" onClick={() => navigate('/claims')} className="text-suzuki-blue font-semibold text-sm">
          Back to Claims
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold text-suzuki-navy">Claims Details</h1>
        <Link to="/claims" className="text-sm font-semibold text-suzuki-blue hover:underline">
          ← Back to list
        </Link>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="bg-white rounded-2xl border border-suzuki-line shadow-card p-5 space-y-4">
          <h2 className="text-xl font-extrabold text-suzuki-blue">
            Order Number : {claim.orderNumber ?? '—'}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Order Date" value={formatClaimDate(claim.createdAtUtc)} />
            <div>
              <Label>Claims Status</Label>
              <div className="mt-1">
                <ClaimStatusPill status={claim.status} />
              </div>
            </div>
          </div>

          <div className="border-t border-suzuki-line pt-4 space-y-3">
            <h3 className="font-bold text-suzuki-navy">Distributor Detail</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Distributor Name" value={claim.distributorName} />
              <Field label="Location" value={locationLine(claim.regionName, claim.distributorAddress)} />
              <Field label="Address" value={claim.distributorAddress || '—'} className="sm:col-span-2" />
              <Field label="Contact Number" value={claim.distributorMobile || '—'} />
            </div>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-suzuki-line shadow-card p-5 space-y-4">
          <div>
            <h3 className="font-bold text-suzuki-navy mb-2">Claims Reasons</h3>
            <Label>Address</Label>
            <div className="mt-1 rounded-xl bg-sky-50 border border-sky-100/80 px-3 py-3 text-sm text-suzuki-navy min-h-[140px] whitespace-pre-wrap leading-relaxed">
              {claim.reason}
            </div>
          </div>

          <div>
            <Label>Images</Label>
            <div className="mt-2 flex flex-wrap gap-3">
              {claim.images.length === 0 && (
                <div className="h-24 w-24 rounded-xl bg-slate-100 border border-suzuki-line flex items-center justify-center text-suzuki-mute">
                  <ImageIcon size={22} />
                </div>
              )}
              {claim.images.map((img) => (
                <a
                  key={img.id}
                  href={img.storageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="h-24 w-24 rounded-xl overflow-hidden border border-suzuki-line bg-slate-50"
                  title={img.fileName}
                >
                  <img src={img.storageUrl} alt={img.fileName} className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          </div>

          {claim.staffRemarks && (
            <div className="text-xs text-suzuki-mute">
              Staff note: <span className="font-semibold text-suzuki-ink">{claim.staffRemarks}</span>
            </div>
          )}

          {canAct && inProcess && (
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                disabled={actionMutation.isPending}
                onClick={() => actionMutation.mutate('cancel')}
                className="flex-1 rounded-xl bg-sky-100 text-suzuki-navy font-extrabold py-3 tracking-wide hover:bg-sky-200 disabled:opacity-50"
              >
                CANCELED
              </button>
              <button
                type="button"
                disabled={actionMutation.isPending}
                onClick={() => actionMutation.mutate('confirm')}
                className="flex-1 rounded-xl bg-suzuki-red text-white font-extrabold py-3 tracking-wide hover:bg-red-700 disabled:opacity-50"
              >
                CONFIRM CLAIM
              </button>
            </div>
          )}

          {!inProcess && (
            <div className="rounded-xl bg-suzuki-mist px-4 py-3 text-sm font-semibold text-suzuki-mute">
              This claim is {claimStatusLabel(claim.status).toLowerCase()}.
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  className
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      <div className="mt-1 rounded-xl bg-sky-50 border border-sky-100/80 px-3 py-2.5 text-sm font-semibold text-suzuki-navy min-h-[42px]">
        {value}
      </div>
    </div>
  )
}

function Label({ children }: { children: ReactNode }) {
  return <div className="text-xs font-bold text-suzuki-navy/80">{children}</div>
}
