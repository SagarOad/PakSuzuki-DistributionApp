import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import { useQuery } from '@tanstack/react-query'
import { Search, Crosshair } from 'lucide-react'
import { api } from '@/api/axiosClient'
import { distributorPinIcon, retailerPinIcon } from '@/components/maps/mapPins'
import 'leaflet/dist/leaflet.css'

interface MapMarker {
  id: string
  kind: string
  name: string
  locationLabel: string
  latitude: number
  longitude: number
}

/** Live Bird Eye View — approved distributors (red) + retailers (blue). Scoped for distributors. */
export default function DashboardCoverageMap({
  searchPlaceholder = 'Search distributors / retailers',
  emptyMessage = 'No approved distributors/retailers with location yet.'
}: {
  searchPlaceholder?: string
  emptyMessage?: string
}) {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const markersQuery = useQuery({
    queryKey: ['dashboard-map-markers', debounced],
    queryFn: async () =>
      (await api.get<MapMarker[]>('/maps/markers', {
        params: { search: debounced || undefined }
      })).data
  })

  const markers = markersQuery.data ?? []
  const center = useMemo((): [number, number] => {
    if (markers[0]) return [markers[0].latitude, markers[0].longitude]
    return [30.3753, 69.3451]
  }, [markers])

  return (
    <div className="relative flex-1 rounded-2xl overflow-hidden border border-suzuki-line shadow-card bg-white min-h-[280px] sm:min-h-[360px] xl:min-h-[420px]">
      <MapContainer center={center} zoom={markers.length ? 6 : 5} className="absolute inset-0 h-full w-full z-0" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitMarkers markers={markers} />
        {markers.map((m) => (
          <Marker
            key={m.id}
            position={[m.latitude, m.longitude]}
            icon={m.kind === 'Retailer' ? retailerPinIcon : distributorPinIcon}
          >
            <Popup>
              <div className="text-sm font-bold text-suzuki-navy">{m.name}</div>
              <div className="text-xs text-suzuki-mute">{m.kind}</div>
              <div className="text-xs text-suzuki-mute">{m.locationLabel}</div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <div className="absolute top-4 left-4 right-4 max-w-sm z-[500]">
        <div className="flex items-center gap-2 bg-white/95 backdrop-blur rounded-xl shadow-card border border-white px-3 py-2.5">
          <Search size={16} className="text-suzuki-mute shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-suzuki-mute"
          />
          <button type="button" className="text-suzuki-blue p-1" aria-label="Locate" onClick={() => setSearch('')}>
            <Crosshair size={16} />
          </button>
        </div>
      </div>

      <div className="absolute bottom-3 left-3 z-[500] flex gap-2 text-[11px] font-bold">
        <span className="rounded-full bg-white/95 border border-suzuki-line px-2.5 py-1 text-suzuki-red shadow-sm">
          ● Distributor
        </span>
        <span className="rounded-full bg-white/95 border border-suzuki-line px-2.5 py-1 text-blue-600 shadow-sm">
          ● Retailer
        </span>
      </div>

      {markersQuery.isLoading && (
        <div className="absolute inset-0 z-[400] flex items-center justify-center bg-white/40 text-sm text-suzuki-mute">
          Loading map…
        </div>
      )}
      {!markersQuery.isLoading && markers.length === 0 && (
        <div className="absolute inset-x-0 bottom-12 z-[400] text-center text-xs font-semibold text-suzuki-mute bg-white/80 mx-8 rounded-lg py-2">
          {emptyMessage}
        </div>
      )}
    </div>
  )
}

function FitMarkers({ markers }: { markers: MapMarker[] }) {
  const map = useMap()
  useEffect(() => {
    if (!markers.length) return
    if (markers.length === 1) {
      map.setView([markers[0].latitude, markers[0].longitude], 10)
      return
    }
    const bounds = markers.map((m) => [m.latitude, m.longitude] as [number, number])
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 })
  }, [map, markers])
  return null
}
