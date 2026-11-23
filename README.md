# Book club kit prototype

This Expo prototype uses a separate Express API and PostgreSQL for shared users, club memberships, clubs, titles, kits, preferences, cycles and schedules. A club–kit link is an undated association, **not** a checkout; one kit can be linked to multiple clubs. Refresh the relevant screen to see changes made elsewhere.

**Public demo only:** Firebase sign-in is required for staff and administrator operations, but demo members and leaders are unauthenticated and impersonable. Anyone who can reach the API can act as a demo member, read member-accessible data, change member ballots and enrolments, and finalize leader rankings. Use fictional data only; do not enter real names, addresses or other sensitive information. CORS is not an access control.

Users can belong to multiple clubs and have separate preferences for each club and cycle. Leaders are assigned per club. Reading history, lending settings, kit status and circulation events are shared within the selected library service because schedules depend on them. Choose a library service on Home, then choose a demo member or sign in. Standard members manage club enrolment on Home and see only their enrolled clubs in Preferences. Clubs, Catalog & kits and Cycles are hidden from members. Previous locally created users, preferences, cycles and schedules are not imported.

## Library services

Each library service has its own catalogue, members, clubs, ballots, schedules, circulation and lending settings. A signed-in administrator can open Admin and create a service even without an existing service selected. The guided setup requires a name and at least one branch, a cycle with a future voting deadline, and at least one title and kit. Choose suggested books or enter your own; each gets a kit at the first branch with an editable copy count and a generated placeholder barcode. Correct the barcode and other kit details in Catalog & kits, and add further titles and kits there later.

Creating a club and a fictional demo member is optional; when both are supplied, the member joins that club. The new cycle opens for voting immediately. Members select the library and their demo user on Home, then go to Preferences to vote; setup does not create direct voting links. Complete setup before the service is created. If the result is uncertain, use **Check previous setup** before clearing the pending request or starting another, to avoid duplicates.

Any signed-in administrator can preview and permanently delete the selected service on Admin by typing its exact name. This destroys its catalogue, clubs, members, votes, schedules and circulation history, including active loan information and service-local Firebase identity mappings; Firebase accounts remain. This is not a production-safe circulation or audit workflow. Recovery requires a backup.

**Access limitation:** Every signed-in Firebase administrator can select, manage and delete every service; per-service administrator permissions are not available. Service names are public, and demo members and leaders remain unauthenticated and impersonable. Separation of datasets is not privacy or member authentication; use fictional data only.

Migration `018_library_services.sql` preserves the existing shared records and Firebase identities in a service named Hume. Before upgrading, stop all API instances and other writers, verify the target database, take a restorable backup and rehearse the migration on an isolated copy. Deploy the updated API and app together; old clients without a service selection cannot use service-dependent endpoints. No migration runs at server startup.

Guided setup requires migration `019_library_service_setup.sql`, applied separately with the migration role using `npm run migrate` from `server`. Back up and verify the database first. Before enabling deletion, deploy the transaction-local service isolation and deletion-lock changes to **all** API instances; stop older instances and pause external writers that do not follow the same lock protocol. Scoped multi-query reads serialize with other operations on the same service to keep views consistent while deletion is possible. Deletion temporarily disables the circulation append-only trigger inside its transaction, so the restricted API role must own `circulation_events`. Test the upgrade and deletion on an isolated copy before production use.

The API database role must not be a PostgreSQL superuser or have `BYPASSRLS`; the API rejects requests if it can bypass row-level security. Use an appropriately privileged non-superuser role that can read and write the application tables and owns `circulation_events` for the existing trigger operations. Check the API connection's role with `SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user;`. Apply migrations with an appropriately privileged migration role. Configure database access privately and do not share connection strings.

For transaction-pooled connections, API database operations set the library-service context locally inside each transaction; maintenance commands require their own appropriately privileged connection. If migration metadata is unexpected, stop writers, preserve a restorable backup and investigate before running migrations or schema repair.

The legacy seed, import, enrichment, kit creation, reconciliation and schema-repair commands do **not** yet support library-service databases and explicitly refuse to run after migration 018. Do not run older copies of those scripts against a migrated database. Create new service data through the app.

## Configure Firebase sign-in

Use an existing Firebase project with Email/Password authentication enabled and register a Firebase web app for its public configuration. Every successfully authenticated account in this project is an administrator, including accounts created through other applications. Restrict account creation in the Firebase project before deployment: omitting a registration screen here does not prevent sign-ups through Firebase APIs. Manage accounts and revoke access in Firebase; this app does not create, delete or reset Firebase accounts.

Set `EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`, `EXPO_PUBLIC_FIREBASE_PROJECT_ID` and `EXPO_PUBLIC_FIREBASE_APP_ID` to the corresponding web app configuration values in the Expo environment. These values and `EXPO_PUBLIC_API_URL` are embedded in the app and are not secrets. Never put private credentials, passwords or service-account keys in these variables, the repository or chat.

For the API, you can copy `FIREBASE_PUBLIC_CONFIG_JSON` and `FIREBASE_SERVICE_ACCOUNT_JSON` from the existing project into the Render API service's environment. The public JSON must be an object containing `projectId`; other Firebase web configuration fields are ignored by the API. The service-account JSON must contain `project_id`, `client_email` and `private_key` (or their camelCase equivalents). Its account needs permission to look up Firebase Auth users for revocation and disabled-account checks, such as Firebase Authentication Viewer. Treat the entire service-account JSON as a secret: never put it in the Expo app, source control or chat, and rotate exposed keys.

The API derives its Firebase project ID from either JSON value or the existing `FIREBASE_PROJECT_ID` setting; all IDs supplied must match. If service-account JSON is absent, the API continues to use [Application Default Credentials](https://firebase.google.com/docs/admin/setup#initialize_the_sdk_in_non-google_environments), such as a protected server-side `GOOGLE_APPLICATION_CREDENTIALS` file. Invalid supplied JSON fails closed rather than falling back. `SESSION_SECRET` is not used or required: authentication uses Firebase ID tokens, not server-side sessions. The Expo app still needs its separate public variables above, matching the API's project. The API rejects protected requests when verification is unavailable. Use an HTTPS API endpoint for deployed apps; authenticated HTTP requests are allowed only to loopback addresses for local development. Physical devices therefore need a reachable HTTPS endpoint.

Back up and verify the target database before running migrations, including `017_firebase_identities.sql`. A first verified sign-in creates a dedicated admin person linked to the Firebase UID; it does not merge or delete legacy demo people. Firebase-managed people cannot be edited or deleted via the demo user editor. Sessions persist across restarts; signing out clears the app's selected identity and in-memory views. Deploy the protected API and updated app together.

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
npm start
```

The historical seed and import workflows described below apply **only before migration 018**. They are blocked for library-service databases.

Migrations and the fictional demo seed are explicit commands; neither runs at startup. To import the title list in `server/data/titles-import.tsv` (title, author, ISBN-13), run `npm run import-titles -- --dry-run` to preview and then `npm run import-titles`. Titles whose ISBN already exists are skipped, so it is safe to rerun. Imported titles start with 0 pages, which can be edited in the catalogue. To create one kit per title that has no kit yet (10 copies each, at the first configured branch, barcode equal to the title name), run `npm run create-kits -- --dry-run` to preview and then `npm run create-kits`. If any title name clashes with an existing kit barcode, nothing is written and the clashing names are listed. To load the demo 2027 schedule in `server/data/demo-schedule.tsv` (club_id, ISBN-13, meeting date), run `npm run import-demo-schedule -- --dry-run` and then `npm run import-demo-schedule`. This creates one sample member per club, a `demo-cycle-2027` cycle with a 2026-12-15 voting deadline, meeting slots, and one ballot per club ranked by meeting order. It requires the clubs and titles to exist already, and it runs once; later runs report that it was already imported. Back up the target database and verify the connection before upgrading an existing deployment. The seed creates the initial demo admin and is repeatable without overwriting edits. Conflicting existing IDs or barcodes cause the affected seed step to fail transactionally. Use an appropriately scoped database account.

### Repair an outdated database safely

The following repair procedure applies only before migration 018; the repair tool blocks library-service databases.

If a database branch or restore may have lost schema changes, do **not** run `npm run migrate` blindly. Migration 007 can remove duplicate monthly meetings and their assignments, and migration 009 normally drops the old kit-label table. First stop app writes, take a verified restorable backup, and verify that the server's `DATABASE_URL` and PostgreSQL search path select the intended database and schema. Do not share the URL.

From `server`, run the read-only preflight:

```powershell
npm run repair-schema -- --check
```

The report names the database and schema, checks the migration ledger and required tables, columns, constraints, indexes and trigger against the current schema, and reports label counts without printing rows. It accepts a fully current schema or the complete pre-009 schema through 008. A `blocked` result makes no changes: inspect the reported discrepancies and restore missing data or resolve the schema with an administrator. The tool intentionally does not repair missing older migrations, ambiguous or partial title-label migrations, unknown numbered migrations, changed schema definitions or lost data. Differences between PostgreSQL versions or custom schema definitions may also require investigation. A recorded migration does not prove its data survived.

Only if the report says `repairable` and its counts make sense, keep writes stopped and run:

```powershell
npm run repair-schema -- --apply
```

The command repeats its checks, locks the relevant tables, copies the distinct kit-label union to titles, updates affected revisions and records migration 009 in one transaction. It retains `kit_label_assignments` as a historical snapshot, but removes its kit and label foreign keys so subsequent deletions are not blocked or cascaded into the snapshot. It is not kept in sync and can contain stale references; never replay it over current title tags. No other records are deleted. The command rolls back on failure, and repeating it on a current schema is a no-op. It does not run seed or imports.

Afterward, rerun `--check`, verify the expected title labels and normal Catalog and Preferences operations, and only then resume writes. A successful schema check cannot prove lost data was recovered; use the backup to investigate missing records. The migration ledger can also be inspected without changing it:

```sql
SELECT current_database(), current_schema();
SELECT name, applied_at FROM schema_migrations ORDER BY name;
```

### Populate title descriptions from ISBNdb

This legacy command is unavailable after migration 018.

Back up the intended database first, verify `DATABASE_URL`, and set `ISBNDB_API_KEY` privately in the server environment or root `.env`. Run from `server`:

```powershell
npm run enrich-titles -- --dry-run
npm run enrich-titles
```

The dry run performs real ISBNdb lookups and prints proposed old and new values but does not write to the database. Review its output before running the second command. Both passes consume ISBNdb requests and may incur account limits or costs; check your account's allowance. Requests are sequential with a 1,100 ms delay between lookups. If your account needs more spacing, use for example `npm run enrich-titles -- --dry-run --interval-ms=2000` and include the same interval on the write run. The delay must be 1,000–3,600,000 ms and does not guarantee compliance with every plan's limits.

Every valid ISBN is checked, including titles with existing descriptions. A nonempty ISBNdb synopsis replaces the existing description. It is stored as formatted text: `<p>` paragraphs with `<b>` bold, other HTML removed, entities decoded and then escaped, and the result truncated to 4000 characters without breaking tags. If none is returned, the existing description is kept. Catalog synopses accept `<p>` and `<b>` and are sanitised on save; the rendered view shows paragraphs and bold text, while PDF exports use plain text. Other supported metadata (name, author, pages, source genres, cover, publisher, publication date, binding and language) fills empty fields only. Page count zero means unknown. Notes, format flags, ISBNs, kits and controlled title labels are not changed. Equivalent ISBN-10 and ISBN-13 values share one lookup per run. Missing or invalid ISBNs and ISBNdb 404s are reported and skipped. The output contains catalog data, so store it appropriately.

The command stops with a nonzero exit code on a service error such as a timeout, invalid response, authentication failure or rate limit. Successful earlier updates remain committed. Concurrently edited or removed titles are skipped and reported as conflicts, also producing a nonzero exit code. Resolve the cause and rerun; unchanged values do not create extra revisions. Each run requests ISBNdb data again, so a later result can replace a description again. A dry run is a point-in-time preview, not a guarantee of later responses or unchanged catalog records.

To clean synopses already stored with HTML markup, run from `server`:

```powershell
npm run clean-synopses -- --dry-run
npm run clean-synopses
```

This targets only synopses containing HTML tags or entities other than the formatted `<p>`, `<b>` and escaped text, across all library services, and works after migration `018_library_services` (where `enrich-titles` is blocked). Titles with an ISBN are looked up in ISBNdb and the formatted ISBNdb synopsis is used. Titles without a usable ISBN or ISBNdb synopsis are formatted locally from the stored text. Already-formatted synopses are left alone, so reruns are safe. Each change is saved with a revision check, and a title edited during the run is reported as a conflict and needs a rerun. The command uses the same ISBNdb request spacing and `--interval-ms` option as `enrich-titles`, and it exits nonzero if a lookup fails or any conflicts occur. Output lists title IDs and counts only.

To refresh the synopsis of every title from ISBNdb, including titles already formatted, run from `server`:

```powershell
npm run refresh-synopses -- --dry-run
npm run refresh-synopses
```

Each title with an ISBN is looked up and its ISBNdb synopsis replaces the stored value when it differs. Titles without an ISBN, titles not found in ISBNdb, and titles with no synopsis returned keep their stored text. The command uses the same revision checks, request spacing, `--interval-ms` option and exit codes as `clean-synopses`. Output lists title IDs and counts only.

### Import 2027 demo preferences

This legacy command is unavailable after migration 018.

The separate preferences import uses `server/data/demo-preferences-2027.csv`, which contains the supplied club names and preferences. Review whether this data is appropriate for the target environment before publishing it. Back up the database, verify `DATABASE_URL`, run migrations, and configure at least one branch in Admin lending settings. From `server`:

```powershell
npm run import-demo-preferences -- --dry-run
npm run import-demo-preferences
```

Review the preview's new clubs, titles and kits, selected ballot members, compressed rank gaps, history and availability warnings before importing. The command creates `demo-preferences-cycle-2027`, separate from `demo-cycle-2027`: 39 ballots, 773 ranked selections and an undated slot for each CSV club in each month of 2027. It creates no schedule assignments. Missing clubs use Central, size 10 and pickup. Existing member leaders are preferred, then the member with the first ID; a demo member is created only when needed. Other memberships and clubs outside the CSV are left alone.

The importer matches existing titles by ISBN or unambiguous title and author, using the reviewed aliases in `server/src/import-demo-preferences.js` and `server/data/titles-import.tsv`. Check the preview and resolve ambiguous catalog or club matches before retrying. Missing selected titles are added with known metadata or empty ISBN and zero pages; an absent author is recorded as `Unknown author`. Numbered sets are treated as the same title, not a kit-specific preference. Each preferred title without a kit receives one available 10-copy demo kit at the first configured branch, with a `demo-2027-` barcode. Existing kits and reading history are not changed. The import is transactional and runs once; later runs do not overwrite edits. A conflicting cycle ID without the import marker stops the import.

After importing, refresh the app, sign in as an administrator, and select **Demo preferences 2027** on Preferences and Schedule. Individual ballots appear when selecting the chosen member on Home. The cycle is collecting with a 2026-12-15 preference deadline; after that date voting is closed unless administrators adjust the deadline and any incompatible meeting dates on Cycles. On Schedule, use **Generate locally**, review warnings and unassigned slots, then save the draft. Undated slots use each club's meeting rule, which defaults to the first Monday. Previously read titles are excluded from priority views and scheduling even though their ballots remain; kit status, other schedules, turnaround buffers and limited kit supply can also leave slots unfilled. Adjust kits or slots manually as needed.

### Demo cycles (migrations 010 to 012)

`npm run migrate` also applies three data migrations that leave exactly two demo cycles: `demo-preferences-cycle-2027` ("Demo schedule 2027") and `demo-preferences-cycle-2028` ("Demo open for voting 2028").

`server/migrations/010_demo_preferences_2027_aligned.sql` creates `demo-preferences-cycle-2027-aligned` as a copy of `demo-preferences-cycle-2027` whose selections follow the baseline preference lists (39 clubs, 773 ranked selections; repeated titles keep their first position and ranks are compacted). Each club gets one ballot held by the member who holds the source ballot (otherwise the club leader, then the lowest member ID). It has only selected titles: no read/won't-read marks, finalized rankings or schedule assignments. `server/migrations/011_demo_preferences_2028.sql` then moves that cycle to 2028 as `demo-preferences-cycle-2028`, with every date one year later.

`server/migrations/012_demo_cycles_2027_2028.sql` swaps the years so the aligned preferences are the developed 2027 schedule. The cycle currently in `demo-preferences-cycle-2028` becomes `demo-preferences-cycle-2027` ("Demo schedule 2027"): dates move back one year (deadline 2026-12-15), and its status, ballots, slots and schedule assignments are kept. The older, edited `demo-preferences-cycle-2027` becomes `demo-preferences-cycle-2028` ("Demo open for voting 2028"): dates move forward one year (deadline 2027-12-15), its status is set to `collecting`, its ballots (including read/won't-read marks and finalized rankings) are kept, and its schedule assignments are discarded. Every other cycle is deleted, and a notice lists each one. Cycle IDs cannot be updated in place, so the migration stages both cycles, deletes all cycles and reinserts them under the swapped IDs; cycle revisions increase by one.

Each migration does nothing when its input cycles are missing or it has already been applied; 012 also needs both demo cycles to exist. For 010, clubs match by normalized name, and titles match by ISBN, then by name and author, then by the same author with a name that starts the other, to absorb ISBN, spelling and punctuation differences. 010 stops, rolling back the whole `migrate` run, if any club or title is missing or ambiguous. The only title it adds is *Inheritance* by Kath O'Connor, with one 10-copy demo kit at the first configured branch when one exists. Deleting cycles in 012 cannot be undone, so back up before running them on a shared database and preview in a transaction you roll back; each migration reports a notice with its counts.

### Reconcile 2027 demo preference rankings

This legacy command is unavailable after migration 018.

The standalone `server/scripts/reconcile-demo-preferences-2027.sql` corrects existing ballots in `demo-preferences-cycle-2027` using the 223 club/title/rank rows embedded in the script. It does not read an external CSV. It is not a schema migration and does not run with `npm run migrate`. It updates all existing ballot holders in each matched club; it does not create missing ballots or people. For those ballots it clears all read/won't-read marks, selects matched titles from the embedded data, and preserves other selected titles in their existing relative order. Required positions take priority; if too few selections exist to fill earlier positions, the script compacts gaps and reports the resulting positions.

The script tries normalized exact names and reviewed ISBN aliases, then fuzzy name matching. Fuzzy matching uses padded-trigram Dice similarity: club score must be at least 0.60; title name score at least 0.60, author score at least 0.35, and the weighted score (75% title, 25% author) at least 0.65. A missing source author or unknown database author receives an author score of 1. Review fuzzy matches and alternatives carefully. Weak or tied matches, and clubs with conflicting mappings, are skipped and reported. A club with no resolved titles is not changed. The input must have unique club/title and club/rank combinations and ranks from 1 through 500.

Before running, stop app writes, take a verified restorable backup, and verify the database, schema, and cycle. Install a compatible PostgreSQL `psql` client; the script supports `psql` 17.6 with PostgreSQL 18 without relying on CSV `COPY` termination. Set `DATABASE_URL` privately in the environment or repository-root `.env`, as for the server. From PowerShell:

```powershell
Set-Location 'C:\Book-Club-Kit-Management\server'
npm run reconcile-demo-preferences
```

Adjust the directory for your installation. The runner passes connection details to `psql` through its environment, not command-line arguments; unsupported URL parameters cause an explicit error. The process environment takes precedence over `.env`. The script prints the connected database, schema and user, then previews mappings, skipped rows, each changed ballot's before/after marks, rank gaps and finalized rankings to clear. The output contains member information; handle it accordingly. Review the full output before typing `APPLY` at the prompt. Any other response rolls back; an error also aborts the transaction. The cycle lock is held while you review, so do not leave the prompt open indefinitely. On a serialization failure, rerun and review a fresh preview.

Changed clubs lose their finalized rankings, matching the normal ballot-save workflow; preferences are recalculated from ballots. Schedule assignments and club reading history remain unchanged, so history may still exclude a selected title. A repeat run with unchanged data is a no-op, but running it again after later ballot edits will reconcile those edits again. Refresh the app and audit the results after applying.

### Reconcile club meeting rules

This legacy command is unavailable after migration 018.

The standalone `server/scripts/reconcile-club-meeting-rules.sql` embeds the 43 club rules from the supplied workbook; it does not read the spreadsheet at runtime and is not a migration. It matches normalized names or the listed best-guess aliases, with no automatic fuzzy matching. Review every alias: unmatched names, multiple candidates, multiple source names targeting one club and revision-overflow clubs are reported and skipped. It does not create clubs. The preview shows each candidate, old and proposed values, and any retained unknown weekday or occurrence. For six-weekly source rules (cadence 1.5), it maps to every 6 weeks (cadence 2) and retains the existing unknown parts.

Stop app writes, take a verified restorable backup, verify the target database and schema, and ensure migrations 013 and 014 have been applied. Install a compatible PostgreSQL `psql` client and set `DATABASE_URL` privately in the server environment or root `.env`. From `server`:

```powershell
npm run reconcile-club-meeting-rules
```

The runner passes connection details through the environment, not command-line arguments. The script prints the connected database, schema and user, locks the clubs table against writes, and displays a full preview. Type `APPLY` only after reviewing it; any other response rolls back. Do not leave the prompt open indefinitely. On a serialization failure, rerun and review a fresh preview. Changed clubs get a revision increment; unchanged clubs do not. Repeating the script is a no-op unless rules have since been edited, in which case it would overwrite those edits.

### Align Hume club rules

Use `server/scripts/align-hume-club-rules.sql` instead of the reconcile script for the Hume tenancy. It requires migrations 018 and 020, runs only against the `hume` library service, and sets both meeting and pickup occurrence and weekday for the 43 clubs in `book club meeting rules (1).xlsx`. Relative pickups such as "Mon Before" are approximated as the nth weekday of the week in the month before the meeting, since pickup is always in the previous month. Six-weekly clubs keep their existing meeting occurrence; the workbook gives none. Beauties & The Beast and Broadie Mermaids keep their existing relative pickups, because their meeting weekday is not in the workbook. "On Day" pickups are kept. Aliases are best guesses: review every alias in the preview before typing `APPLY`. Unmatched, ambiguous and multi-source matches are skipped. The script does not change meeting slots or schedule assignments, and changed clubs get a revision increment.

From `server` (same database and psql setup as above):

```powershell
npm run align-hume-club-rules
```

Type `APPLY` only after reviewing the preview; any other response rolls back.
All workbook rules start on 2027-01-01, but the app cannot store that effective date: updated rules apply to undated meetings in any cycle and to meetings rebuilt by full generation. The workbook's per-club pickup and return rules are printed for review, not applied; each club's pickup rule (pickup week and weekday) sets its pickup date in the month before the meeting, and return dates are seven days after the meeting. Checkouts longer than the library loan length are flagged as warnings. Existing slots, dates and assignments are untouched by this script. Subsequent confirmed full generation replaces shown clubs' dates and assignments, including locked ones. Refresh the app and review the resulting schedules.

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

For a physical device, use a reachable HTTPS server address, not `localhost`. Expo embeds `EXPO_PUBLIC_API_URL` in the client bundle, so never place secrets there. Restart or reload Expo after changing configuration.

Cycles uses native date pickers on Android and iOS, and browser date controls on web. Existing custom development builds must be rebuilt to include the date-picker native module; it is included in Expo Go.

Choose a demo member or sign in with an existing Firebase account on Home. Sign-in exposes the Admin tab and other staff workflows; a restored Firebase session signs the user back in automatically. Member pages load enrolled-club data and the catalogue needed for voting; the club directory and leader review load when opened. Administrator pages load the data their workflows require, including cross-cycle constraints for scheduling. Loaded page data is held in memory until an identity change and is refreshed with **Refresh page data** (or **Refresh your clubs** on Home); shared data is not saved in device storage. Switching or clearing the selection discards that user's in-memory data, not shared database records. Pending saves must finish and unsaved edits may need confirmation before leaving a page.

Demo members and leaders can be impersonated by anyone with API access. Scoped requests reduce data transfer but do not authenticate demo members. Create demo users and manage their club memberships on the Admin tab; members use **Manage enrolment** on Home, then choose one of their clubs in Preferences to set cycle preferences. Refresh the relevant screens on a second device to see changes. Conflicting edits require a refresh before retrying. If a selected user is removed or their role changes elsewhere, return Home and refresh the user list.

Admins can preview and permanently delete a club on Clubs. This also removes its memberships, kit links, reading history, preferences, finalized rankings, meetings and assignments, including locked and published assignments; other clubs and the cycles remain. Kits, kit statuses and circulation events are retained, and reserved or checked-out kits are highlighted for manual follow-up. Loan associations and due dates can disappear, and a published cycle can remain published with no meetings. This development workflow is not a production-safe circulation or audit process.

Preferences shows the cycle phase and whether choices can be edited. Members see their selected titles in ranked order, can move them with the arrows or drag handle, and can expand the add-title palette to search and filter. On wide desktop web screens the palette and ranking appear side by side; on smaller screens they remain stacked. On desktop web, hover over a title or use keyboard focus to reveal its controls; touch devices show the controls without hovering. The details button shows the synopsis and title labels. Labels help find titles but do not reserve a kit. **Won’t read** and **Already read** move titles into separate bins; immediate Undo restores a selected title at its previous rank, while restoring from either bin returns it to the palette unselected. Already-read marks are individual choices, separate from club reading history; titles in the club's history are excluded from the palette.

Autosave is the default. Choose **Draft** to keep changes locally until **Save current draft** is pressed. Drafts are separate for each club and cycle and remain in memory only while Preferences is open; leaving or switching users prompts before discarding them, but forced termination can still lose them. Switching back to autosave offers Save all, Discard all or Cancel. If a save conflicts or its outcome is uncertain, the draft is retained and must be reconciled or discarded before retrying. Preferences remain editable in drafted or published cycles, but saving changes does not alter existing assignments and clears the club's finalized ranking. Club leaders can expand the review to finalize the club ranking after saving or discarding that club and cycle's draft.

Staff and admins can filter clubs or hide clubs and titles from the preference comparison. On web, use the grid's arrow icons to order titles by a club's ranking or clubs by their ranking of a title; select again to reverse the direction. Reset sorting returns both axes to their default order, and the title column remains visible while club columns scroll horizontally. On native, choose a club to review its ranked titles, and expand a title to compare all shown clubs. Use the ranking controls to reverse either order. Unranked entries always appear last. Clear hidden titles restores title rows; the Clubs shown panel restores clubs. Contested counts show how many visible clubs rank a title, using finalized rankings where available and combined rankings otherwise. Club summaries and Title demand are expandable; demand counts clubs with member selections, which can differ from ranked-club counts.

Staff and admins can export the current preference comparison as CSV or PDF. Both files include all clubs in **Clubs shown**, exclude hidden titles, and follow the current grid order; the native review club determines title order but does not restrict the clubs exported. The grid has one row per title and one column per club, with rankings in the cells and blanks for unranked titles. It does not include individual member votes. The landscape A3 PDF uses multiple pages for large grids, repeating titles and club headings as needed. Missing covers use placeholders; shortened labels are reported after export, and CSV contains the full text. Web downloads the file; mobile opens the share sheet. Each export is a snapshot of the selected cycle.

**Export HTML** creates a self-contained offline snapshot with the same shown clubs and visible titles. Open it in a browser to search and select clubs or titles, or toggle rank colours (1–3, 4–6 and 7+) and contested-title emphasis (at least two currently visible clubs rank a title). Reset restores the exported selection; the document never updates the app or retrieves later changes. If JavaScript is disabled, the full grid remains readable without interactive controls. Some mobile share-sheet previews disable scripts, so save the file and open it in a browser. Anyone receiving the file can view the entire exported snapshot, even if filters hide some entries.

For members, Schedule shows one drafted or published cycle at a time for their enrolled clubs. Use **Change cycle** when more than one has meetings. The default is the current cycle, then the nearest upcoming or most recent past cycle. Meetings displays a calendar with past and unassigned meetings available too. Books groups assigned meetings by title; select a book or meeting to see its title details and labels alongside scheduled pickup/delivery and return dates. Dates do not confirm a checkout or return. For staff and admins, Grid is the default, with Meetings and Kits views also available. Clubs shown filters all three views; Hide beside a grid row removes that club from the selection, and the panel can restore it. Kits groups assigned meetings by physical kit, while unassigned meetings appear in Grid and Meetings.

Staff and admins can generate A4 handouts for the selected cycle and all clubs in **Clubs shown**, independent of the schedule view or title highlighting. Choose one combined PDF or a ZIP containing a separate one-page PDF per club. Unassigned meetings and clubs without meetings are included. Each handout shows meeting dates, titles, covers and stored descriptions; missing covers use placeholders and descriptions may be shortened to fit. If all meetings cannot fit legibly, the export reports the affected clubs instead of omitting meetings. Applied unsaved changes are included and labeled on the handout; unapplied editor selections are not included. Web downloads the file and mobile opens the share sheet.

On Schedule, staff and admins choose **Grid**, **Meetings** or **Kits** above the schedule, then use **Export CSV** or **Export PDF** for that view. Grid exports arrange title assignments by club and month, Meetings exports group meetings by club, and Kits exports group assigned meetings by physical kit. Grid and Meetings include unassigned meetings; Kits does not. Staff exports use the selected cycle, the **Clubs shown** selection and applied unsaved local edits (marked as such). When a title is highlighted in Grid, PDF exports the matching clubs as a single landscape page with other titles dimmed and the highlighted covers connected; CSV still includes all selected clubs. The PDF action is disabled when no selected clubs match, and warns if the grid must be scaled to very small text. Member exports include meetings, including unassigned ones, for selected enrolled clubs in the selected cycle. CSV includes schedule, title and kit details; PDF includes available title cover images. Missing, inaccessible or unsupported covers use placeholders and are reported after export. PDF export reports an error if its bundled font cannot display a character; CSV remains available. Web downloads a file; on mobile use the share sheet to save it. Exports are snapshots and do not update automatically. Demo roles are not access controls.

On desktop web, Schedule uses the available width and its Grid fits 12 months at a 1,280 CSS-pixel viewport at normal zoom. Additional months can be reached by scrolling horizontally. On native, staff and admins review one shown club at a time in a vertical monthly list. Choosing a club to review does not change Clubs shown, generation or export scope. A highlighted title limits the club picker to matching shown clubs and marks its matches; other months remain visible but dimmed. The highlighted PDF still shows all matching shown clubs with connecting lines.

Staff and admins can use **Download instructions** on Schedule for an illustrated guide to generating, reviewing, correcting, saving and publishing schedules, with screenshots from Demo preferences 2027. On mobile, choose a save destination from the system share sheet. Screenshots reflect the demo when captured, so current assignments and cycle status may differ.

For collecting or drafted cycles, select a meeting in Grid to open its editor in a dialog and assign, clear or swap kits and lock or unlock assignments, or generate a schedule locally. The title picker shows cover thumbnails and lists unused ranked titles first, then ranked titles already assigned to the club, followed by unranked titles. Expand a title to compare physical kits and their local conflict previews; ranked titles without kits are shown as unavailable. Previews use a snapshot and are not a guarantee of availability. Clear removes the current assignment locally; Save selection applies a pending kit or date only to the local proposal. Closing the dialog asks before discarding an unapplied kit, date or swap selection; applied local changes remain. Applied changes are shown as unsaved across all three views and remain only while the page is open. Save draft explicitly creates a shared draft; publishing is separate. Confirm before discarding, regenerating or leaving with unsaved changes; forced app termination can still lose them. Published schedules are read-only on Schedule: reopen the cycle on Cycles before editing, with the circulation implications described below.

Each club's fairness score averages the priority weight of its assigned titles over all its meeting slots. First priority scores 100%, the last of N priorities scores 1/N, and unranked, unassigned or repeated titles score zero. The finalized ranking is used when present; otherwise the combined member ranking is used. Clubs with no ranked priorities or no slots show N/A.

Staff grid cover badges show this same club priority; a dash means the assigned title is unranked. The red exclamation mark separately indicates an assignment needing review.

On Clubs, staff choose a cadence of **Monthly** or **Every 6 weeks**, a meeting occurrence (week of month and weekday), a pickup offset from −7 to +7 days relative to the previous meeting, and optional skipped months (for example January and December). Each title is picked up within 7 days before or after the previous meeting (offset 0 is the same day as the meeting). The first meeting of a cycle has no previous meeting, so its pickup uses the meeting rule applied to the previous calendar month. **Every 6 weeks** starts at the club's first meeting in the cycle (by its week-of-month and weekday rule) and then meets every 42 days until the cycle ends; meetings falling in skipped months are dropped without resetting the 42-day step. Return is always 7 days after the meeting. Saving the club does not change existing meetings. Full generation creates or replaces slots for all shown clubs, including clubs with no existing slots, using their current cadence and meeting rules. After confirmation it replaces their existing dates and assignments, including locks. Single-club generation creates missing slots and keeps existing dates and assignments except where a confirmed cadence change removes meetings. The Cycles fill action adds missing cadence months without removing existing slots. Published cycles are not changed without reopening.


Staff can also choose a meeting weekday and its first, second, third, fourth or last week of each month. The weekday falls in that Monday-to-Sunday week, so "3rd Monday" and "3rd Wednesday" share the same week. The default is the first Monday. A date that falls outside the month moves one week inward, keeping its weekday. Changing the rule alone does not move dated or staged meetings; full regeneration replaces them with current rule dates after confirmation. A replacement meeting on or before the preference deadline remains undated and unassigned with an explanation: adjust the date or deadline. Other replacement dates are retained even without an assignment. Loan windows and turnaround conflicts use the actual meeting dates.

To deploy cadence and meeting rules, stop old API instances and writers, back up and verify the intended database, and review all pending migrations before running `npm run migrate` from `server`. Migration 013 converts recognized cadence values and stops with a list of any unrecognized values; correct those values before retrying. Migration 014 defaults clubs to first Monday, and Migration 015 defaults their offset to 0; neither changes existing meetings. Migration 021 adds the previous-meeting pickup flag, defaulting to off, so existing pickups are unchanged. Migration 022 allows cadence value 2 (every 6 weeks) and does not change existing clubs. Migration 023 removes the restriction that previous-meeting pickup applies only to six-weekly clubs, so all cadences can use it; existing clubs are unchanged. Deploy the updated API and app together and refresh or update all clients before allowing schedule generation: older clients do not apply offsets and can otherwise generate the wrong pattern. Club updates that omit the offset are rejected. Do not run the demo seed against an existing database.

**Clubs shown** also selects clubs for full local generation. Hiding a club alone changes no assignments; after confirmation, full generation removes hidden clubs' assignments locally, including locked assignments. Their meeting slots and member preferences remain, and other cycles still constrain kit availability. Save draft makes the removals shared; every meeting must be assigned before publication, so show the clubs and regenerate or assign their meetings manually first. Showing a club again does not restore its previous assignments. At least one club must be shown to generate a full schedule. Title highlighting does not change the selection, and single-club generation fills only that club's empty meetings without removing other clubs' assignments.

Choose **Prioritise clubs** (the default) or **Prioritise utilisation** before generating; changing the selection does not regenerate. Both first try to fill meetings with preferred kits, then use bounded rearrangements without reducing coverage. Clubs mode improves the lowest club fairness scores first. Utilisation mode seeks fewer distinct physical kits in the cycle, then favours priority-weighted popular titles among participating clubs, then fairness. It may trade a higher club choice for kit reuse, but does not remove inventory. Other-cycle loans still constrain availability. Single-club generation retains existing assignments and can fall back to unread unranked titles; the mode affects ranked order rather than running full-cycle optimisation.

Both full-generation modes replace shown clubs' locked assignments after explicit confirmation. They respect other cycles, reading history, kit availability and turnaround rules. Search-limit messages mean further improvements may be possible, not that the result is optimal or every remaining slot impossible; limited kits, preferences or meeting dates can still leave gaps. Generation runs in small batches so the app remains responsive, and the result remains local until validated and saved.

The illustrated PDF's schedule and generation guidance can be updated by editing `scripts/update-schedule-guide.py`, installing `pypdf==7.1.0` and `reportlab==5.1.0` in a Python environment, and running `python scripts/update-schedule-guide.py`. It updates pages 2, 3, 4 and 6 while retaining their illustrations and the other pages.

Manual overrides can include already-read or repeated titles, overlapping loan windows and unavailable or checked-out kits. The server validates current data and requires acknowledgement of the specific warnings before saving a draft and again before publication. Such schedules may be physically impossible and can affect other cycles and circulation; review warnings carefully. Record integrity and full assignment before publication remain mandatory. If shared inputs change, preserve or inspect your local work, refresh, then discard it and start again; after a failed or uncertain save, refresh, discard local changes and inspect the shared schedule before starting again. Schedule changes require Firebase administrator sign-in.

On Cycles, staff and admins can confirm **Reopen for editing** on a drafted or published cycle. This changes it to collecting and retains slots, assignments, locks, ballots and finalized rankings; a later ballot change still invalidates that club's final ranking. Voting stays closed if the deadline has passed: edit the deadline and any incompatible meeting dates first. Changing or removing a slot deletes its assignment, including locked or in-use assignments, without another confirmation; other assignments remain. Full schedule regeneration replaces dates and assignments, including locked ones, after confirmation; this can affect active loans and member visibility when saved. Single-club generation retains existing assignments except for confirmed cadence removals.

Reopening a published cycle removes its schedule from member views. Active-loan due dates and associations may disappear, affecting overdue, history and availability checks. Redrafting avoids checked-out kits and reading history by default; manual overrides require explicit warnings. This development feature is **not a production-safe circulation workflow**.

In Catalog & kits, staff and admins can use **Add title** or **Add kit**, or an existing record's edit button, to open a dialog. Canceling a changed form asks before discarding it. If a save's outcome is uncertain or conflicts with another edit, refresh and inspect the shared catalog before reopening the form.

The catalog lists titles first; search titles, authors, ISBNs, kit or copy barcodes, and controlled title labels. Expand a title to see its kits. Staff can manage shared genre and book-club vibe lists and assign labels when editing a title, including one without kits. These lists are independent of ISBNdb's source genres. Deleting a label requires confirmation and removes it from affected titles, not the titles or kits themselves.

On Preferences, search title labels or filter by genres and vibes. A title matches when it has every selected label, even if it has no kits. Labels are for discovery: a ballot selects a title, not a specific kit, and a match does not guarantee availability.

Before deploying this feature, back up the intended database and stop old API instances and other writers. Run `npm run migrate` in `server` to apply `009_title_labels.sql`, then deploy and verify the updated API before deploying the app. The migration combines all kit labels for each title and preserves source genres. Do not seed an existing database. Restoring the backup would discard writes made since the backup; plan recovery accordingly.

Older clients continue to see the title's shared labels on each kit. Editing labels on an existing kit replaces the title's labels for all its kits; creating a kit adds submitted labels without erasing existing ones. Moving a kit while also changing its labels is rejected: move it first, then edit the labels. Older clients omitting labels preserve the title's labels. The updated app requires the updated API.

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

Render supplies `PORT`. Run migrations deliberately against the intended database, then deploy the updated API and app together. The `/api/shared` endpoint requires a selected service, as do other service-dependent endpoints; older clients without service context cannot use them. The legacy seed is unavailable after migration 018. Render's root directory contains only `server`, so it does not depend on root Expo files.

## Checks

Run `npm test` in `server` for backend tests. PostgreSQL integration tests run only when both `TEST_DATABASE_URL` and `TEST_DATABASE_CONFIRM=isolated` are set for a dedicated test database; they create and remove their own uniquely named schema. Never point them at a database containing data you care about. The demo-preferences integration test also needs the root development dependencies installed to exercise app scheduling logic.

From the repository root, run `npm test`, `npx tsc --noEmit` and `npx expo lint` for the Expo app.
