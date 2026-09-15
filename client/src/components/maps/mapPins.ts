import L from 'leaflet'

/** Distributor pins = Suzuki red; retailer pins = blue; optional muted for “removing”. */
export function createMapPinIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="width:28px;height:28px;margin-left:-14px;margin-top:-28px;">
    <svg viewBox="0 0 24 36" width="28" height="36" xmlns="http://www.w3.org/2000/svg">
      <path fill="${color}" stroke="#fff" stroke-width="1.2"
        d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z"/>
      <circle cx="12" cy="12" r="4.5" fill="#fff"/>
    </svg>
  </div>`,
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -34]
  })
}

export const distributorPinIcon = createMapPinIcon('#E30613')
export const retailerPinIcon = createMapPinIcon('#2563EB')
export const removingDistributorPinIcon = createMapPinIcon('#94A3B8')
export const assignedDistributorPinIcon = createMapPinIcon('#059669')
