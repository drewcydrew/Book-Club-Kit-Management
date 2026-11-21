const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { Pool } = require('pg');
const { app, fetchAuthenticated: fetch } = require('../test-support/authenticated-app');
const { parseTitleList } = require('../src/import-titles');
const { parseCsv, parsePreferences, importDemoPreferences, CYCLE_ID, GATE } = require('../src/import-demo-preferences');

const data = path.join(__dirname, '..', 'data');
const catalogue = parseTitleList(readFileSync(path.join(data, 'titles-import.tsv'), 'utf8')).rows;
const fixture = readFileSync(path.join(data, 'demo-preferences-2027.csv'), 'utf8');

test('CSV fixture retains all club rankings and combines numbered sets', () => {
  const parsed = parsePreferences(fixture, catalogue);
  assert.equal(parsed.clubs.length, 39);
  assert.equal(parsed.titles.length, 140);
  assert.equal(parsed.clubs.reduce((sum, club) => sum + club.entries.length, 0), 773);
  const salesian = parsed.clubs.find((club) => club.name === 'Salesian Spine Breakers');
  assert.equal(salesian.entries.length, 19);
  assert.equal(salesian.entries.some((entry) => entry.rank === 13), false);
  assert.equal(parsed.titles.filter((title) => title.name.toLowerCase() === 'beautiful ugly').length, 1);
  assert.equal(parsed.titles.find((title) => title.name === 'Inheritance').author, "Kath O'Connor");
  assert.equal(parsed.titles.find((title) => title.name === 'Bila Yarradhanggalangdhuray').author, 'Unknown author');
});

test('CSV parsing handles quotes, short rows and rejects invalid rankings', () => {
  assert.deepEqual(parseCsv('Title,Club\r\n"Title, ""quoted"" by Writer",1\r\n'), [['Title', 'Club'], ['Title, "quoted" by Writer', '1']]);
  assert.throws(() => parseCsv('Title,Club\n"unclosed'), /Unclosed CSV quote/);
  assert.throws(() => parsePreferences('Title,Club\nA by X,1\nB by Y,1', []), /Duplicate rank/);
  assert.throws(() => parsePreferences('Title,Club\nA by X,0', []), /Invalid rank/);
  assert.throws(() => parsePreferences('Title,Club\nA by X,1,extra', []), /Extra CSV/);
  assert.throws(() => parsePreferences('Title,Club\nA by X set 1,1\nA by X set 2,2', []), /Duplicate title/);
  assert.equal(parsePreferences('Title,Club,Other\nA by X,1', []).clubs[1].entries.length, 0);
});

const url = process.env.TEST_DATABASE_URL;
const enabled = Boolean(url && process.env.TEST_DATABASE_CONFIRM === 'isolated');

test('2027 import is atomic, repeatable and available to preferences and scheduling', { skip: !enabled, timeout: 120000 }, async (t) => {
  const schema = `preferences_${randomBytes(8).toString('hex')}`;
  const admin = new Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  process.env.DATABASE_URL = url;
  process.env.PGOPTIONS = `-c search_path=${schema}`;
  const pool = require('../src/db').getPool();
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  });
  await require('../src/migrate').migrate(pool);
  const parsed = parsePreferences(fixture, catalogue);
  await assert.rejects(importDemoPreferences(pool, parsed, { dryRun: true }), /No library branch/);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM cycles WHERE id=$1', [CYCLE_ID])).rows[0].n, 0);
  await pool.query("UPDATE lending_settings SET branches=ARRAY['Central'] WHERE singleton=true");
  await pool.query("INSERT INTO people(id,name,role) VALUES('member-a','A','member'),('member-b','B','member')");
  await pool.query("INSERT INTO memberships(club_id,person_id,leader) VALUES('club-001','member-a',false),('club-001','member-b',true)");
  await pool.query("INSERT INTO membership_versions(club_id,revision) VALUES('club-001',1)");
  await pool.query("INSERT INTO titles(id,name,author,isbn,pages) VALUES('existing-title','All the words we know','Bruce Nash','9781668053607',0)");
  await pool.query("INSERT INTO kits(id,title_id,branch,copies,extras) VALUES('existing-kit','existing-title','Central',10,'')");
  await pool.query("INSERT INTO kit_identifiers(kit_id,identifier,kind) VALUES('existing-kit','existing-barcode','kit')");
  await pool.query("INSERT INTO club_history(club_id,title_id) VALUES('club-001','existing-title')");
  await pool.query("INSERT INTO cycles(id,name,deadline,starts_on,ends_on,status) VALUES('demo-cycle-2027','Existing','2026-12-15','2027-01-01','2027-12-31','collecting')");
  const preview = await importDemoPreferences(pool, parsed, { dryRun: true });
  assert.equal(preview.selections, 773);
  assert.equal(preview.slots, 468);
  assert.equal(preview.clubs.length, 6);
  assert.equal(preview.members.find((member) => member.club === 'Pascoe vale readers').personId, 'member-b');
  assert.ok(preview.warnings.some((warning) => warning.includes('reading history')));
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM ballots')).rows[0].n, 0);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM titles')).rows[0].n, 1);

  await pool.query("INSERT INTO cycles(id,name,deadline,starts_on,ends_on,status) VALUES($1,'Conflict','2026-12-15','2027-01-01','2027-12-31','collecting')", [CYCLE_ID]);
  await assert.rejects(importDemoPreferences(pool, parsed), /already exists without the import gate/);
  await pool.query('DELETE FROM cycles WHERE id=$1', [CYCLE_ID]);
  await pool.query("INSERT INTO clubs(id,name,branch,size,cadence,pickup,address) VALUES('duplicate','Pascoe vale readers','Central',10,1,'pickup','')");
  await assert.rejects(importDemoPreferences(pool, parsed), /Ambiguous database club/);
  await pool.query("DELETE FROM clubs WHERE id='duplicate'");
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM ballots')).rows[0].n, 0);

  await pool.query("CREATE FUNCTION fail_import_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$");
  await pool.query('CREATE TRIGGER fail_import_test BEFORE INSERT ON ballot_marks FOR EACH ROW EXECUTE FUNCTION fail_import_test()');
  await assert.rejects(importDemoPreferences(pool, parsed), /test rollback/);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM cycles WHERE id=$1', [CYCLE_ID])).rows[0].n, 0);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM titles')).rows[0].n, 1);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM clubs')).rows[0].n, 33);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM kits')).rows[0].n, 1);
  await pool.query('DROP TRIGGER fail_import_test ON ballot_marks');
  await pool.query('DROP FUNCTION fail_import_test()');

  const result = await importDemoPreferences(pool, parsed);
  assert.equal(result.selections, 773);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM ballots WHERE cycle_id=$1', [CYCLE_ID])).rows[0].n, 39);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM ballot_marks WHERE cycle_id=$1', [CYCLE_ID])).rows[0].n, 773);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM meeting_slots WHERE cycle_id=$1', [CYCLE_ID])).rows[0].n, 468);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM schedule_assignments WHERE cycle_id=$1', [CYCLE_ID])).rows[0].n, 0);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM memberships WHERE club_id='club-001'")).rows[0].n, 2);
  assert.deepEqual(await importDemoPreferences(pool, parsed), { skipped: true });
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM schema_migrations WHERE name=$1', [GATE])).rows[0].n, 1);

  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/shared`);
  assert.equal(response.status, 200);
  const shared = await response.json();
  require('tsx/cjs');
  const { combineData } = require('../../src/state/local-data.ts');
  const { rankings, preferences, draft } = require('../../src/domain/logic.ts');
  const appData = combineData({ version: 1, selectedPersonId: 'member-b' }, shared);
  const cycle = appData.cycles.find((item) => item.id === CYCLE_ID);
  const ballot = appData.ballots.find((item) => item.cycleId === CYCLE_ID && item.clubId === 'club-001');
  assert.equal(ballot.personId, 'member-b');
  assert.equal(ballot.ranking[0], 'existing-title');
  for (const club of parsed.clubs) {
    const storedClub = appData.clubs.find((item) => item.name === club.name);
    const storedBallot = appData.ballots.find((item) => item.cycleId === CYCLE_ID && item.clubId === storedClub.id);
    const expectedTitles = club.entries.map((entry) => parsed.titles.find((title) => title.key === entry.key));
    assert.deepEqual(storedBallot.ranking.map((titleId) => {
      const title = appData.titles.find((item) => item.id === titleId);
      return [title.name, title.author, title.isbn];
    }), expectedTitles.map((title) => [title.name, title.author, title.isbn]));
  }
  assert.ok(rankings(appData, cycle, 'club-001', true).includes('existing-title'));
  assert.ok(!preferences(appData, cycle, 'club-001').includes('existing-title'));
  const proposal = draft(appData, cycle);
  const assignments = proposal.assignments.filter((item) => item.cycleId === CYCLE_ID);
  assert.ok(assignments.length > 0);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM schedule_assignments WHERE cycle_id=$1', [CYCLE_ID])).rows[0].n, 0);
  const request = { revision: cycle.revision, assignments, publish: false, unlockIds: [] };
  const scheduleUrl = `http://127.0.0.1:${server.address().port}/api/cycles/${CYCLE_ID}/schedule`;
  const validation = await fetch(`${scheduleUrl}/validate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
  assert.equal(validation.status, 200);
  const checked = await validation.json();
  const saved = await fetch(scheduleUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...request, validationToken: checked.token, acknowledge: true }) });
  assert.equal(saved.status, 200, JSON.stringify(await saved.json()));
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM schedule_assignments WHERE cycle_id=$1', [CYCLE_ID])).rows[0].n, assignments.length);
});
