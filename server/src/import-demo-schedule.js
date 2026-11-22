const fs = require('node:fs/promises');
const path = require('node:path');
const { getPool } = require('./db');
const { assertLegacyScriptSupported } = require('./legacy-script-guard');
const { normaliseIsbn } = require('./isbn');

const DEFAULT_FILE = path.join(__dirname, '..', 'data', 'demo-schedule.tsv');
const CYCLE_ID = 'demo-cycle-2027';
const CYCLE_NAME = 'Demo schedule 2027';
const DEADLINE = '2026-12-15';
const GATE = 'seed:demo-schedule-2027';
const LOCK_ID = 180313023;

// Expects tab-separated lines: club_id, ISBN-13, meeting date (YYYY-MM-DD). A header row and blank lines are ignored.
function parseDemoSchedule(content) {
  const meetings = [];
  const invalid = [];
  content.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    const [clubId = '', rawIsbn = '', meeting = ''] = line.split('\t').map((value) => value.trim());
    if (clubId === 'club_id') return;
    const isbn = normaliseIsbn(rawIsbn);
    if (!clubId || !isbn || !/^\d{4}-\d{2}-\d{2}$/.test(meeting)) {
      invalid.push({ line: index + 1, value: line });
      return;
    }
    meetings.push({ clubId, isbn, meeting });
  });
  return { meetings, invalid };
}

// Groups meetings by club in date order. Each club's ballot ranks its titles by meeting order, so rank 1 is the first meeting.
function groupByClub(meetings) {
  const byClub = new Map();
  for (const meeting of meetings) {
    if (!byClub.has(meeting.clubId)) byClub.set(meeting.clubId, []);
    byClub.get(meeting.clubId).push(meeting);
  }
  return [...byClub].map(([clubId, rows]) => ({
    clubId,
    rows: [...rows].sort((a, b) => a.meeting.localeCompare(b.meeting)),
  }));
}

// Creates one sample member per club, a 2027 cycle, meeting slots and one ballot per club, in one transaction.
// Nothing is written when the gate is already recorded or when --dry-run is set.
async function importDemoSchedule(pool, meetings, { dryRun = false } = {}) {
  const clubs = groupByClub(meetings);
  const clubIds = clubs.map((club) => club.clubId);
  const isbns = [...new Set(meetings.map((meeting) => meeting.isbn))];

  const clubRows = await pool.query('SELECT id, name FROM clubs WHERE id = ANY($1)', [clubIds]);
  const clubNames = new Map(clubRows.rows.map((row) => [row.id, row.name]));
  const missingClubs = clubIds.filter((id) => !clubNames.has(id));
  if (missingClubs.length) throw new Error(`Demo schedule prerequisite missing: clubs ${missingClubs.join(', ')}`);

  const titleRows = await pool.query('SELECT id, isbn FROM titles WHERE isbn = ANY($1)', [isbns]);
  const titleIds = new Map(titleRows.rows.map((row) => [row.isbn, row.id]));
  const missingTitles = isbns.filter((isbn) => !titleIds.has(isbn));
  if (missingTitles.length) throw new Error(`Demo schedule prerequisite missing: ${missingTitles.length} titles`);

  const summary = { clubs: clubs.length, meetings: meetings.length, cycle: CYCLE_ID };
  if (dryRun) return { ...summary, skipped: false };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_ID]);
    const done = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [GATE]);
    if (done.rowCount) {
      await client.query('ROLLBACK');
      return { ...summary, skipped: true };
    }

    const months = clubs.flatMap((club) => club.rows.map((meeting) => meeting.meeting.slice(0,7))).sort();
    const [lastYear, lastMonth] = months[months.length - 1].split('-').map(Number);
    const startsOn = `${months[0]}-01`;
    const endsOn = new Date(Date.UTC(lastYear, lastMonth, 0)).toISOString().slice(0,10);
    await client.query('INSERT INTO cycles(id,name,deadline,starts_on,ends_on,status) VALUES($1,$2,$3,$4,$5,$6)', [CYCLE_ID, CYCLE_NAME, DEADLINE, startsOn, endsOn, 'collecting']);
    for (const club of clubs) {
      const personId = `demo-person-${club.clubId}`;
      await client.query('INSERT INTO people(id,name,role) VALUES($1,$2,$3)', [personId, `Sample member (${clubNames.get(club.clubId)})`, 'member']);
      await client.query('INSERT INTO memberships(club_id,person_id,leader) VALUES($1,$2,false)', [club.clubId, personId]);
      await client.query('INSERT INTO membership_versions(club_id,revision) VALUES($1,1) ON CONFLICT(club_id) DO UPDATE SET revision=membership_versions.revision+1', [club.clubId]);

      for (const [index, meeting] of club.rows.entries()) {
        await client.query('INSERT INTO meeting_slots(id,cycle_id,club_id,month,meeting) VALUES($1,$2,$3,$4,$5)', [`demo-slot-${club.clubId}-${index + 1}`, CYCLE_ID, club.clubId, meeting.meeting.slice(0,7), meeting.meeting]);
      }

      await client.query('INSERT INTO ballots(cycle_id,club_id,person_id) VALUES($1,$2,$3)', [CYCLE_ID, club.clubId, personId]);
      for (const [index, meeting] of club.rows.entries()) {
        await client.query("INSERT INTO ballot_marks(cycle_id,club_id,person_id,title_id,mark,rank) VALUES($1,$2,$3,$4,'selected',$5)", [CYCLE_ID, club.clubId, personId, titleIds.get(meeting.isbn), index + 1]);
      }
    }
    await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [GATE]);
    await client.query('COMMIT');
    return { ...summary, skipped: false };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const file = args.find((arg) => !arg.startsWith('--')) || DEFAULT_FILE;
    const pool = getPool();
    try {
      await assertLegacyScriptSupported(pool);
      const { meetings, invalid } = parseDemoSchedule(await fs.readFile(file, 'utf8'));
      if (invalid.length) {
        for (const item of invalid) console.log(`  invalid line ${item.line}: ${item.value}`);
        throw new Error(`Demo schedule has ${invalid.length} invalid rows; nothing was imported.`);
      }
      const result = await importDemoSchedule(pool, meetings, { dryRun });
      if (result.skipped) console.log('Demo schedule already imported; no changes made.');
      else console.log(`${dryRun ? 'Would import' : 'Imported'} ${result.clubs} sample members, ${result.meetings} meetings and ballots into cycle ${result.cycle}.`);
    } finally {
      await pool.end();
    }
  })().catch((error) => {
    console.error('Demo schedule import failed:', error.code === 'LIBRARY_SERVICES_UNSUPPORTED' ? error.message : error.code === '23505' ? 'Conflicting demo ID; no changes were applied.' : error.message.startsWith('Demo schedule prerequisite missing') ? error.message : error.code || (error.message.startsWith('DATABASE_URL') ? error.message : 'unknown'));
    process.exitCode = 1;
  });
}

module.exports = { parseDemoSchedule, groupByClub, importDemoSchedule };
