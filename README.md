# Book club kit prototype

This is a fictional, single-device Expo prototype. It runs on the web and uses the same local data model on iOS and Android. It does not connect to a server, authenticate people, send notifications, or integrate with a library catalog.

## Run

Install dependencies with `npm install`, then run `npm run web` for the web app, or `npm start` for Expo. Run `npm test`, `npx tsc --noEmit`, and `npm run lint` to check the project.

## Try the demo

1. In **Settings**, switch to Robin, a member, and select and rank titles in **Preferences**.
2. Switch to Casey, the leader, review and finalize the club ranking.
3. Switch to Morgan, staff, and open **Schedule**. Generate a draft, lock an assignment, re-run the draft, and publish it. Generating closes voting even if the deadline has not passed.
4. In **Circulation**, find a kit by barcode, record pickup or delivery and return, then inspect the copies. An incomplete or damaged kit becomes unavailable; review affected assignments and suggested replacements in **Schedule**.
5. Reload the page to see saved changes. Use the confirmed reset in Settings to restore the fictional sample data.

Staff can add and edit titles, kits, clubs and meetings, create cycles and set deadlines. The role switcher only changes the demonstration view and is not a security or authorization mechanism. Data is stored locally, unencrypted, separately for each browser or device. Do not enter real personal or sensitive information. Clearing browser or app storage removes the data.

The normal Settings reset requires confirmation. If saved data cannot be loaded, the recovery screen's reset button immediately replaces it; saved data validation is limited. Keep any data you want to retain outside this prototype.

The scheduler is a deterministic greedy baseline, not an optimal solver. It uses ranked preferences, prior published-cycle satisfaction and branch as heuristics. Loan windows include the configured turnaround days: a kit due on the first of a month with a three-day buffer cannot be ready again until the fifth. Unfilled or conflicting assignments require staff review. Manual swaps and replacements must pass the same checks, and locks are preserved.

Web and native storage are independent; there is no synchronization, background processing, real barcode scanning, outbound messaging, authentication, or access control. Use manual barcodes and fictional names and addresses only.
