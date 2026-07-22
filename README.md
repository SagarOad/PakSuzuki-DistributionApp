# Pak Suzuki Distribution Platform — Backend + Dashboard

Clean Architecture .NET 8 Web API, serving:
- **REST APIs** consumed by the Distributor & Retailer **mobile apps** (built separately).
- A **React (Vite + TS) SuperAdmin/Admin/Distributor dashboard**, embedded into the API's `wwwroot` for single-package IIS/VPS deployment (see `deploy.md`).

Scaffolded directly from the functional document (registration/approval workflow, product & pricing, order lifecycle, ship-to-party, dashboards, promotions/incentives, targets).

## Solution structure

```
PakSuzukiDistribution.sln
src/
  Core/
    PakSuzuki.Domain/          # Entities, enums, domain events — zero dependencies
    PakSuzuki.Application/     # CQRS (MediatR) commands/queries, validators, DTOs, interfaces
  Infrastructure/
    PakSuzuki.Infrastructure/  # EF Core, ASP.NET Identity, JWT, file storage, SAP integration stub
  Presentation/
    PakSuzuki.WebApi/          # Controllers, Program.cs, middleware, wwwroot (React build output)
client/                        # React dashboard (Vite + TS + Tailwind + React Query)
```

**Dependency direction**: `WebApi → Infrastructure → Application → Domain`. Domain has
no project references at all; Application only depends on Domain + abstractions
(`IApplicationDbContext`, `ICurrentUserService`, etc.) it doesn't implement itself.
This is what makes it possible to, e.g., swap SQL Server for Postgres, or add a
second API host for the mobile apps only, without touching business logic.

## What's implemented as full vertical slices

These go end-to-end: Domain entity → EF config → MediatR command/query + validator → controller → (stub) React page.

- **Auth**: JWT login (`POST /api/v1/auth/login`), roles seeded on startup.
- **Distributor registration + Super Admin approval** (doc §3.1, §2.1).
- **Retailer registration + two-step approval** (Distributor review → Super Admin final approval) (doc §3.1, §2.2/§2.3).
- **Product management** with price history and role-based price visibility (doc §3.2).
- **Order lifecycle**: retailer order creation, distributor direct order, distributor approve/reject/partial/send-back, WHT-at-summary-level calculation, order numbering (doc §3.3).

## What's scaffolded but needs a handler (Domain + EF config already in place)

`Region`, `RegionalHeadAssignment`, `Promotion`, `Incentive`/`IncentiveParticipant`,
`Target`, `ProofOfDelivery` — entities and DB tables exist; add a
`Features/<Area>/Commands|Queries` folder following the same pattern as `Orders`/`Products`
when you're ready to build:
- Reporting module (§3.9) — sales/order-history exports (Excel/PDF)
- Geo-mapping (§3.6) — you already have `Latitude`/`Longitude` on Distributor/Retailer
- SAP integration (§3.3.3) — `ISapIntegrationService` is stubbed in Infrastructure; swap the two method bodies for real HTTP calls once Pak Suzuki shares SAP endpoint specs
- 45-day retailer blocking rule — `Retailer.LastOrderAtUtc` is tracked on every order; add a scheduled job (Hangfire or `IHostedService`) that sweeps and sets `IsBlocked`
- Ship-to-Party threshold logic (§3.4) — fields exist on `Retailer`; add the quantity-threshold evaluation as a domain service
- `GET /retailers/pending` — the dashboard's Registrations page already calls this; add a `GetPendingRetailersQuery` next

## Running it locally

Requires: .NET 8 SDK, Node 18+, SQL Server (local or Docker), and **your own `dotnet restore`/`npm install`** since this sandbox couldn't reach NuGet/npm registries to do it for you.

```bash
# 1. Restore + apply migrations
dotnet restore
cd src/Infrastructure/PakSuzuki.Infrastructure
dotnet ef migrations add InitialCreate --startup-project ../../Presentation/PakSuzuki.WebApi
cd ../../Presentation/PakSuzuki.WebApi
dotnet ef database update

# 2. Set your JWT secret (don't leave the placeholder from appsettings.json)
dotnet user-secrets init
dotnet user-secrets set "Jwt:Secret" "a-long-random-string-at-least-32-characters"

# 3. Run the API
dotnet run
# Swagger: https://localhost:7080/swagger
# Seeded login: superadmin@paksuzuki.local / ChangeMe!2026  (change this immediately)

# 4. Run the dashboard (separate terminal)
cd ../../../client
npm install
npm run dev
# http://localhost:5173
```

For the combined production build, see `deploy.md`.

## Design decisions worth knowing about

- **Guid PKs everywhere** — retailers/distributors can be registered from the mobile
  app; client-generatable keys avoid collision/round-trip issues.
- **Soft delete + audit stamps are automatic** — handled once in `ApplicationDbContext.SaveChangesAsync`
  via a query filter + `SaveChanges` override, so no command handler needs to remember to set `CreatedAtUtc`/`IsDeleted`.
- **Role-based field visibility lives in the query handler, not the controller or
  the client** — e.g. `GetProductsQuery` nulls out cost price for non-privileged
  roles server-side. The dashboard just renders whatever comes back; there's no
  client-side "hide this column" logic that could be bypassed by calling the API directly.
- **Scoping (a distributor only sees their own retailers/orders) is derived from
  the JWT claims on the server**, never trusted from client-supplied query params —
  see `OrdersController.GetOrders` populating `distributorScope`/`retailerScope` from `ICurrentUserService`, not from the request.
- **WHT is calculated at the order-summary level**, matching the doc's explicit note
  that WHT should move off individual product lines and onto the overall order total.
- **API versioning is in from day one** (`api/v1/...`) — mobile apps and the SAP
  integration will both outlive several dashboard iterations; breaking mobile clients on a dashboard change isn't an option.
