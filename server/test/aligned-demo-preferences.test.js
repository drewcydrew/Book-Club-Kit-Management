const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { Pool } = require('pg');
const { parseTitleList } = require('../src/import-titles');
const { parsePreferences, importDemoPreferences, CYCLE_ID } = require('../src/import-demo-preferences');

const MIGRATION = '010_demo_preferences_2027_aligned.sql';
const ALIGNED_ID = 'demo-preferences-cycle-2027-aligned';
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

test('migration 010 clones the 2027 cycle with aligned selections and is repeatable', { skip: !enabled, timeout: 120000 }, async (t) => {
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
  const rerun = async () => { await pool.query('DELETE FROM schema_migrations WHERE name=$1', [MIGRATION]); await migrate(pool); };

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

  await rerun();
  assert.equal(await count('SELECT count(*)::int AS n FROM ballots WHERE cycle_id=$1', [ALIGNED_ID]), 39);
  assert.equal(await count("SELECT count(*)::int AS n FROM ballot_marks WHERE cycle_id=$1 AND mark='selected'", [ALIGNED_ID]), 773);
  assert.equal(await count('SELECT count(*)::int AS n FROM ballot_marks WHERE cycle_id=$1', [ALIGNED_ID]), 773);
  assert.equal(await count('SELECT count(*)::int AS n FROM meeting_slots WHERE cycle_id=$1', [ALIGNED_ID]), 468);
  assert.equal(await count('SELECT count(*)::int AS n FROM schedule_assignments WHERE cycle_id=$1', [ALIGNED_ID]), 0);
  assert.equal(await count(`SELECT count(*)::int AS n FROM ballots a JOIN ballots b ON a.club_id=b.club_id AND a.person_id=b.person_id
    WHERE a.cycle_id=$1 AND b.cycle_id=$2`, [CYCLE_ID, ALIGNED_ID]), 39);
  assert.equal(await count(`SELECT count(*)::int AS n FROM cycles a JOIN cycles b ON a.deadline=b.deadline AND a.starts_on=b.starts_on AND a.ends_on=b.ends_on
    WHERE a.id=$1 AND b.id=$2 AND b.name='Demo preferences 2027 (aligned)' AND b.status='collecting'`, [CYCLE_ID, ALIGNED_ID]), 1);
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

  await rerun();
  assert.equal(await count('SELECT count(*)::int AS n FROM ballot_marks WHERE cycle_id=$1', [ALIGNED_ID]), 773);
  assert.equal(await count('SELECT count(*)::int AS n FROM titles'), before.titles + 1);
  assert.equal(await count('SELECT count(*)::int AS n FROM cycles WHERE id=$1', [ALIGNED_ID]), 1);
});
