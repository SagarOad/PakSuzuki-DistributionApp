# Distributor Action API — Mobile Guide

For order screens like `/orders/{orderId}`  
Example: `/orders/ff2b84ca-f8a4-45ad-84b2-8eea53070244`

All distributor decisions on a **pending retailer order** go through **one API**.

---

## Main API (Distributor)

```http
POST /api/orders/distributor-action/{orderId}
Authorization: Bearer <distributor-token>
Content-Type: application/json
```

**When allowed:** order status must be `PendingDistributorApproval`.

### Request body

```json
{
  "decision": "ApprovedByDistributor",
  "remarks": "Optional note",
  "amendedItems": null,
  "fulfillmentChoice": "DistributorSelf",
  "pakSuzukiShipTo": null
}
```

Enums are **strings** (not numbers).

---

## First: read order detail

```http
GET /api/orders/{orderId}
```

Important fields:

| Field | Meaning |
|-------|---------|
| `thresholdMet` | `true` / `false` — whether pack threshold is reached |
| `status` | Must be `PendingDistributorApproval` to action |
| `items[].id` | Use as `orderItemId` when amending |
| `totalLiters` | Total lubricant volume in **liters** for the whole order (`0` if none). Formula: packs × bottles per pack × liters per bottle (ml is converted). |
| `items[].lineLiters` | Same volume for that line (`0` if not a lube size). |

---

## `decision` values (what to send)

| `decision` string | Meaning | When to use |
|-------------------|---------|-------------|
| `ApprovedByDistributor` | Approve the order | Fulfill myself **or** Pass to Pak Suzuki (with fulfillment fields below) |
| `ForwardedToPakSuzuki` | Same as pass to Pak Suzuki | Also OK; still send `fulfillmentChoice` + `pakSuzukiShipTo` |
| `SentBackForModification` | Send back to retailer | Ask retailer to change qty / lines (they can amend + resubmit) |
| `RejectedByDistributor` | **Final reject** | Order ends as rejected; retailer **cannot** amend. Optional `remarks` note. |

### Not allowed

| Do NOT send | Why |
|-------------|-----|
| `PartiallyApprovedByDistributor` | Partial approve is **blocked**. Full approve or send back only. |

**Reject vs send-back:**

| Send | Saved `statusCode` | Retailer can amend? |
|------|--------------------|---------------------|
| `SentBackForModification` | `SentBackForModification` | Yes |
| `RejectedByDistributor` | `RejectedByDistributor` | No |

---

## Threshold UI → what to send

### A) Threshold **NOT** met (`thresholdMet: false`)

App options are basically:

1. **Fulfill myself** (full order from distributor stock)
2. **Send back** to retailer (amend)

**Fulfill myself:**
```json
{
  "decision": "ApprovedByDistributor",
  "fulfillmentChoice": "DistributorSelf",
  "pakSuzukiShipTo": null,
  "remarks": null,
  "amendedItems": null
}
```

**Send back:**
```json
{
  "decision": "SentBackForModification",
  "remarks": "Please reduce quantity",
  "amendedItems": [
    {
      "orderItemId": "line-item-guid-from-order-detail",
      "approvedQuantity": 5
    }
  ],
  "fulfillmentChoice": null,
  "pakSuzukiShipTo": null
}
```

- `orderItemId` = `items[].id` from `GET /api/orders/{id}`
- `approvedQuantity` = new quantity you want the retailer to use (or keep)
- Set `approvedQuantity` to `0` to drop that line

---

### B) Threshold **met** (`thresholdMet: true`)

App shows extra options:

1. **Fulfill myself** (from own stock)
2. **Pass to Pak Suzuki** → then choose **who to deliver to**
3. **Send back** (same as above)

#### 1) Fulfill myself
```json
{
  "decision": "ApprovedByDistributor",
  "fulfillmentChoice": "DistributorSelf",
  "pakSuzukiShipTo": null,
  "remarks": "Supplying from stock",
  "amendedItems": null
}
```
Result status: `ApprovedByDistributor`

#### 2) Pass to Pak Suzuki — ship to **Distributor**
```json
{
  "decision": "ApprovedByDistributor",
  "fulfillmentChoice": "PassToPakSuzuki",
  "pakSuzukiShipTo": "Distributor",
  "remarks": "Pass to manufacturer",
  "amendedItems": null
}
```
Result status: `PendingPakSuzukiApproval`

#### 3) Pass to Pak Suzuki — ship to **Retailer**
```json
{
  "decision": "ApprovedByDistributor",
  "fulfillmentChoice": "PassToPakSuzuki",
  "pakSuzukiShipTo": "Retailer",
  "remarks": "Ship to retailer",
  "amendedItems": null
}
```
Result status: `PendingPakSuzukiApproval`

**Rules:**
- `PassToPakSuzuki` only works when `thresholdMet` is `true`
- If `fulfillmentChoice` is `PassToPakSuzuki`, **`pakSuzukiShipTo` is required**

---

## `fulfillmentChoice` values

| String | Meaning |
|--------|---------|
| `DistributorSelf` | Distributor fulfills full order from own stock |
| `PassToPakSuzuki` | Send order to Pak Suzuki (threshold must be met) |

## `pakSuzukiShipTo` values

Only when `fulfillmentChoice` = `PassToPakSuzuki`:

| String | Meaning |
|--------|---------|
| `Distributor` | Pak Suzuki delivers to the distributor |
| `Retailer` | Pak Suzuki delivers to the retailer |

---

## Amended orders — who uses which API

### Distributor sends order back (amend)

```http
POST /api/orders/distributor-action/{orderId}
```

```json
{
  "decision": "SentBackForModification",
  "remarks": "Change these quantities",
  "amendedItems": [
    { "orderItemId": "...", "approvedQuantity": 3 }
  ]
}
```

Order status becomes: **`SentBackForModification`**

---

### Retailer resubmits the **same** order (after amend)

```http
POST /api/orders/retailer-resubmit/{orderId}
Authorization: Bearer <retailer-token>
```

```json
{
  "remarks": "Updated as requested",
  "items": [
    {
      "orderItemId": "line-item-guid",
      "quantity": 3
    }
  ]
}
```

- Does **not** create a new order
- Status goes back to **`PendingDistributorApproval`**
- Distributor then uses `distributor-action` again

**Retailer can also cancel** while pending or sent-back:

```http
POST /api/orders/retailer-cancel/{orderId}
```

```json
{ "remarks": "No longer needed" }
```

---

## Quick cheat sheet

| Who | Action | API |
|-----|--------|-----|
| Distributor | Approve / send back / reject / pass to Pak Suzuki | `POST /api/orders/distributor-action/{orderId}` |
| Distributor | See threshold + line ids | `GET /api/orders/{orderId}` |
| Retailer | Resubmit after send-back only | `POST /api/orders/retailer-resubmit/{orderId}` |
| Retailer | Cancel pending / sent-back | `POST /api/orders/retailer-cancel/{orderId}` |
| Both | List / detail | `GET /api/orders` · `GET /api/orders/{id}` |

---

## Flow summary

```
Retailer:  POST /api/orders
           → PendingDistributorApproval

Distributor: GET /api/orders/{id}  (check thresholdMet)
             POST /api/orders/distributor-action/{id}
               ├─ DistributorSelf          → ApprovedByDistributor
               ├─ PassToPakSuzuki + ShipTo → PendingPakSuzukiApproval
               ├─ SentBackForModification  → SentBackForModification (retailer can amend)
               └─ RejectedByDistributor    → RejectedByDistributor (final; no amend)

Retailer (if sent back only):
             POST /api/orders/retailer-resubmit/{id}
               → PendingDistributorApproval again
```

---

## Related: delivery after self-approve (Distributor)

Only when distributor fulfilled themselves (`ApprovedByDistributor`, not Pak Suzuki path):

```http
PATCH /api/orders/status/{orderId}
```

```json
{ "status": "PartiallyDelivered", "remarks": null }
```

```json
{ "status": "Delivered", "remarks": null }
```

Staff Pak Suzuki approve uses a **different** API (`paksuzuki-action`) — not for distributor/retailer apps.
