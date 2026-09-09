import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/axiosClient'
import { useAuth } from '@/context/AuthContext'
import PlaceholderImage from '@/components/ui/PlaceholderImage'
import clsx from 'clsx'

interface RetailerRow {
  id: string
  name: string
  businessName: string
  distributorApprovalStatus: string
  superAdminApprovalStatus: string
  createdAtUtc: string
  profileImageUrl?: string | null
  photoCount?: number
}

interface DistributorRow {
  id: string
  distributorCode: string
  name: string
  businessName: string
  regionName: string
  approvalStatus: string
  email: string
  mobileNumber: string
  createdAtUtc: string
  profileImageUrl?: string | null
}

interface PagedResult<T> { items: T[] }

type Decision = 'Approved' | 'Rejected' | 'SentBackForCorrection'

export default function RegistrationList() {
  const { role } = useAuth()
  const isSuperAdmin = role === 'SuperAdmin' || role === 'Admin'
  const queryClient = useQueryClient()
  const [remarksById, setRemarksById] = useState<Record<string, string>>({})
  const [tab, setTab] = useState<'distributors' | 'retailers'>(
    isSuperAdmin ? 'distributors' : 'retailers'
  )

  const distributorsQuery = useQuery({
    queryKey: ['distributor-registrations'],
    enabled: isSuperAdmin,
    queryFn: async () => (await api.get<PagedResult<DistributorRow>>('/distributors/pending')).data
  })

  const retailersQuery = useQuery({
    queryKey: ['retailer-registrations'],
    queryFn: async () => (await api.get<PagedResult<RetailerRow>>('/retailers/pending')).data
  })

  const approveDistributor = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: Decision }) => {
      await api.post(`/distributors/approve/${id}`, {
        decision,
        remarks: remarksById[id] ?? null
      })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['distributor-registrations'] })
  })

  const approveRetailer = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: Decision }) => {
      const endpoint = isSuperAdmin ? 'superadmin-approve' : 'distributor-review'
      await api.post(`/retailers/${endpoint}/${id}`, {
        decision,
        remarks: remarksById[id] ?? null
      })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['retailer-registrations'] })
  })

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy-950 mb-1">Registrations</h1>
      <p className="text-navy-600 text-sm mb-6">
        {isSuperAdmin
          ? 'Approve distributors, then give final approval to retailers after distributor review.'
          : 'Review retailers who signed up under your distributorship.'}
      </p>

      {isSuperAdmin && (
        <div className="flex gap-2 mb-5">
          <TabButton active={tab === 'distributors'} onClick={() => setTab('distributors')}>
            Distributors ({distributorsQuery.data?.items.length ?? 0})
          </TabButton>
          <TabButton active={tab === 'retailers'} onClick={() => setTab('retailers')}>
            Retailers ({retailersQuery.data?.items.length ?? 0})
          </TabButton>
        </div>
      )}

      {isSuperAdmin && tab === 'distributors' && (
        <Queue
          loading={distributorsQuery.isLoading}
          emptyText="No distributors pending Super Admin approval."
          error={distributorsQuery.isError ? 'Failed to load pending distributors. Are you logged in as SuperAdmin?' : null}
        >
          {distributorsQuery.data?.items.map((d) => (
            <Card
              key={d.id}
              title={d.name}
              subtitle={`${d.businessName} · ${d.regionName} · ${d.email}`}
              badges={[<StatusBadge key="s" label="Status" status={d.approvalStatus} />]}
              imageUrl={d.profileImageUrl}
              profileHref={`/distributors/${d.id}`}
              remarksId={d.id}
              onRemarks={(v) => setRemarksById((prev) => ({ ...prev, [d.id]: v }))}
              onApprove={() => approveDistributor.mutate({ id: d.id, decision: 'Approved' })}
              onSendBack={() => approveDistributor.mutate({ id: d.id, decision: 'SentBackForCorrection' })}
              onReject={() => approveDistributor.mutate({ id: d.id, decision: 'Rejected' })}
            />
          ))}
        </Queue>
      )}

      {(!isSuperAdmin || tab === 'retailers') && (
        <Queue
          loading={retailersQuery.isLoading}
          emptyText={
            isSuperAdmin
              ? 'No retailers awaiting final Super Admin approval (distributor must approve first).'
              : 'No retailers pending your review.'
          }
          error={retailersQuery.isError ? 'Failed to load pending retailers.' : null}
        >
          {retailersQuery.data?.items.map((r) => (
            <Card
              key={r.id}
              title={r.name}
              subtitle={r.businessName}
              badges={[
                <StatusBadge key="d" label="Distributor" status={r.distributorApprovalStatus} />,
                <StatusBadge key="s" label="Super Admin" status={r.superAdminApprovalStatus} />
              ]}
              imageUrl={r.profileImageUrl}
              profileHref={`/retailers/${r.id}`}
              photoCount={r.photoCount}
              remarksId={r.id}
              onRemarks={(v) => setRemarksById((prev) => ({ ...prev, [r.id]: v }))}
              onApprove={() => approveRetailer.mutate({ id: r.id, decision: 'Approved' })}
              onSendBack={() => approveRetailer.mutate({ id: r.id, decision: 'SentBackForCorrection' })}
              onReject={() => approveRetailer.mutate({ id: r.id, decision: 'Rejected' })}
            />
          ))}
        </Queue>
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'rounded-lg px-4 py-2 text-sm font-medium',
        active ? 'bg-navy-900 text-white' : 'bg-navy-100 text-navy-800 hover:bg-navy-200'
      )}
    >
      {children}
    </button>
  )
}

function Queue({
  loading,
  emptyText,
  error,
  children
}: {
  loading: boolean
  emptyText: string
  error: string | null
  children: React.ReactNode
}) {
  const list = Array.isArray(children) ? children : [children]
  const hasItems = list.some(Boolean)

  return (
    <div className="space-y-3">
      {loading && <div className="text-navy-500 text-sm">Loading…</div>}
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl p-4 text-sm">{error}</div>
      )}
      {!loading && !error && !hasItems && (
        <div className="bg-white rounded-xl border border-navy-100 p-6 text-center text-navy-500 text-sm">
          {emptyText}
        </div>
      )}
      {children}
    </div>
  )
}

function Card({
  title,
  subtitle,
  badges,
  imageUrl,
  profileHref,
  photoCount,
  remarksId,
  onRemarks,
  onApprove,
  onSendBack,
  onReject
}: {
  title: string
  subtitle: string
  badges: React.ReactNode[]
  imageUrl?: string | null
  profileHref: string
  photoCount?: number
  remarksId: string
  onRemarks: (value: string) => void
  onApprove: () => void
  onSendBack: () => void
  onReject: () => void
}) {
  return (
    <div className="bg-white rounded-xl border border-navy-100 p-5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <PlaceholderImage
          src={imageUrl}
          alt={title}
          className="h-12 w-12 shrink-0 rounded-xl border border-navy-100 bg-navy-50"
          imgClassName="h-full w-full object-cover"
        />
        <div>
          <div className="font-medium text-navy-950">{title}</div>
          <div className="text-sm text-navy-600">{subtitle}</div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {badges}
            <Link to={profileHref} className="text-xs font-semibold text-suzuki-blue hover:underline">
              View profile{typeof photoCount === 'number' ? ` & ${photoCount} photo${photoCount === 1 ? '' : 's'}` : ' & photos'}
            </Link>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          placeholder="Remarks (optional)"
          className="text-sm border border-navy-100 rounded-lg px-3 py-2 w-48"
          onChange={(e) => onRemarks(e.target.value)}
          data-id={remarksId}
        />
        <button
          type="button"
          onClick={onApprove}
          className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3 py-2"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={onSendBack}
          className="rounded-lg bg-navy-100 hover:bg-navy-200 text-navy-800 text-sm font-medium px-3 py-2"
        >
          Send Back
        </button>
        <button
          type="button"
          onClick={onReject}
          className="rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-3 py-2"
        >
          Reject
        </button>
      </div>
    </div>
  )
}

function StatusBadge({ label, status }: { label: string; status: string }) {
  const color =
    status === 'Approved' ? 'bg-emerald-100 text-emerald-800'
    : status === 'Rejected' ? 'bg-red-100 text-red-800'
    : status === 'SentBackForCorrection' ? 'bg-amber-100 text-amber-800'
    : 'bg-navy-100 text-navy-700'
  return (
    <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', color)}>
      {label}: {status}
    </span>
  )
}
