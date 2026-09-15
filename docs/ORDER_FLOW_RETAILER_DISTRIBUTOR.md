# Retailer Order Flow — APIs for App Dev

Simple guide: **retailer places order → distributor approves → delivery → delivered**.

Base URL: `/api/orders`  
Auth: `Authorization: Bearer <token>`

---

## Quick answer (most important)

| Step | Who | Which API |
|------|-----|-----------|
| First approval / reject / send back / partial | **Distributor** | `POST /api/orders/distributor-action/{orderId}` |
| Start delivery (“Ready to ship” / in transit) | **Distributor** | `PATCH /api/orders/status/{orderId}` with `PartiallyDelivered` |
| Mark delivered (+ optional POD photo) | **Distributor** | `POST /api/orders/proof-of-delivery/{orderId}` then `PATCH .../status` with `Delivered` |
| Pak Suzuki approve manufacturer / Ship-to-Party queue | **SuperAdmin / Admin** | `POST /api/orders/paksuzuki-action/{orderId}` |

### Do **NOT** confuse these two

| API | Who uses it | For what |
|-----|-------------|----------|
| `POST /api/orders/distributor-action/{orderId}` | **Distributor only** | Approve / reject / send back / partial / forward a **retailer** order |
| `POST /api/orders/paksuzuki-action/{orderId}` | **SuperAdmin / Admin only** | Approve / cancel / send back orders waiting on **Pak Suzuki** (`PendingPakSuzukiApproval`) |

`ApprovedByDistributor` is a **distributor-action** decision.  
It is **not** used in `paksuzuki-action`.  
Pak Suzuki uses `ApprovedByPakSuzuki`, `Cancelled`, or `PendingDistributorApproval`.

---

## Status list (all values)

Use these **exact strings** in JSON (API uses string enums).

| Status | Meaning |
|--------|---------|
| `PendingDistributorApproval` | New retailer order — waiting for distributor |
| `SentBackForModification` | Distributor asked retailer to change qty / details |
| `ApprovedByDistributor` | Distributor approved full qty (normal retailer order) |
| `PartiallyApprovedByDistributor` | Distributor approved some qty only |
| `RejectedByDistributor` | Distributor rejected |
| `ForwardedToPakSuzuki` | (legacy / intermediate naming) — forwarding uses `PendingPakSuzukiApproval` |
| `PendingPakSuzukiApproval` | Waiting for Pak Suzuki (manufacturer / Ship-to-Party) |
| `ApprovedByPakSuzuki` | Pak Suzuki approved |
| `SubmittedToSap` | Sent to SAP |
| `PartiallyDelivered` | Delivery started / in process / “Ready to ship” |
| `Delivered` | Delivered |
| `InvoiceConfirmed` | Invoiced (completed) |
| `Cancelled` | Cancelled (often by Pak Suzuki) |

### UI tracking labels ↔ API status

On order detail screen:

| UI label | API status used |
|----------|-----------------|
| Order Processed | After approve → `ApprovedByDistributor` (or partial) |
| Ready To Ship / Start Delivery | `PartiallyDelivered` |
| Delivered | `Delivered` |

There is **no** separate status named `ReadyToShip` or `StartDelivery`.  
**Start delivery = set status to `PartiallyDelivered`.**

---

## Normal retailer order flow (Distributor delivers)

Typical path (not Ship-to-Party):

```
1) Retailer creates
   POST /api/orders
   → status: PendingDistributorApproval

2) Distributor first decision
   POST /api/orders/distributor-action/{orderId}
   → ApprovedByDistributor  (or Partial / Reject / SendBack / Forward)

3) Start delivery
   PATCH /api/orders/status/{orderId}
   { "status": "PartiallyDelivered", "remarks": null }
   → status: PartiallyDelivered

4) Delivered (optional proof photo first)
   POST /api/orders/proof-of-delivery/{orderId}   (multipart file)
   PATCH /api/orders/status/{orderId}
   { "status": "Delivered", "remarks": null }
   → status: Delivered
```

Example order page:  
`/orders/3085822c-2f05-4d2a-91c6-b2966ff178e1`  
→ APIs use the same id:  
`/api/orders/3085822c-2f05-4d2a-91c6-b2966ff178e1`

---

## 1) Create (Retailer)

`POST /api/orders`  
Role: **Retailer**

```json
[
  {
    "productId": "guid",
    "quantity": 10,
    "unit": "Piece",
    "productVariantId": "guid-or-null"
  }
]
```

Response: `{ "id": "order-guid" }`  
Status becomes: **`PendingDistributorApproval`**

---

## 2) Distributor first approval — `distributor-action`

`POST /api/orders/distributor-action/{orderId}`  
Role: **Distributor only**  
Only when order is **`PendingDistributorApproval`** (and belongs to that distributor).

### Body

```json
{
  "decision": "ApprovedByDistributor",
  "remarks": "Optional note",
  "amendedItems": null
}
```

### `decision` options (only these)

| decision | When to use | Result status | `amendedItems` |
|----------|-------------|---------------|----------------|
| `ApprovedByDistributor` | Full approve from stock | `ApprovedByDistributor` *(or `PendingPakSuzukiApproval` if Ship-to-Party)* | not required |
| `PartiallyApprovedByDistributor` | Approve some qty only | `PartiallyApprovedByDistributor` | **required** |
| `SentBackForModification` | Ask retailer to edit | `SentBackForModification` | optional |
| `ForwardedToPakSuzuki` | Cannot fulfill → manufacturer | `PendingPakSuzukiApproval` | not required |
| `RejectedByDistributor` | Final reject (no retailer amend) | `RejectedByDistributor` | not required |

### `amendedItems` shape (partial / send-back)

```json
{
  "decision": "PartiallyApprovedByDistributor",
  "remarks": "Only 5 available",
  "amendedItems": [
    {
      "orderItemId": "line-item-guid",
      "approvedQuantity": 5
    }
  ]
}
```

- For **partial**: `approvedQuantity` = how many you will fulfill (0 … requested).  
- For **send back**: same field is used as the **new requested quantity** for the retailer.

### Examples

**Full approve (Confirm Order button):**
```json
{
  "decision": "ApprovedByDistributor",
  "remarks": null,
  "amendedItems": null
}
```

**Reject:**
```json
{
  "decision": "RejectedByDistributor",
  "remarks": "Out of stock",
  "amendedItems": null
}
```

**Send back:**
```json
{
  "decision": "SentBackForModification",
  "remarks": "Please reduce qty",
  "amendedItems": [
    { "orderItemId": "guid", "approvedQuantity": 3 }
  ]
}
```

---

## 3) Delivery status — `PATCH /status`

`PATCH /api/orders/status/{orderId}`  
Role: **Distributor** (for normal retailer orders they deliver)

### Body

```json
{
  "status": "PartiallyDelivered",
  "remarks": null
}
```

### Distributor-allowed `status` values

| status | App meaning |
|--------|-------------|
| `PartiallyDelivered` | **Start delivery / Ready to ship / Delivery in process** |
| `Delivered` | **Delivered** |
| `ApprovedByDistributor` | Allowed by API, but first approval should use `distributor-action` |

### Examples

**Start delivery:**
```http
PATCH /api/orders/status/{orderId}
```
```json
{ "status": "PartiallyDelivered", "remarks": null }
```

**Mark delivered:**
```json
{ "status": "Delivered", "remarks": null }
```

---

## 4) Proof of delivery (optional before Delivered)

`POST /api/orders/proof-of-delivery/{orderId}`  
`Content-Type: multipart/form-data`  
Field name: `file`

Then set delivered:
```json
{ "status": "Delivered", "remarks": null }
```

List proofs: `GET /api/orders/proof-of-delivery/{orderId}`

---

## 5) Retailer edit / cancel (after send-back)

### Resubmit (edit same order)
`POST /api/orders/retailer-resubmit/{orderId}`  
Only when status = **`SentBackForModification`**

```json
{
  "remarks": "Updated",
  "items": [
    { "orderItemId": "guid", "quantity": 4 }
  ]
}
```
→ back to **`PendingDistributorApproval`**

### Cancel
`POST /api/orders/retailer-cancel/{orderId}`
```json
{ "remarks": "No longer needed" }
```
→ **`Cancelled`**

---

## 6) Pak Suzuki API — only manufacturer / Ship-to-Party queue

`POST /api/orders/paksuzuki-action/{orderId}`  
Role: **SuperAdmin / Admin**  
Only when status = **`PendingPakSuzukiApproval`**

```json
{
  "decision": "ApprovedByPakSuzuki",
  "remarks": "OK"
}
```

### `decision` options (only these)

| decision | Meaning |
|----------|---------|
| `ApprovedByPakSuzuki` | Approve |
| `Cancelled` | Reject |
| `PendingDistributorApproval` | Send back to distributor |

**Not valid here:** `ApprovedByDistributor` (that is distributor-action only).

When does a retailer order reach Pak Suzuki?
- Distributor chose **`ForwardedToPakSuzuki`**, or  
- Retailer is **Ship-to-Party** and distributor confirmed (`ApprovedByDistributor` decision → API sets `PendingPakSuzukiApproval`)

For Ship-to-Party / manufacturer delivery after Pak Suzuki approve, **Admin** uses:
`PATCH /api/orders/status/{orderId}` with `PartiallyDelivered` / `Delivered`  
(Distributor cannot advance delivery on those orders.)

---

## 7) Read APIs

| Method | Path | Use |
|--------|------|-----|
| GET | `/api/orders` | List (scoped by role). Each row includes `totalLiters`. |
| GET | `/api/orders/{orderId}` | Detail + lines + remarks + status. Also `totalLiters` and `items[].lineLiters`. |

List query examples:
- `GET /api/orders?pageNumber=1&pageSize=20`
- `GET /api/orders?source=RetailerOrder`
- `GET /api/orders?statusFilter=PendingDistributorApproval`

---

## 8) Cheat sheet — call this for that

| App button / action | API | Body highlight |
|---------------------|-----|----------------|
| Confirm / Approve order | `POST .../distributor-action/{id}` | `"decision": "ApprovedByDistributor"` |
| Partial approve | `POST .../distributor-action/{id}` | `"decision": "PartiallyApprovedByDistributor"` + `amendedItems` |
| Send back to retailer | `POST .../distributor-action/{id}` | `"decision": "SentBackForModification"` |
| Order to manufacturer | `POST .../distributor-action/{id}` | `"decision": "ForwardedToPakSuzuki"` |
| Reject | `POST .../distributor-action/{id}` | `"decision": "RejectedByDistributor"` |
| Start delivery / Ready to ship | `PATCH .../status/{id}` | `"status": "PartiallyDelivered"` |
| Mark delivered | `PATCH .../status/{id}` | `"status": "Delivered"` |
| Upload POD | `POST .../proof-of-delivery/{id}` | multipart `file` |
| Retailer resubmit edit | `POST .../retailer-resubmit/{id}` | `items[].quantity` |
| Retailer cancel | `POST .../retailer-cancel/{id}` | `remarks` |
| Pak Suzuki approve | `POST .../paksuzuki-action/{id}` | `"decision": "ApprovedByPakSuzuki"` |

---

## 9) Common mistakes

1. Calling **`paksuzuki-action`** for normal retailer approval → wrong. Use **`distributor-action`**.  
2. Looking for status `StartDelivery` / `ReadyToShip` → use **`PartiallyDelivered`**.  
3. Using `PATCH /status` for first approve instead of **`distributor-action`** → wrong for workflow (use action API first).  
4. Distributor trying to deliver a **Ship-to-Party** / manufacturer order → forbidden; Pak Suzuki delivers those.
