# Book club kit prototype

This Expo prototype uses a separate Express API and PostgreSQL for shared users, club memberships, clubs, titles, kits, preferences, cycles and schedules. A club–kit link is an undated association, **not** a checkout; one kit can be linked to multiple clubs. Refresh the relevant screen to see changes made elsewhere.

**Public demo only:** there is no login or authorization. Anyone who can reach the API can read, change or delete shared data. Demo roles and CORS are not security controls. Use fictional data only; do not enter real names, addresses or other sensitive information.

Users can belong to multiple clubs and have separate preferences for each club and cycle. Leaders are assigned per club. Reading history, lending settings, kit status and circulation events are shared because schedules depend on them. Each launch requires a user selection on Home; club enrolment is shared. Standard members manage club enrolment on Home and see only their enrolled clubs in Preferences. Clubs, Catalog & kits and Cycles are hidden from members. Previous locally created users, preferences, cycles and schedules are not imported.

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

### Populate title descriptions from ISBNdb

Back up the intended database first, verify `DATABASE_URL`, and set `ISBNDB_API_KEY` privately in the server environment or root `.env`. Run from `server`:

```powershell
npm run enrich-titles -- --dry-run
npm run enrich-titles
```

The dry run performs real ISBNdb lookups and prints proposed old and new values but does not write to the database. Review its output before running the second command. Both passes consume ISBNdb requests and may incur account limits or costs; check your account's allowance. Requests are sequential with a 1,100 ms delay between lookups. If your account needs more spacing, use for example `npm run enrich-titles -- --dry-run --interval-ms=2000` and include the same interval on the write run. The delay must be 1,000–3,600,000 ms and does not guarantee compliance with every plan's limits.

Every valid ISBN is checked, including titles with existing descriptions. A nonempty ISBNdb synopsis replaces the existing description; if none is returned, the existing description is kept. Other supported metadata (name, author, pages, source genres, cover, publisher, publication date, binding and language) fills empty fields only. Page count zero means unknown. Notes, format flags, ISBNs, kits and controlled title labels are not changed. Equivalent ISBN-10 and ISBN-13 values share one lookup per run. Missing or invalid ISBNs and ISBNdb 404s are reported and skipped. The output contains catalog data, so store it appropriately.

The command stops with a nonzero exit code on a service error such as a timeout, invalid response, authentication failure or rate limit. Successful earlier updates remain committed. Concurrently edited or removed titles are skipped and reported as conflicts, also producing a nonzero exit code. Resolve the cause and rerun; unchanged values do not create extra revisions. Each run requests ISBNdb data again, so a later result can replace a description again. A dry run is a point-in-time preview, not a guarantee of later responses or unchanged catalog records.

### Import 2027 demo preferences

The separate preferences import uses `server/data/demo-preferences-2027.csv`, which contains the supplied club names and preferences. Review whether this data is appropriate for the target environment before publishing it. Back up the database, verify `DATABASE_URL`, run migrations, and configure at least one branch in Admin lending settings. From `server`:

```powershell
npm run import-demo-preferences -- --dry-run
npm run import-demo-preferences
```

Review the preview's new clubs, titles and kits, selected ballot members, compressed rank gaps, history and availability warnings before importing. The command creates `demo-preferences-cycle-2027`, separate from `demo-cycle-2027`: 39 ballots, 773 ranked selections and an undated slot for each CSV club in each month of 2027. It creates no schedule assignments. Missing clubs use Central, size 10 and pickup. Existing member leaders are preferred, then the member with the first ID; a demo member is created only when needed. Other memberships and clubs outside the CSV are left alone.

The importer matches existing titles by ISBN or unambiguous title and author, using the reviewed aliases in `server/src/import-demo-preferences.js` and `server/data/titles-import.tsv`. Check the preview and resolve ambiguous catalog or club matches before retrying. Missing selected titles are added with known metadata or empty ISBN and zero pages; an absent author is recorded as `Unknown author`. Numbered sets are treated as the same title, not a kit-specific preference. Each preferred title without a kit receives one available 10-copy demo kit at the first configured branch, with a `demo-2027-` barcode. Existing kits and reading history are not changed. The import is transactional and runs once; later runs do not overwrite edits. A conflicting cycle ID without the import marker stops the import.

After importing, refresh the app, choose a staff user, and select **Demo preferences 2027** on Preferences and Schedule. Individual ballots appear when selecting the chosen member on Home. The cycle is collecting with a 2026-12-15 preference deadline; after that date voting is closed unless staff adjust the deadline and any incompatible meeting dates on Cycles. On Schedule, use **Generate locally**, review warnings and unassigned slots, then save the draft. Undated slots use the first Monday of each month. Previously read titles are excluded from priority views and scheduling even though their ballots remain; kit status, other schedules, turnaround buffers and limited kit supply can also leave slots unfilled. Adjust kits or slots manually as needed.

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

Choose a demo person on Home each time the app starts; roles with up to five users show inline buttons, while larger groups use a searchable picker. Switching to an admin exposes the Admin tab with user management and lending settings. Only the user directory is requested before selection. Member pages load enrolled-club data and the catalogue needed for voting; the club directory and leader review load when opened. Staff pages load the data their workflows require, including cross-cycle constraints for scheduling. Loaded page data is held in memory until a user change and is refreshed with **Refresh page data** (or **Refresh your clubs** on Home); shared data is not saved in device storage. Switching or clearing the selection discards that user's in-memory data, not shared database records. Pending saves must finish and unsaved edits may need confirmation before leaving a page. An older saved selection is ignored.

The demo roles are only interface controls: anyone can switch users or call the API directly, including the legacy full-snapshot endpoint. Scoped requests reduce data transfer but are not authorization. Create users and manage their club memberships on the Admin tab; members use **Manage enrolment** on Home, then choose one of their clubs in Preferences to set cycle preferences. Refresh the relevant screens on a second device to see changes. Conflicting edits require a refresh before retrying. If a selected user is removed or their role changes elsewhere, return Home and refresh the user list.

Admins can preview and permanently delete a club on Clubs. This also removes its memberships, kit links, reading history, preferences, finalized rankings, meetings and assignments, including locked and published assignments; other clubs and the cycles remain. Kits, kit statuses and circulation events are retained, and reserved or checked-out kits are highlighted for manual follow-up. Loan associations and due dates can disappear, and a published cycle can remain published with no meetings. This development workflow is not a production-safe circulation or audit process. The admin restriction is an interface control, not API authorization.

Preferences shows the cycle phase and whether choices can be edited. Members see their selected titles in ranked order, can move them with the arrows or drag handle, and can expand the add-title palette to search and filter. On wide desktop web screens the palette and ranking appear side by side; on smaller screens they remain stacked. On desktop web, hover over a title or use keyboard focus to reveal its controls; touch devices show the controls without hovering. The details button shows the synopsis and title labels. Labels help find titles but do not reserve a kit. **Won’t read** and **Already read** move titles into separate bins; immediate Undo restores a selected title at its previous rank, while restoring from either bin returns it to the palette unselected. Already-read marks are individual choices, separate from club reading history; titles in the club's history are excluded from the palette.

Autosave is the default. Choose **Draft** to keep changes locally until **Save current draft** is pressed. Drafts are separate for each club and cycle and remain in memory only while Preferences is open; leaving or switching users prompts before discarding them, but forced termination can still lose them. Switching back to autosave offers Save all, Discard all or Cancel. If a save conflicts or its outcome is uncertain, the draft is retained and must be reconciled or discarded before retrying. Preferences remain editable in drafted or published cycles, but saving changes does not alter existing assignments and clears the club's finalized ranking. Club leaders can expand the review to finalize the club ranking after saving or discarding that club and cycle's draft.

Staff and admins see a title-by-club comparison by default and can filter clubs or hide clubs and titles from the grid. Use the arrow icons to order titles by a club's ranking or clubs by their ranking of a title; select again to reverse the direction. Unranked entries always appear last. Reset sorting returns both axes to their default order. Clear hidden titles restores title rows; the Clubs shown panel restores clubs. The title column remains visible while club columns scroll horizontally. Contested counts show how many visible clubs rank a title, using finalized rankings where available and combined rankings otherwise. Club summaries and Title demand are expandable; demand counts clubs with member selections, which can differ from ranked-club counts.

For members, Schedule shows upcoming Meetings grouped by year across selected clubs, with past and unassigned meetings available too. Books groups assigned meetings by title; select a book or meeting to see its title details and labels alongside scheduled pickup/delivery and return dates. Drafted and published schedules are included and labeled; dates do not confirm a checkout or return. For staff and admins, Grid is the default, with Meetings and Kits views also available. Clubs shown filters all three views; Hide beside a grid row removes that club from the selection, and the panel can restore it. Kits groups assigned meetings by physical kit, while unassigned meetings appear in Grid and Meetings.

Use **Export CSV** or **Export PDF** on Schedule to save all meetings for the clubs shown, including unassigned meetings. Staff exports use the selected cycle and include applied unsaved local edits, marked as such; members export their selected enrolled clubs across drafted and published cycles. Staff exports use the **Clubs shown** selection; title highlighting and generation exclusions do not independently change it. CSV includes schedule, title and kit details; PDF groups meetings by club and includes available cover images. Missing, inaccessible or unsupported covers use placeholders and are reported after export. PDF export reports an error if its bundled font cannot display a character; CSV remains available. Web downloads a file; on mobile use the share sheet to save it. Exports are snapshots and do not update automatically. Demo roles are not access controls.

On desktop web, Schedule uses the available width and its Grid fits 12 months at a 1,280 CSS-pixel viewport at normal zoom. Additional months can be reached by scrolling each row horizontally. Narrow screens retain the compact layout and horizontal scrolling.

Staff and admins can use **Download instructions** on Schedule for an illustrated guide to generating, reviewing, correcting, saving and publishing schedules, with screenshots from Demo preferences 2027. On mobile, choose a save destination from the system share sheet. Screenshots reflect the demo when captured, so current assignments and cycle status may differ.

For collecting or drafted cycles, select a meeting in Grid to open its editor in a dialog and assign, clear or swap kits and lock or unlock assignments, or generate a schedule locally. The title picker shows cover thumbnails and lists unused ranked titles first, then ranked titles already assigned to the club, followed by unranked titles. Expand a title to compare physical kits and their local conflict previews; ranked titles without kits are shown as unavailable. Previews use a snapshot and are not a guarantee of availability. Clear removes the current assignment locally; Save selection applies a pending kit or date only to the local proposal. Closing the dialog asks before discarding an unapplied kit, date or swap selection; applied local changes remain. Applied changes are shown as unsaved across all three views and remain only while the page is open. Save draft explicitly creates a shared draft; publishing is separate. Confirm before discarding, regenerating or leaving with unsaved changes; forced app termination can still lose them. Published schedules are read-only on Schedule: reopen the cycle on Cycles before editing, with the circulation implications described below.

Each club's fairness score averages the priority weight of its assigned titles over all its meeting slots. First priority scores 100%, the last of N priorities scores 1/N, and unranked, unassigned or repeated titles score zero. The finalized ranking is used when present; otherwise the combined member ranking is used. Clubs with no ranked priorities or no slots show N/A.

Staff grid cover badges show this same club priority; a dash means the assigned title is unranked. The red exclamation mark separately indicates an assignment needing review.

Use **Clubs excluded from generation** to choose clubs to omit from the next full local generation. This is separate from **Clubs shown** and resets when changing cycles. Existing assignments for excluded clubs are removed from the local proposal, with confirmation before removing assignments or unlocking locked ones. Their meeting slots and member preferences remain, and other cycles still constrain kit availability. Save draft makes the proposal shared; every meeting must be assigned before publication, so include the clubs and regenerate or assign their meetings manually first. Single-club generation is disabled while that club is excluded.

Choose **Prioritise clubs** (the default) or **Prioritise utilisation** before generating; changing the selection does not regenerate. Both first try to fill meetings with preferred kits, then use bounded rearrangements without reducing coverage. Clubs mode improves the lowest club fairness scores first. Utilisation mode seeks fewer distinct physical kits in the cycle, then favours priority-weighted popular titles among participating clubs, then fairness. It may trade a higher club choice for kit reuse, but does not remove inventory. Locked kits count towards cycle usage; other-cycle loans still constrain availability. Single-club generation retains existing assignments and can fall back to unread unranked titles; the mode affects ranked order rather than running full-cycle optimisation.

Both modes respect locked assignments, other cycles, reading history, kit availability and turnaround rules. Undated slots use the first Monday of the month. Search-limit messages mean further improvements may be possible, not that the result is optimal or every remaining slot impossible; limited kits, preferences or fixed dates can still leave gaps. Generation runs in small batches so the app remains responsive, and the result remains local until saved.

The algorithm page of the illustrated PDF can be updated by editing `scripts/update-schedule-guide.py`, installing `pypdf==7.1.0` and `reportlab==5.1.0` in a Python environment, and running `python scripts/update-schedule-guide.py`. It replaces page 4 while retaining the other illustrated pages.

Manual overrides can include already-read or repeated titles, overlapping loan windows and unavailable or checked-out kits. The server validates current data and requires acknowledgement of the specific warnings before saving a draft and again before publication. Such schedules may be physically impossible and can affect other cycles and circulation; review warnings carefully. Record integrity and full assignment before publication remain mandatory. If shared inputs change, preserve or inspect your local work, refresh, then discard it and start again; after a failed or uncertain save, refresh, discard local changes and inspect the shared schedule before starting again. Demo roles only control the interface, and the API does not enforce authorization.

On Cycles, staff and admins can confirm **Reopen for editing** on a drafted or published cycle. This changes it to collecting and retains slots, assignments, locks, ballots and finalized rankings; a later ballot change still invalidates that club's final ranking. Voting stays closed if the deadline has passed: edit the deadline and any incompatible meeting dates first. Changing or removing a slot deletes its assignment, including locked or in-use assignments, without another confirmation; other assignments remain. Redrafting replaces unlocked assignments and retains locked ones. Remove and recreate a slot to clear an invalid locked assignment.

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

Render supplies `PORT`. Run migrations deliberately against the intended database, then deploy the updated API before the app; the app requires the scoped user views, enrolment and leader-review endpoints. The legacy `/api/shared` endpoint remains available for older clients. Run the seed only when fictional demo data is wanted. Render's root directory contains only `server`, so it does not depend on root Expo files.

## Checks

Run `npm test` in `server` for backend tests. PostgreSQL integration tests run only when both `TEST_DATABASE_URL` and `TEST_DATABASE_CONFIRM=isolated` are set for a dedicated test database; they create and remove their own uniquely named schema. Never point them at a database containing data you care about. The demo-preferences integration test also needs the root development dependencies installed to exercise app scheduling logic.

From the repository root, run `npm test`, `npx tsc --noEmit` and `npx expo lint` for the Expo app.
