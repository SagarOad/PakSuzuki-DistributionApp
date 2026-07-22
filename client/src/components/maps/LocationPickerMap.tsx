import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Crosshair, MapPin } from 'lucide-react'
import 'leaflet/dist/leaflet.css'

const pinIcon = L.divIcon({
  className: '',
  html: `<div style="width:28px;height:28px;margin-left:-14px;margin-top:-28px;">
    <svg viewBox="0 0 24 36" width="28" height="36" xmlns="http://www.w3.org/2000/svg">
      <path fill="#E30613" stroke="#fff" stroke-width="1.2"
        d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z"/>
      <circle cx="12" cy="12" r="4.5" fill="#fff"/>
    </svg>
  </div>`,
  iconSize: [28, 36],
  iconAnchor: [14, 36]
})

export interface LatLng {
  latitude: number
  longitude: number
}

export default function LocationPickerMap({
  value,
  onChange,
  center,
  className = 'h-64'
}: {
  value: LatLng | null
  onChange: (v: LatLng) => void
  center?: LatLng | null
  className?: string
}) {
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)

  const mapCenter = useMemo((): [number, number] => {
    if (value) return [value.latitude, value.longitude]
    if (center) return [center.latitude, center.longitude]
    return [30.3753, 69.3451]
  }, [value, center])

  function useDeviceGps() {
    setGpsError(null)
    if (!navigator.geolocation) {
      setGpsError('GPS is not available in this browser.')
      return
    }
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
        setGpsLoading(false)
      },
      (err) => {
        setGpsError(err.message || 'Could not read GPS. Allow location access or tap the map.')
        setGpsLoading(false)
      },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-suzuki-mute flex items-center gap-1.5">
          <MapPin size={14} className="text-suzuki-red" />
          Tap the map to set your shop location, or use GPS
        </p>
        <button
          type="button"
          onClick={useDeviceGps}
          disabled={gpsLoading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-suzuki-blue/40 bg-suzuki-ice px-3 py-1.5 text-xs font-bold text-suzuki-navy hover:bg-white disabled:opacity-50"
        >
          <Crosshair size={14} />
          {gpsLoading ? 'Locating…' : 'Use my GPS'}
        </button>
      </div>

      <div className={`overflow-hidden rounded-xl border border-suzuki-line ${className}`}>
        <MapContainer center={mapCenter} zoom={value ? 14 : 6} className="h-full w-full z-0" scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickCapture onPick={onChange} />
          <FlyTo position={mapCenter} zoom={value || center ? 13 : 6} />
          {value && <Marker position={[value.latitude, value.longitude]} icon={pinIcon} />}
        </MapContainer>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-suzuki-mist px-3 py-2 text-suzuki-ink">
          <span className="font-bold text-suzuki-mute">Lat </span>
          {value ? value.latitude.toFixed(6) : '—'}
        </div>
        <div className="rounded-lg bg-suzuki-mist px-3 py-2 text-suzuki-ink">
          <span className="font-bold text-suzuki-mute">Lng </span>
          {value ? value.longitude.toFixed(6) : '—'}
        </div>
      </div>
      {gpsError && <p className="text-xs font-medium text-suzuki-red">{gpsError}</p>}
    </div>
  )
}

function ClickCapture({ onPick }: { onPick: (v: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onPick({ latitude: e.latlng.lat, longitude: e.latlng.lng })
    }
  })
  return null
}

function FlyTo({ position, zoom }: { position: [number, number]; zoom: number }) {
  const map = useMap()
  useEffect(() => {
    map.flyTo(position, zoom, { duration: 0.6 })
  }, [map, position[0], position[1], zoom])
  return null
}
