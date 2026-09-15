import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import { useMutation, useQuery } from '@tanstack/react-query'
import { MapPin, Store, Truck } from 'lucide-react'
import { api } from '@/api/axiosClient'
import {
  assignedDistributorPinIcon,
  distributorPinIcon,
  removingDistributorPinIcon,
  retailerPinIcon
} from '@/components/maps/mapPins'
import 'leaflet/dist/leaflet.css'

interface SuggestedDistributor {
  id: string
  distributorCode: string
  name: string
  businessName: string
  regionName: string
  businessAddress: string
  latitude: number
  longitude: number
  distanceKm?: number
}

interface DeleteRetailerRow {
  id: string
  retailerCode: string
  name: string
  businessName: string
  businessAddress: string
  latitude: number
  longitude: number
  isDeleted?: boolean
  suggestedDistributor?: SuggestedDistributor | null
}

interface DeletePreview {
  id: string
  distributorCode: string
  name: string
  businessName: string
  regionName: string
  regionId?: string
  latitude: number
  longitude: number
  retailerCount: number
  activeRetailerCount?: number
  canDeleteWithoutReassign?: boolean
  hasAssignableDistributors?: boolean
  blockReason?: string | null
  retailers: DeleteRetailerRow[]
  candidateDistributors: SuggestedDistributor[]
}

function hasCoords(p: { latitude?: number; longitude?: number }) {
  return !!p.latitude || !!p.longitude
}

function FitBounds({
  points,
  focusKey
}: {
  points: { latitude: number; longitude: number }[]
  focusKey?: string
}) {
  const map = useMap()
  useEffect(() => {
    const valid = points.filter(hasCoords)
    if (!valid.length) return
    if (valid.length === 1) {
      map.setView([valid[0].latitude, valid[0].longitude], 12)
      return
    }
    map.fitBounds(
      valid.map((p) => [p.latitude, p.longitude] as [number, number]),
      { padding: [40, 40], maxZoom: 13 }
    )
  }, [map, points, focusKey])
  return null
}

function buildDefaultAssignments(data: DeletePreview): Record<string, string> {
  const next: Record<string, string> = {}
  const fallback = data.candidateDistributors[0]?.id
  for (const r of data.retailers) {
    next[r.id] = r.suggestedDistributor?.id || fallback || ''
  }
  return next
}

export function DeleteDistributorModal({
  distributorId,
  distributorLabel,
  busy,
  onBack,
  onDeleted
}: {
  distributorId: string
  distributorLabel: string
  busy?: boolean
  onBack: () => void
  onDeleted: () => void
}) {
  const [assignments, setAssignments] = useState<Record<string, string>>({})
  const [selectedRetailerId, setSelectedRetailerId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  const preview = useQuery({
    queryKey: ['distributor-delete-preview', distributorId],
    queryFn: async () => (await api.get<DeletePreview>(`/distributors/${distributorId}/delete-preview`)).data
  })

  useEffect(() => {
    const data = preview.data
    if (!data) return
    setAssignments(buildDefaultAssignments(data))
    setSelectedRetailerId(data.retailers[0]?.id ?? null)
    setConfirmed(false)
  }, [preview.data])

  const candidatesById = useMemo(() => {
    const map = new Map<string, SuggestedDistributor>()
    for (const c of preview.data?.candidateDistributors ?? []) map.set(c.id, c)
    return map
  }, [preview.data])

  const data = preview.data
  const candidates = data?.candidateDistributors ?? []
  const hasCandidates = candidates.length > 0
  const selectedRetailer = data?.retailers.find((r) => r.id === selectedRetailerId) ?? null
  const assignedForSelected = selectedRetailer ? assignments[selectedRetailer.id] : undefined

  const rankedCandidates = useMemo(() => {
    if (!selectedRetailer || !hasCoords(selectedRetailer)) return candidates
    const lat = selectedRetailer.latitude
    const lng = selectedRetailer.longitude
    return [...candidates].sort((a, b) => {
      const da = hasCoords(a)
        ? (a.latitude - lat) ** 2 + (a.longitude - lng) ** 2
        : Number.POSITIVE_INFINITY
      const db = hasCoords(b)
        ? (b.latitude - lat) ** 2 + (b.longitude - lng) ** 2
        : Number.POSITIVE_INFINITY
      if (da !== db) return da - db
      return a.businessName.localeCompare(b.businessName)
    })
  }, [candidates, selectedRetailer])

  const mapFocusPoints = useMemo(() => {
    if (!data) return [] as { latitude: number; longitude: number }[]
    const points: { latitude: number; longitude: number }[] = []

    if (selectedRetailer && hasCoords(selectedRetailer)) {
      points.push({ latitude: selectedRetailer.latitude, longitude: selectedRetailer.longitude })
      const assigned = assignedForSelected ? candidatesById.get(assignedForSelected) : null
      if (assigned && hasCoords(assigned)) {
        points.push({ latitude: assigned.latitude, longitude: assigned.longitude })
      }
      for (const c of rankedCandidates) {
        if (hasCoords(c) && points.length < 6) {
          points.push({ latitude: c.latitude, longitude: c.longitude })
        }
      }
      return points
    }

    if (hasCoords(data)) points.push({ latitude: data.latitude, longitude: data.longitude })
    for (const r of data.retailers) {
      if (hasCoords(r)) points.push({ latitude: r.latitude, longitude: r.longitude })
    }
    for (const c of candidates) {
      if (hasCoords(c)) points.push({ latitude: c.latitude, longitude: c.longitude })
    }
    return points
  }, [data, selectedRetailer, assignedForSelected, candidatesById, rankedCandidates, candidates])

  const allAssigned =
    !!data &&
    data.retailers.every((r) => {
      const id = assignments[r.id]
      return !!id && candidatesById.has(id)
    })

  const canSubmit =
    !!data &&
    !data.blockReason &&
    confirmed &&
    (data.retailerCount === 0 || (allAssigned && hasCandidates))

  const assignNearestAll = () => {
    if (!data || !hasCandidates) return
    setAssignments(buildDefaultAssignments(data))
  }

  const remove = useMutation({
    mutationFn: async () => {
      const { data: fresh } = await api.get<DeletePreview>(`/distributors/${distributorId}/delete-preview`)
      if (fresh.blockReason) {
        throw { response: { data: { detail: fresh.blockReason } } }
      }
      if (fresh.retailerCount === 0) {
        await api.delete(`/distributors/${distributorId}`)
        return
      }

      const candidateIds = new Set(fresh.candidateDistributors.map((c) => c.id))
      const missing = fresh.retailers.filter((r) => !assignments[r.id] || !candidateIds.has(assignments[r.id]))
      if (missing.length > 0) {
        throw {
          response: {
            data: {
              detail: `${missing.length} retailer(s) still need a valid live distributor before removal.`
            }
          }
        }
      }

      await api.post(`/distributors/${distributorId}/reassign-and-delete`, {
        assignments: fresh.retailers.map((r) => ({
          retailerId: r.id,
          newDistributorId: assignments[r.id]
        }))
      })
    },
    onSuccess: () => {
      setError(null)
      onDeleted()
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string; title?: string; message?: string } } })
        ?.response?.data
      setError(msg?.detail || msg?.title || msg?.message || 'Could not remove distributor.')
    }
  })

  const center: [number, number] = data && hasCoords(data)
    ? [data.latitude, data.longitude]
    : [30.3753, 69.3451]

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onBack}>
      <div
        className="bg-white rounded-2xl shadow-card w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-3 border-b border-suzuki-line">
          <h3 className="text-xl font-extrabold text-suzuki-navy">Remove distributor</h3>
          <p className="text-sm text-suzuki-mute mt-1">
            {distributorLabel}. Move every retailer to another live distributor first. Map: blue = retailers, red = other distributors, green = selected assignee, grey = being removed.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {preview.isLoading && (
            <p className="text-sm text-suzuki-mute py-10 text-center">Loading retailers and nearby distributors…</p>
          )}

          {preview.isError && (
            <p className="text-sm text-suzuki-red bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              Could not load delete preview.
            </p>
          )}

          {data?.blockReason && (
            <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              {data.blockReason}
            </p>
          )}

          {data && data.retailerCount === 0 && (
            <p className="text-sm text-suzuki-mute bg-suzuki-mist rounded-xl px-4 py-3">
              No retailers are linked to this distributor. You can remove the account.
            </p>
          )}

          {data && data.retailerCount > 0 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-suzuki-navy">
                  {data.retailerCount} retailer{data.retailerCount === 1 ? '' : 's'} must move
                  {hasCandidates ? ` · ${candidates.length} other distributor${candidates.length === 1 ? '' : 's'} available` : ''}
                </p>
                <button
                  type="button"
                  onClick={assignNearestAll}
                  disabled={!hasCandidates}
                  className="rounded-lg bg-suzuki-ice text-suzuki-navy text-xs font-bold px-3 py-2 hover:bg-suzuki-line/40 disabled:opacity-50"
                >
                  Assign all to nearest
                </button>
              </div>

              {!hasCandidates && (
                <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  No other approved active distributor is available yet.
                </p>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {data.retailers.map((r) => {
                    const assignedId = assignments[r.id]
                    const assigned = assignedId ? candidatesById.get(assignedId) : null
                    const active = selectedRetailerId === r.id
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedRetailerId(r.id)}
                        className={`w-full text-left rounded-xl border px-3 py-3 transition-colors ${
                          active
                            ? 'border-suzuki-blue bg-sky-50'
                            : 'border-suzuki-line bg-white hover:bg-suzuki-mist/60'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <Store size={16} className="text-suzuki-blue mt-0.5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-suzuki-navy truncate">{r.businessName}</p>
                            <p className="text-xs text-suzuki-mute truncate">
                              {r.retailerCode} · {r.name}
                              {r.isDeleted ? ' · inactive record' : ''}
                            </p>
                            <p className="text-xs text-suzuki-mute mt-1 truncate">{r.businessAddress || 'No address'}</p>
                            <p className={`text-xs mt-1.5 font-semibold ${assigned ? 'text-emerald-700' : 'text-amber-700'}`}>
                              {assigned ? `→ ${assigned.businessName}` : 'Choose a distributor'}
                            </p>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>

                <div className="space-y-3">
                  <div className="h-64 rounded-xl overflow-hidden border border-suzuki-line relative bg-suzuki-mist">
                    <MapContainer center={center} zoom={10} className="absolute inset-0 h-full w-full z-0" scrollWheelZoom>
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      <FitBounds
                        points={mapFocusPoints}
                        focusKey={`${selectedRetailerId ?? 'all'}-${assignedForSelected ?? ''}`}
                      />
                      {hasCoords(data) && (
                        <Marker position={[data.latitude, data.longitude]} icon={removingDistributorPinIcon}>
                          <Popup>
                            <div className="text-sm font-bold">Removing: {data.businessName}</div>
                          </Popup>
                        </Marker>
                      )}
                      {data.retailers.filter(hasCoords).map((r) => (
                        <Marker
                          key={`r-${r.id}`}
                          position={[r.latitude, r.longitude]}
                          icon={retailerPinIcon}
                          eventHandlers={{ click: () => setSelectedRetailerId(r.id) }}
                        >
                          <Popup>
                            <div className="text-sm font-bold">{r.businessName}</div>
                            <div className="text-xs text-suzuki-mute">{r.retailerCode}</div>
                          </Popup>
                        </Marker>
                      ))}
                      {candidates.filter(hasCoords).map((c) => {
                        const isAssigned = c.id === assignedForSelected
                        return (
                          <Marker
                            key={`c-${c.id}`}
                            position={[c.latitude, c.longitude]}
                            icon={isAssigned ? assignedDistributorPinIcon : distributorPinIcon}
                            eventHandlers={{
                              click: () => {
                                if (!selectedRetailerId) return
                                setAssignments((prev) => ({ ...prev, [selectedRetailerId]: c.id }))
                              }
                            }}
                          >
                            <Popup>
                              <div className="text-sm font-bold">{c.businessName}</div>
                              <div className="text-xs text-suzuki-mute">{c.regionName}</div>
                              {isAssigned ? <div className="text-xs text-emerald-700 font-semibold mt-1">Selected assignee</div> : null}
                            </Popup>
                          </Marker>
                        )
                      })}
                    </MapContainer>
                  </div>

                  {selectedRetailer && (
                    <div className="rounded-xl border border-suzuki-line p-3 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-bold text-suzuki-navy">
                        <MapPin size={15} className="text-suzuki-blue" />
                        Assign {selectedRetailer.businessName}
                      </div>
                      <select
                        className="field w-full"
                        value={assignments[selectedRetailer.id] ?? ''}
                        onChange={(e) =>
                          setAssignments((prev) => ({ ...prev, [selectedRetailer.id]: e.target.value }))
                        }
                      >
                        <option value="">Select distributor</option>
                        {rankedCandidates.map((c) => {
                          const suggested = selectedRetailer.suggestedDistributor?.id === c.id
                          return (
                            <option key={c.id} value={c.id}>
                              {c.businessName} ({c.regionName}){suggested ? ' · suggested' : ''}
                            </option>
                          )
                        })}
                      </select>
                      {selectedRetailer.suggestedDistributor && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-suzuki-blue hover:underline"
                          onClick={() =>
                            setAssignments((prev) => ({
                              ...prev,
                              [selectedRetailer.id]: selectedRetailer.suggestedDistributor!.id
                            }))
                          }
                        >
                          <Truck size={13} />
                          Use suggested: {selectedRetailer.suggestedDistributor.businessName}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {error && (
            <p className="text-sm text-suzuki-red bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
          )}

          {data && !data.blockReason && (
            <label className="flex items-start gap-2 text-sm text-suzuki-navy bg-suzuki-mist/70 rounded-xl px-3 py-2.5">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                I confirm every retailer will move to a live distributor. The removed account stays only as history on past orders.
              </span>
            </label>
          )}
        </div>

        <div className="px-6 py-4 border-t border-suzuki-line flex flex-col-reverse sm:flex-row justify-end gap-2">
          <button
            type="button"
            onClick={onBack}
            disabled={busy || remove.isPending}
            className="rounded-xl bg-suzuki-ice text-suzuki-navy font-bold px-5 py-2.5 text-sm disabled:opacity-50"
          >
            Back
          </button>
          <button
            type="button"
            disabled={busy || remove.isPending || preview.isLoading || !canSubmit}
            onClick={() => {
              setError(null)
              remove.mutate()
            }}
            className="rounded-xl bg-suzuki-red text-white font-bold px-5 py-2.5 text-sm disabled:opacity-50"
            title={
              !data
                ? 'Loading…'
                : data.blockReason
                  ? data.blockReason
                  : data.retailerCount > 0 && !allAssigned
                    ? 'Assign every retailer first'
                    : !confirmed
                      ? 'Tick the confirmation box'
                      : undefined
            }
          >
            {remove.isPending
              ? 'Removing…'
              : data?.retailerCount
                ? 'Reassign & remove'
                : 'Remove distributor'}
          </button>
        </div>
      </div>
    </div>
  )
}
