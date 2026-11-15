# Book club kit prototype

This Expo prototype uses a separate Express API and PostgreSQL for shared clubs, book titles, kits and club–kit links. A link is an undated association, **not** a checkout; one kit can be linked to multiple clubs. Refresh the catalog or clubs screen to see changes made elsewhere.

**Public demo only:** there is no login or authorization. Anyone who can reach the API can read, change or delete shared data. Demo roles and CORS are not security controls. Use fictional data only; do not enter real names, addresses or other sensitive information.

Members, leaders, reading history, ballots, cycles, schedules, library settings, kit status and circulation events remain local and unencrypted on each device. They are not synchronized. Previous locally created shared records are not imported. Existing local references to shared records that have been deleted may be unavailable; deleting shared records cannot check local data on other devices.

## Set up the backend

Use Node 22 and a PostgreSQL database intended for this prototype. Set `DATABASE_URL` in the server process environment; keep it private and follow your database provider's TLS and certificate requirements. Do not put credentials in the Expo app, source control or chat. Node does not automatically load a `server/.env` file.

In PowerShell, from the repository root:

```powershell
cd server
npm ci
$env:DATABASE_URL = '<your-postgresql-connection-url>'
$env:ALLOWED_ORIGINS = 'http://localhost:8081'
npm run migrate
npm run seed
npm start
```

Migrations and the fictional demo seed are explicit commands; neither runs at startup. The seed is transactional and will not overwrite edits when run again. A conflicting existing ID or barcode causes it to fail without partially seeding. Use an appropriately scoped database account and review which database `DATABASE_URL` points to before running setup.

`ALLOWED_ORIGINS` is a comma-separated list of exact browser origins, including scheme and port. Add the actual web deployment origin when needed. Requests without an Origin, such as native app requests, are supported. The API listens on `PORT` or 3000 locally; `GET /health` checks the HTTP process only, not database readiness.

## Run the Expo app

From the repository root, configure the **public, non-secret** API base URL and start Expo:

```powershell
npm install
$env:EXPO_PUBLIC_API_URL = 'http://localhost:3000'
npm run web
```

For a physical device, use a server address reachable from the device, not `localhost`. Deployed HTTPS web apps need an HTTPS API URL. Expo embeds `EXPO_PUBLIC_API_URL` in the client bundle, so never place secrets there. Restart or reload Expo after changing configuration.

Choose a demo person in Settings, then use Catalog & kits to create records and Clubs to link or unlink kits. Open or refresh those screens on a second device to see changes. Conflicting edits require a refresh before retrying; referenced shared records must be unlinked before deletion. The local demo reset does not delete shared database records.

## Deploy the backend to Render

Connect the repository to a Node web service with:

- Root directory: `server`
- Build command: `npm ci`
- Start command: `npm start`
- Health check path: `/health`
- `NODE_VERSION=22.22.0`
- `DATABASE_URL` set privately in Render's environment settings
- `ALLOWED_ORIGINS` set to the exact deployed web origin and any other permitted browser origins

Render supplies `PORT`. Run migrations deliberately against the intended database before using the data routes; run the seed only when fictional demo data is wanted. Render's root directory contains only `server`, so it does not depend on root Expo files.

## Checks

Run `npm test` in `server` for backend tests. PostgreSQL integration tests run only when both `TEST_DATABASE_URL` and `TEST_DATABASE_CONFIRM=isolated` are set for a dedicated test database; they create and remove their own uniquely named schema. Never point them at a database containing data you care about.

From the repository root, run `npm test`, `npx tsc --noEmit` and `npx expo lint` for the Expo app.
