# Map View & geo registration (Pak Suzuki)

## Real map (free, works on localhost)

We use **Leaflet + OpenStreetMap** tiles — no Google Maps API key, free for development and typical internal dashboards.

- **Web Map View:** `/map` in the admin portal  
- Markers come from `GET /api/maps/markers`  
- Tiles: `https://{s}.tile.openstreetmap.org/...`

For production at scale you can later swap tiles to Mapbox/Google; marker APIs stay the same.

---

## How registration uses location

### Distributor register (few per city)

1. Mobile calls `GET /api/regions` → city list with `centerLatitude` / `centerLongitude`
2. User picks **RegionId** (city they belong to) — required  
3. User sets shop pin → `latitude` / `longitude` (GPS or map picker)  
4. `POST /api/distributors/register` with `regionId`, `latitude`, `longitude`, address, …

Those pins appear on Map View after SuperAdmin approval.

### Retailer register (many per city)

1. Optional: pick city (`regionId`) to narrow the list  
2. User drops a map pin / uses GPS → `latitude`, `longitude`  
3. Call **nearest distributors**:

```http
GET /api/distributors/nearest?latitude=30.15&longitude=71.52&regionId=<optional>&take=5
```

4. App shows ranked suggestions (`distanceKm`, `rank`) — user confirms one  
5. `POST /api/retailers/register` with that `distributorId` + lat/long  

Also available (full list, now includes coordinates):

```http
GET /api/distributors/approved?regionId=
```

---

## Map View UI

- Filters: **All / Distributor / Retailer**  
- Search by name / address / city  
- Bird-eye Leaflet map with pins  
- Popup + **View Profile** → distributor or retailer detail pages  

Distributor role only sees **their own** marker + **their retailers**.

---

## Distributor web registration

Public page: **`/register/distributor`** (also linked from Login).

Flow:
1. Fill personal + business fields  
2. Select **city/region** (`GET /api/regions`)  
3. Set shop pin via **map click** or **Use my GPS**  
4. `POST /api/distributors/register` → status `PendingReview`  
5. **Super Admin** approves / rejects / sends back (existing Distributors Requests UI)

Retailers remain mobile-first: GPS/map pin → `GET /api/distributors/nearest` → register → **Distributor then Super Admin** approve.



| Code | City | Approx center |
|------|------|----------------|
| KHI | Karachi | 24.86, 67.00 |
| LHE | Lahore | 31.52, 74.36 |
| ISB | Islamabad | 33.68, 73.05 |
| MUX | Multan | 30.16, 71.52 |
| FSD | Faisalabad | 31.45, 73.14 |
| PEW | Peshawar | 34.02, 71.52 |
| QTA | Quetta | 30.18, 66.98 |

Add more cities later via DB / seeder — same `Region` model.
