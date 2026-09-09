# Deployment: All-in-One Strategy (React embedded in Web API's wwwroot)

This is the strategy we settled on: distributors/retailers run this on their own
IIS or VPS, so we ship **one** deployable unit instead of two separately-hosted sites.

## Local development

Two processes, same as any SPA + API setup:

```bash
# Terminal 1 — API
cd src/Presentation/PakSuzuki.WebApi
dotnet run
# https://localhost:7080, Swagger at /swagger

# Terminal 2 — React (Vite dev server, proxies /api/* to the API above)
cd client
npm install
npm run dev
# http://localhost:5173
```

## Production build (single package for a client's IIS/VPS)

```bash
# 1. Build the React app straight into the API's wwwroot (vite.config.ts outDir is
#    already set to ../src/Presentation/PakSuzuki.WebApi/wwwroot)
cd client
npm install
npm run build

# 2. Publish the API — wwwroot (with the compiled React app inside it) gets bundled automatically
cd ../src/Presentation/PakSuzuki.WebApi
dotnet publish -c Release -o ../../../publish

# 3. Apply EF Core migrations against the client's SQL Server (or let DbSeeder's
#    context.Database.MigrateAsync() run it on first app start)
dotnet ef database update --project ../Infrastructure/PakSuzuki.Infrastructure --startup-project .
```

The `publish/` folder is the entire deliverable — hand it to the distributor's IT
contact, or zip it for a VPS deploy.

## IIS setup on the client's server

1. Install the **.NET 8 Hosting Bundle** (not just the runtime) — this gives IIS the
   ASP.NET Core Module (ANCM) needed to proxy into Kestrel. Without it, IIS will 500 on every request.
2. Create one IIS site pointing at the `publish/` folder. One site, one app pool, one binding — no second site for the React app.
3. App pool: **.NET CLR version = No Managed Code**.
4. Edit **`appsettings.Production.json`** on the server (IIS runs as Production — do **not** rely on `appsettings.Development.json`):
   - `ConnectionStrings:DefaultConnection` — use `Trusted_Connection=True` **or** SQL User Id/Password.
   - **Create the empty database once in SSMS before first start** (IIS almost never can `CREATE DATABASE`):
     `CREATE DATABASE [distribution];`
     Then grant the IIS app-pool Windows login access to that DB (`db_owner`).
   - Set a real `Jwt:Secret` (32+ random characters).
5. Give the app-pool identity **Modify** rights on the site folder (for `logs\` and `email-outbox\`).
6. If you still get **500.30**, open `logs\stdout_*.log` under the site (stdout logging is enabled in `web.config`).
7. Hit `https://<their-server>/swagger` then `https://<their-server>/`.

## Why this holds up

- **Same-origin**: API and dashboard share a domain/port, so no CORS configuration is needed in production (`Cors:AllowedOrigins` in appsettings is only exercised by local dev's Vite server and any separately-hosted admin tooling).
- **One cert, one app pool**: nothing for the client's IT to misconfigure.
- **Mobile apps unaffected**: they call `/api/v1/...` directly and never touch wwwroot/index.html at all.
- **`MapFallbackToFile("index.html")`** in `Program.cs` is what lets React Router own client-side routes like `/orders/123` while `/api/*` stays reserved for controllers — verified by the route ordering: `MapControllers()` is registered before the fallback.

## Caching note

Vite's production build hashes filenames (`index-a1b2c3.js`), so it's safe to set a
long `Cache-Control` on everything under `/assets/*` and a `no-cache` on `index.html`
itself (add this via `web.config` rewrite rules or `UseStaticFiles` options) so a
redeploy doesn't leave a distributor's browser stuck on stale JS referencing an old API contract.
