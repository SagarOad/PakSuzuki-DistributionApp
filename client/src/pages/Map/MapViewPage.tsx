import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Crosshair, Package, Search, Truck } from 'lucide-react'
import { api } from '@/api/axiosClient'
import { useAuth } from '@/context/AuthContext'
import clsx from 'clsx'
import 'leaflet/dist/leaflet.css'

type FilterKind = 'all' | 'distributor' | 'retailer'

interface MapMarker {
  id: string
  kind: string
  name: string
  email?: string | null
  mobileNumber?: string | null
  locationLabel: string
  latitude: number
  longitude: number
  distributorId?: string | null
  distributorName?: string | null
  retailerCount?: number | null
}

interface RegionRow {
  id: string
  name: string
  code: string
  centerLatitude: number
  centerLongitude: number
}

const redIcon = L.divIcon({
  className: '',
  html: `<div style="width:28px;height:28px;margin-left:-14px;margin-top:-28px;">
    <svg viewBox="0 0 24 36" width="28" height="36" xmlns="http://www.w3.org/2000/svg">
      <path fill="#E30613" stroke="#fff" stroke-width="1.2"
        d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z"/>
      <circle cx="12" cy="12" r="4.5" fill="#fff"/>
    </svg>
  </div>`,
  iconSize: [28, 36],
  iconAnchor: [14, 36],
  popupAnchor: [0, -34]
})

export default function MapViewPage() {
  const navigate = useNavigate()
  const { role } = useAuth()
  const [filter, setFilter] = useState<FilterKind>('distributor')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [regionId, setRegionId] = useState<string>('')

  const regionsQuery = useQuery({
    queryKey: ['regions'],
    queryFn: async () => (await api.get<RegionRow[]>('/regions')).data
  })

  const markersQuery = useQuery({
    queryKey: ['map-markers', filter, search, regionId],
    queryFn: async () =>
      (await api.get<MapMarker[]>('/maps/markers', {
        params: {
          kind: filter === 'all' ? undefined : filter,
          search: search || undefined,
          regionId: regionId || undefined
        }
      })).data
  })

  const markers = markersQuery.data ?? []
  const selected = markers.find((m) => m.id === selectedId) ?? null

  useEffect(() => {
    if (!selectedId && markers.length) setSelectedId(markers[0].id)
    if (selectedId && markers.length && !markers.some((m) => m.id === selectedId)) {
      setSelectedId(markers[0]?.id ?? null)
    }
  }, [markers, selectedId])

  const mapCenter = useMemo((): [number, number] => {
    if (selected) return [selected.latitude, selected.longitude]
    if (markers[0]) return [markers[0].latitude, markers[0].longitude]
    const region = regionsQuery.data?.find((r) => r.id === regionId)
    if (region && (region.centerLatitude || region.centerLongitude)) {
      return [region.centerLatitude, region.centerLongitude]
    }
    return [30.3753, 69.3451] // Pakistan centroid fallback
  }, [selected, markers, regionsQuery.data, regionId])

  const cityLabel = useMemo(() => {
    if (selected?.locationLabel) {
      const part = selected.locationLabel.split(',')[0]?.trim()
      if (part) return part
    }
    return regionsQuery.data?.find((r) => r.id === regionId)?.name ?? 'Pakistan'
  }, [selected, regionId, regionsQuery.data])

  function openProfile(m: MapMarker) {
    if (m.kind === 'Distributor') navigate(`/distributors/${m.id}`)
    else navigate(`/retailers/${m.id}`)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-5 min-h-[calc(100vh-180px)]">
        {/* Sidebar list */}
        <section className="bg-white rounded-2xl border border-suzuki-line shadow-card flex flex-col overflow-hidden min-h-[360px] xl:min-h-[520px]">
          <div className="p-5 border-b border-suzuki-line">
            <h1 className="text-xl sm:text-2xl font-extrabold text-suzuki-navy">Map View</h1>
            <div className="mt-4 flex flex-wrap gap-2">
              {([
                ['all', 'All'],
                ['distributor', 'Distributor'],
                ['retailer', 'Retailer']
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={clsx(
                    'rounded-full px-3.5 py-1.5 text-xs font-bold transition',
                    filter === key
                      ? 'bg-suzuki-red text-white'
                      : 'bg-suzuki-mist text-suzuki-mute hover:text-suzuki-ink'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* <div className="mt-3">
              <select
                value={regionId}
                onChange={(e) => setRegionId(e.target.value)}
                className="w-full rounded-xl border border-suzuki-line bg-white px-3 py-2.5 text-sm text-suzuki-ink outline-none focus:border-suzuki-sky"
              >
                <option value="">All cities</option>
                {(regionsQuery.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div> */}

            <div className="mt-3 flex items-center gap-2 rounded-xl border border-suzuki-line bg-suzuki-mist px-3 py-2.5">
              <Search size={16} className="text-suzuki-mute shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search"
                className="w-full bg-transparent text-sm outline-none text-suzuki-ink"
              />
              <Crosshair size={16} className="text-suzuki-mute shrink-0" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {markersQuery.isLoading && (
              <p className="text-sm text-suzuki-mute text-center py-8">Loading locations…</p>
            )}
            {markersQuery.isError && (
              <p className="text-sm text-suzuki-red text-center py-8">Failed to load map data.</p>
            )}
            {!markersQuery.isLoading && markers.length === 0 && (
              <p className="text-sm text-suzuki-mute text-center py-8 px-4">
                No pins yet. Approved distributors/retailers need non-zero latitude &amp; longitude
                from registration.
              </p>
            )}
            {markers.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedId(m.id)}
                className={clsx(
                  'w-full text-left rounded-2xl border p-3.5 transition',
                  selectedId === m.id
                    ? 'border-suzuki-red/40 bg-red-50/50 shadow-sm'
                    : 'border-suzuki-line hover:bg-suzuki-mist/60'
                )}
              >
                <div className="flex gap-3">
                  <div className="h-12 w-12 rounded-xl bg-suzuki-red flex items-center justify-center shrink-0">
                    {m.kind === 'Distributor'
                      ? <Truck size={22} className="text-white" />
                      : <Package size={22} className="text-white" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-suzuki-navy truncate">{m.name}</div>
                    <div className="text-xs font-semibold text-suzuki-red mt-0.5">{m.kind}</div>
                    <div className="text-xs text-suzuki-red/80 mt-0.5 truncate">{m.locationLabel}</div>
                  </div>
                </div>
                <div
                  role="link"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    openProfile(m)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.stopPropagation()
                      openProfile(m)
                    }
                  }}
                  className="mt-3 w-full rounded-lg bg-suzuki-ice text-suzuki-navy text-xs font-bold py-2 text-center hover:bg-suzuki-sky/30"
                >
                  View Profile
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Bird eye map */}
        <section className="bg-white rounded-2xl border border-suzuki-line shadow-card overflow-hidden flex flex-col min-h-[360px] xl:min-h-[520px]">
          <div className="px-5 py-4 border-b border-suzuki-line flex items-center justify-between gap-3">
            <h2 className="text-xl font-extrabold text-suzuki-navy">Bird Eye View</h2>
            {role === 'Distributor' && (
              <span className="text-xs font-semibold text-suzuki-mute">Showing your network only</span>
            )}
          </div>

          <div className="relative flex-1 min-h-[280px] sm:min-h-[360px] xl:min-h-[460px]">
            <MapContainer
              center={mapCenter}
              zoom={selected ? 12 : 6}
              className="h-full w-full z-0"
              scrollWheelZoom
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <FlyTo position={mapCenter} zoom={selected ? 12 : markers.length ? 7 : 5} />
              {markers.map((m) => (
                <Marker
                  key={m.id}
                  position={[m.latitude, m.longitude]}
                  icon={redIcon}
                  eventHandlers={{ click: () => setSelectedId(m.id) }}
                >
                  <Popup>
                    <div className="text-sm font-bold text-suzuki-navy">{m.name}</div>
                    <div className="text-xs text-suzuki-mute">{m.kind}</div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>

            {/* City badge */}
            <div className="pointer-events-none absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 z-[400] hidden md:block">
              <div className="rounded-full bg-suzuki-red text-white text-sm font-extrabold px-5 py-2 shadow-lg">
                {cityLabel}
              </div>
            </div>

            {/* Floating profile card */}
            {selected && (
              <div className="absolute left-3 right-3 bottom-3 sm:left-auto sm:right-4 sm:bottom-4 z-[500] sm:w-[min(100%-2rem,340px)] bg-white rounded-2xl border border-suzuki-line shadow-card p-4">
                <div className="flex gap-3">
                  <div className="h-12 w-12 rounded-xl bg-suzuki-red flex items-center justify-center shrink-0">
                    {selected.kind === 'Distributor'
                      ? <Truck size={22} className="text-white" />
                      : <Package size={22} className="text-white" />}
                  </div>
                  <div className="min-w-0">
                    <div className="font-extrabold text-suzuki-navy truncate">{selected.name}</div>
                    <div className="text-xs text-suzuki-mute truncate">{selected.email || '—'}</div>
                    <div className="text-xs text-suzuki-mute">{selected.mobileNumber || '—'}</div>
                    <div className="text-xs font-semibold text-suzuki-red mt-1 truncate">{selected.locationLabel}</div>
                  </div>
                </div>

                {selected.kind === 'Distributor' && selected.retailerCount != null && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-suzuki-mist px-3 py-2.5">
                    <Package size={16} className="text-suzuki-navy" />
                    <div className="text-lg font-extrabold text-suzuki-navy">{selected.retailerCount}</div>
                    <div className="text-[11px] font-semibold text-suzuki-mute leading-tight">
                      Retailers Under This Distributor
                    </div>
                  </div>
                )}

                {selected.kind === 'Retailer' && selected.distributorName && (
                  <div className="mt-3 text-xs text-suzuki-mute">
                    Distributor: <span className="font-semibold text-suzuki-ink">{selected.distributorName}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => openProfile(selected)}
                  className="mt-3 w-full rounded-xl bg-suzuki-red text-white text-sm font-bold py-2.5 hover:bg-[#c50511]"
                >
                  {selected.kind === 'Distributor' ? 'View Distributor Profile' : 'View Retailer Profile'}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function FlyTo({ position, zoom }: { position: [number, number]; zoom: number }) {
  const map = useMap()
  useEffect(() => {
    map.flyTo(position, zoom, { duration: 0.75 })
  }, [map, position, zoom])
  return null
}
