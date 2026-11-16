# Book club kit prototype

This Expo prototype uses a separate Express API and PostgreSQL for shared users, club memberships, clubs, titles, kits, preferences, cycles and schedules. A club–kit link is an undated association, **not** a checkout; one kit can be linked to multiple clubs. Refresh the relevant screen to see changes made elsewhere.

**Public demo only:** there is no login or authorization. Anyone who can reach the API can read, change or delete shared data. Demo roles and CORS are not security controls. Use fictional data only; do not enter real names, addresses or other sensitive information.

Users can belong to multiple clubs and have separate preferences for each club and cycle. Leaders are assigned per club. Reading history, lending settings, kit status and circulation events are shared because schedules depend on them. The selected user remains local to each device; club enrolment is shared. Standard members enrol in clubs in Settings and see only their enrolled clubs in Preferences. Clubs, Catalog & kits and Cycles are hidden from members. Previous locally created users, preferences, cycles and schedules are not imported.

## Set up the backend

Use Node 22 and a PostgreSQL database intended for this prototype. Set `DATABASE_URL` in the server process environment; keep it private and follow your database provider's TLS and certificate requirements. Do not put credentials in the Expo app, source control or chat. Node does not automatically load `.env` files, so the `server` scripts load the repository-root `.env` with `--env-file-if-exists` when it exists. Shell or Render variables still work and take effect when no `.env` file is present.

Cover thumbnails are optional. Set `ISBNDB_API_KEY` in the server process environment to let the server look up covers from ISBNdb. The title editor previews a cover as you type an ISBN, and the chosen cover URL is saved on the title only when you save it; titles without a saved cover fall back to a lookup by ISBN. Without the key, no lookup is attempted and titles show a grey placeholder. The key is never sent to the Expo app or returned in responses. Run `npm run migrate` in `server/` to apply `004_title_cover_url.sql`.

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

Migrations and the fictional demo seed are explicit commands; neither runs at startup. To import the title list in `server/data/titles-import.tsv` (title, author, ISBN-13), run `npm run import-titles -- --dry-run` to preview and then `npm run import-titles`. Titles whose ISBN already exists are skipped, so it is safe to rerun. Imported titles start with 0 pages, which can be edited in the catalogue. To create one kit per title that has no kit yet (10 copies each, at the first configured branch, barcode equal to the title name), run `npm run create-kits -- --dry-run` to preview and then `npm run create-kits`. If any title name clashes with an existing kit barcode, nothing is written and the clashing names are listed. To load the demo 2027 schedule in `server/data/demo-schedule.tsv` (club_id, ISBN-13, meeting date), run `npm run import-demo-schedule -- --dry-run` and then `npm run import-demo-schedule`. This creates one sample member per club, a `demo-cycle-2027` cycle with a 2026-12-15 voting deadline, meeting slots, and one ballot per club ranked by meeting order. It requires the clubs and titles to exist already, and it runs once; later runs report that it was already imported. Back up the target database and verify the connection before upgrading an existing deployment. The seed creates the initial demo admin and is repeatable without overwriting edits. Conflicting existing IDs or barcodes cause the affected seed step to fail transactionally. Use an appropriately scoped database account.

If the server connection is instead configured in a root `.env` file, Node 22 can load it explicitly:

```powershell
cd server
node --env-file=..\.env src\migrate.js
node --env-file=..\.env src\seed.js
```

An already-set process environment variable takes precedence over the value in `.env`. Never expose the database connection string in client configuration or share it in chat.

`ALLOWED_ORIGINS` is a comma-separated list of exact browser origins, including scheme and port. Add the actual web deployment origin when needed. Requests without an Origin, such as native app requests, are supported. The API listens on `PORT` or 3000 locally; `GET /health` checks the HTTP process only, not database readiness.

To inspect the migrations and tables using a PostgreSQL SQL console:

```sql
SELECT name, applied_at FROM schema_migrations ORDER BY name;
SELECT tablename FROM pg_catalog.pg_tables
WHERE schemaname = current_schema()
ORDER BY tablename;

SELECT id, name, role FROM people ORDER BY name;
SELECT p.name AS person, c.name AS club, m.leader
FROM memberships m
JOIN people p ON p.id = m.person_id
JOIN clubs c ON c.id = m.club_id
ORDER BY c.name, p.name;
SELECT cycle_id, club_id, person_id, revision FROM ballots
ORDER BY cycle_id, club_id, person_id;
SELECT cycle_id, club_id, kit_id, meeting FROM schedule_assignments
ORDER BY cycle_id, meeting;
```

In `psql`, `\dt` lists tables and `\d table_name` describes one table. These are `psql` commands rather than SQL. The table-creation SQL is in [the workflow migration](server/migrations/002_shared_workflows.sql). Apply it through `npm run migrate` so it is recorded in the migration ledger; do not run it separately and then rerun the migration.

## Run the Expo app

From the repository root, configure the **public, non-secret** API base URL and start Expo:

```powershell
npm install
$env:EXPO_PUBLIC_API_URL = 'http://localhost:3000'
npm run web
```

For a physical device, use a server address reachable from the device, not `localhost`. Deployed HTTPS web apps need an HTTPS API URL. Expo embeds `EXPO_PUBLIC_API_URL` in the client bundle, so never place secrets there. Restart or reload Expo after changing configuration.

Choose a demo person in Settings; switching to an admin exposes the admin interface. The demo roles are only interface controls: anyone can switch users or call the API directly. Create users and manage their club memberships; members enrol in clubs in Settings, then choose one of their clubs in Preferences to set cycle preferences. Open or refresh the relevant screens on a second device to see changes. Conflicting edits require a refresh before retrying. Deletion of referenced records is restricted. Resetting local selections does not delete shared database records.

In Catalog & kits, staff and admins can use **Add title** or **Add kit**, or an existing record's edit button, to open a dialog. Canceling a changed form asks before discarding it. If a save's outcome is uncertain or conflicts with another edit, refresh and inspect the shared catalog before reopening the form.

The last administrator cannot be deleted or demoted. Memberships and users referenced by saved ballots cannot be removed; clearing individual marks does not remove a ballot record.

Increasing the turnaround buffer is rejected if it would make existing assignments overlap. Existing assignments retain their original loan dates when the loan length changes.

## Deploy the backend to Render

Connect the repository to a Node web service with:

- Root directory: `server`
- Build command: `npm ci`
- Start command: `npm start`
- Health check path: `/health`
- `NODE_VERSION=22.22.0`
- `DATABASE_URL` set privately in Render's environment settings
- `ISBNDB_API_KEY` set privately in Render's environment settings (optional, enables cover thumbnails)
- `ALLOWED_ORIGINS` set to the exact deployed web origin and any other permitted browser origins

Render supplies `PORT`. Run migrations deliberately against the intended database, then deploy the updated API and app together; the new app requires the updated `/api/shared` response. Run the seed only when fictional demo data is wanted. Render's root directory contains only `server`, so it does not depend on root Expo files.

## Checks

Run `npm test` in `server` for backend tests. PostgreSQL integration tests run only when both `TEST_DATABASE_URL` and `TEST_DATABASE_CONFIRM=isolated` are set for a dedicated test database; they create and remove their own uniquely named schema. Never point them at a database containing data you care about.

From the repository root, run `npm test`, `npx tsc --noEmit` and `npx expo lint` for the Expo app.
