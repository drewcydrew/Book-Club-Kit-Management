const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { Pool } = require('pg');
const { parseTitleList } = require('../src/import-titles');
const { parsePreferences, importDemoPreferences, CYCLE_ID } = require('../src/import-demo-preferences');

const MIGRATION = '010_demo_preferences_2027_aligned.sql';
const MOVE_MIGRATION = '011_demo_preferences_2028.sql';
const ALIGNED_ID = 'demo-preferences-cycle-2028';
const data = path.join(__dirname, '..', 'data');
const catalogue = parseTitleList(readFileSync(path.join(data, 'titles-import.tsv'), 'utf8')).rows;
const parsed = parsePreferences(readFileSync(path.join(data, 'demo-preferences-2027.csv'), 'utf8'), catalogue);
const migrationSql = readFileSync(path.join(__dirname, '..', 'migrations', MIGRATION), 'utf8');

const tuples = (section) => section.split('\n').filter((line) => /^\s+\(('|\d)/.test(line)).map((line) =>
  [...line.matchAll(/'((?:[^']|'')*)'|(\d+)/g)].map((match) => (match[2] !== undefined ? Number(match[2]) : match[1].replaceAll("''", "'"))));

test('migration 010 embeds the same club rankings as the 2027 preferences CSV', () => {
  const titleBlock = migrationSql.split('INSERT INTO aligned_titles')[1].split('INSERT INTO aligned_rows')[0];
  const rowBlock = migrationSql.split('INSERT INTO aligned_rows')[1].split('CREATE OR REPLACE FUNCTION')[0];
  const titles = new Map(tuples(titleBlock).map(([key, isbn, name, author]) => [key, { isbn, name, author }]));
  const rows = tuples(rowBlock);
  assert.equal(titles.size, 140);
  assert.equal(rows.length, 773);
  for (const club of parsed.clubs) {
    const embedded = rows.filter((row) => row[0] === club.name).sort((a, b) => a[2] - b[2]);
    assert.deepEqual(embedded.map((row) => row[2]), embedded.map((_, index) => index + 1), `${club.name} ranks must be contiguous`);
    assert.deepEqual(
      embedded.map((row) => [titles.get(row[1]).isbn, titles.get(row[1]).name, titles.get(row[1]).author]),
      club.entries.map((entry) => { const title = parsed.titles.find((item) => item.key === entry.key); return [title.isbn || '', title.name, title.author]; }),
      club.name,
    );
  }
});

const url = process.env.TEST_DATABASE_URL;
const enabled = Boolean(url && process.env.TEST_DATABASE_CONFIRM === 'isolated');

test('migrations 010 and 011 clone the 2027 cycle into 2028 with aligned selections and are repeatable', { skip: !enabled, timeout: 120000 }, async (t) => {
  const schema = `aligned_${randomBytes(8).toString('hex')}`;
  const admin = new Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  process.env.DATABASE_URL = url;
  process.env.PGOPTIONS = `-c search_path=${schema}`;
  const pool = require('../src/db').getPool();
  t.after(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  });
  const { migrate } = require('../src/migrate');
  const count = async (sql, params = []) => (await pool.query(sql, params)).rows[0].n;
  const rerun = async (...names) => { await pool.query('DELETE FROM schema_migrations WHERE name=ANY($1)', [names]); await migrate(pool); };

  await migrate(pool);
  assert.equal(await count('SELECT count(*)::int AS n FROM cycles'), 0, 'without a source cycle the migration does nothing');
  await pool.query("UPDATE lending_settings SET branches=ARRAY['Central'] WHERE singleton=true");
  await importDemoPreferences(pool, parsed);

  // Drift from the baseline: a read mark in the source ballot, a renamed title and a missing author.
  await pool.query("UPDATE ballot_marks SET mark='read', rank=NULL WHERE cycle_id=$1 AND club_id='club-001' AND rank=1", [CYCLE_ID]);
  await pool.query("UPDATE titles SET isbn='9999999999999', name=name||' : a novel' WHERE isbn='9780063511637'");
  await pool.query("UPDATE titles SET author='Jane Park' WHERE name='Inheritance' AND author=$1", ["Kath O'Connor"]);
  const before = { titles: await count('SELECT count(*)::int AS n FROM titles'), kits: await count('SELECT count(*)::int AS n FROM kits'),
    clubs: await count('SELECT count(*)::int AS n FROM clubs'), people: await count('SELECT count(*)::int AS n FROM people') };

  await rerun(MIGRATION, MOVE_MIGRATION);
  assert.equal(await count("SELECT count(*)::int AS n FROM cycles WHERE id='demo-preferences-cycle-2027-aligned'"), 0, 'the 2027 aligned cycle is replaced');
  assert.equal(await count("SELECT count(*)::int AS n FROM ballots WHERE cycle_id='demo-preferences-cycle-2027-aligned'"), 0);
  assert.equal(await count("SELECT count(*)::int AS n FROM ballot_marks WHERE cycle_id=$1 AND mark='selected'", [ALIGNED_ID]), 773);
  assert.equal(await count('SELECT count(*)::int AS n FROM ballot_marks WHERE cycle_id=$1', [ALIGNED_ID]), 773);
  assert.equal(await count('SELECT count(*)::int AS n FROM meeting_slots WHERE cycle_id=$1', [ALIGNED_ID]), 468);
  assert.equal(await count('SELECT count(*)::int AS n FROM schedule_assignments WHERE cycle_id=$1', [ALIGNED_ID]), 0);
  assert.equal(await count(`SELECT count(*)::int AS n FROM ballots a JOIN ballots b ON a.club_id=b.club_id AND a.person_id=b.person_id
    WHERE a.cycle_id=$1 AND b.cycle_id=$2`, [CYCLE_ID, ALIGNED_ID]), 39);
  assert.equal(await count(`SELECT count(*)::int AS n FROM cycles a JOIN cycles b ON b.deadline=(a.deadline + interval '1 year')::date
    AND b.starts_on=(a.starts_on + interval '1 year')::date AND b.ends_on=(a.ends_on + interval '1 year')::date
    WHERE a.id=$1 AND b.id=$2 AND b.name='Demo preferences 2028' AND b.status='collecting'`, [CYCLE_ID, ALIGNED_ID]), 1);
  assert.equal(await count("SELECT count(*)::int AS n FROM meeting_slots WHERE cycle_id=$1 AND month NOT LIKE '2028-%'", [ALIGNED_ID]), 0);
  assert.equal(await count(`SELECT count(*)::int AS n FROM meeting_slots a JOIN meeting_slots b ON a.club_id=b.club_id
    AND b.month=to_char(to_date(a.month || '-01', 'YYYY-MM-DD') + interval '1 year', 'YYYY-MM')
    AND b.meeting IS NOT DISTINCT FROM (a.meeting + interval '1 year')::date WHERE a.cycle_id=$1 AND b.cycle_id=$2`, [CYCLE_ID, ALIGNED_ID]), 468);
  assert.equal(await count("SELECT count(*)::int AS n FROM ballot_marks WHERE cycle_id=$1 AND mark='read'", [CYCLE_ID]), 1, 'source cycle is unchanged');

  // Only the missing "Inheritance / Kath O'Connor" title (and its demo kit) is added.
  assert.equal(await count('SELECT count(*)::int AS n FROM titles'), before.titles + 1);
  assert.equal(await count('SELECT count(*)::int AS n FROM kits'), before.kits + 1);
  assert.equal(await count("SELECT count(*)::int AS n FROM kits k JOIN titles t ON t.id=k.title_id WHERE t.name='Inheritance' AND t.author=$1", ["Kath O'Connor"]), 1);
  assert.equal(await count('SELECT count(*)::int AS n FROM clubs'), before.clubs);
  assert.equal(await count('SELECT count(*)::int AS n FROM people'), before.people);

  for (const club of parsed.clubs) {
    const marks = (await pool.query(`SELECT t.name, t.author FROM ballot_marks m JOIN clubs c ON c.id=m.club_id JOIN titles t ON t.id=m.title_id
      WHERE m.cycle_id=$1 AND c.name=$2 ORDER BY m.rank`, [ALIGNED_ID, club.name])).rows;
    assert.equal(marks.length, club.entries.length, club.name);
    club.entries.forEach((entry, index) => {
      const title = parsed.titles.find((item) => item.key === entry.key);
      const stored = marks[index].name.toLowerCase();
      assert.ok(stored.startsWith(title.name.toLowerCase().slice(0, 5)), `${club.name} #${index + 1}: ${title.name} vs ${marks[index].name}`);
    });
  }

  await rerun(MOVE_MIGRATION);
  assert.equal(await count('SELECT count(*)::int AS n FROM ballot_marks WHERE cycle_id=$1', [ALIGNED_ID]), 773);
  assert.equal(await count('SELECT count(*)::int AS n FROM titles'), before.titles + 1);
  assert.equal(await count('SELECT count(*)::int AS n FROM cycles WHERE id=$1', [ALIGNED_ID]), 1);

  // Migration 012 swaps the two cycles' years and drops every other cycle.
  const kitId = (await pool.query('SELECT id FROM kits ORDER BY id LIMIT 1')).rows[0].id;
  const person = (await pool.query('SELECT person_id FROM ballots WHERE cycle_id=$1 AND club_id=$2', [CYCLE_ID, 'club-001'])).rows[0].person_id;
  const dateSlot = async (cycleId, month, meeting, assignmentId) => {
    const slot = (await pool.query('UPDATE meeting_slots SET meeting=$3 WHERE cycle_id=$1 AND club_id=$4 AND month=$2 RETURNING id', [cycleId, month, meeting, 'club-001'])).rows[0].id;
    await pool.query('INSERT INTO schedule_assignments(id,cycle_id,slot_id,club_id,kit_id,ready,meeting,due,locked) VALUES($1,$2,$3,$4,$5,$6::date-3,$6,$6::date+28,true)',
      [assignmentId, cycleId, slot, 'club-001', kitId, meeting]);
    return slot;
  };
  const scheduleSlot = await dateSlot(ALIGNED_ID, '2028-01', '2028-01-04', 'assignment-2028');
  await dateSlot(CYCLE_ID, '2027-01', '2027-01-04', 'assignment-2027');
  await pool.query("UPDATE cycles SET status='drafted' WHERE id=$1", [ALIGNED_ID]);
  await pool.query("INSERT INTO finalized_groups(cycle_id,club_id) VALUES($1,'club-001')", [CYCLE_ID]);
  await pool.query("INSERT INTO cycles(id,name,deadline,starts_on,ends_on,status) VALUES('junk','Open for voting','2026-12-17','2027-01-01','2027-11-30','collecting')");
  await pool.query("INSERT INTO meeting_slots(id,cycle_id,club_id,month,meeting) VALUES('junk-slot','junk','club-001','2027-02',NULL)");
  await pool.query("INSERT INTO ballots(cycle_id,club_id,person_id) VALUES('junk','club-001',$1)", [person]);
  const titleId = (await pool.query('SELECT id FROM titles ORDER BY id LIMIT 1')).rows[0].id;
  await pool.query("INSERT INTO ballot_marks(cycle_id,club_id,person_id,title_id,mark,rank) VALUES('junk','club-001',$1,$2,'read',NULL)", [person, titleId]);
  const old2027 = { selected: await count("SELECT count(*)::int AS n FROM ballot_marks WHERE cycle_id=$1 AND mark='selected'", [CYCLE_ID]),
    read: await count("SELECT count(*)::int AS n FROM ballot_marks WHERE cycle_id=$1 AND mark='read'", [CYCLE_ID]),
    ballots: await count('SELECT count(*)::int AS n FROM ballots WHERE cycle_id=$1', [CYCLE_ID]) };

  await rerun('012_demo_cycles_2027_2028.sql');
  assert.deepEqual((await pool.query('SELECT id FROM cycles ORDER BY id')).rows.map((row) => row.id), [CYCLE_ID, ALIGNED_ID]);
  const cycles = Object.fromEntries((await pool.query(`SELECT id,name,status,deadline::text,starts_on::text,ends_on::text FROM cycles`)).rows.map((row) => [row.id, row]));
  assert.deepEqual(cycles[CYCLE_ID], { id: CYCLE_ID, name: 'Demo schedule 2027', status: 'drafted', deadline: '2026-12-15', starts_on: '2027-01-01', ends_on: '2027-12-31' });
  assert.equal(cycles[ALIGNED_ID].name, 'Demo open for voting 2028');
  assert.equal(cycles[ALIGNED_ID].status, 'collecting');
  assert.equal(cycles[ALIGNED_ID].starts_on, '2028-01-01');
  assert.equal(cycles[ALIGNED_ID].deadline, '2027-12-15');
  // 2027 now holds the aligned preferences and their schedule; the 2028 cycle holds the older edited ballots without a schedule.
  assert.equal(await count("SELECT count(*)::int AS n FROM ballot_marks WHERE cycle_id=$1 AND mark='selected'", [CYCLE_ID]), 773);
  assert.equal(await count("SELECT count(*)::int AS n FROM ballot_marks WHERE cycle_id=$1 AND mark<>'selected'", [CYCLE_ID]), 0);
  assert.equal(await count("SELECT count(*)::int AS n FROM ballot_marks WHERE cycle_id=$1 AND mark='selected'", [ALIGNED_ID]), old2027.selected);
  assert.equal(await count("SELECT count(*)::int AS n FROM ballot_marks WHERE cycle_id=$1 AND mark='read'", [ALIGNED_ID]), old2027.read);
  assert.equal(await count('SELECT count(*)::int AS n FROM ballots WHERE cycle_id=$1', [ALIGNED_ID]), old2027.ballots);
  assert.equal(await count('SELECT count(*)::int AS n FROM finalized_groups WHERE cycle_id=$1', [ALIGNED_ID]), 1);
  assert.equal(await count('SELECT count(*)::int AS n FROM meeting_slots WHERE cycle_id=$1 AND month LIKE $2', [CYCLE_ID, '2027-%']), 468);
  assert.equal(await count('SELECT count(*)::int AS n FROM meeting_slots WHERE cycle_id=$1 AND month LIKE $2', [ALIGNED_ID, '2028-%']), 468);
  assert.deepEqual((await pool.query('SELECT id,cycle_id,slot_id,ready::text,meeting::text,due::text,locked FROM schedule_assignments')).rows,
    [{ id: 'assignment-2028', cycle_id: CYCLE_ID, slot_id: scheduleSlot, ready: '2027-01-01', meeting: '2027-01-04', due: '2027-02-01', locked: true }]);
  assert.equal(await count("SELECT count(*)::int AS n FROM ballots WHERE cycle_id='junk'"), 0);
  assert.equal(await count('SELECT count(*)::int AS n FROM titles'), before.titles + 1);
  assert.equal(await count('SELECT count(*)::int AS n FROM people'), before.people);

  await rerun('012_demo_cycles_2027_2028.sql');
  assert.equal(await count('SELECT count(*)::int AS n FROM cycles'), 2, 'rerunning 012 is a no-op');
  assert.equal(await count("SELECT count(*)::int AS n FROM cycles WHERE id=$1 AND name='Demo open for voting 2028'", [ALIGNED_ID]), 1);
});
