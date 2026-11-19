const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const { Pool } = require('pg');
const { repairSchema } = require('../src/repair-schema');
const { migrate } = require('../src/migrate');
const { seed } = require('../src/seed');

const url = process.env.TEST_DATABASE_URL;
const enabled = Boolean(url && process.env.TEST_DATABASE_CONFIRM === 'isolated');

async function fixture(t, through = '008_kit_labels.sql') {
  const schema = `repair_${randomBytes(8).toString('hex')}`;
  const admin = new Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
  t.after(async () => { await pool.end(); await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end(); });
  await pool.query('CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const directory = path.join(__dirname, '..', 'migrations');
  for (const name of (await fs.readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name) && name <= through).sort()) {
    await pool.query(await fs.readFile(path.join(directory, name), 'utf8'));
    await pool.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
  }
  if (through === '008_kit_labels.sql') await seed(pool);
  return pool;
}

test('repair checks without writes and safely copies kit labels once', { skip: !enabled }, async (t) => {
  const pool = await fixture(t);
  await pool.query("INSERT INTO kit_labels(id,category,name) VALUES ('g','genre','Mystery'),('v','vibe','Warm')");
  await pool.query("INSERT INTO kit_label_assignments(kit_id,label_id) VALUES ('k1','g'),('k2','g'),('k2','v')");
  const before = (await pool.query('SELECT id,revision FROM titles ORDER BY id')).rows;
  const check = await repairSchema(pool);
  assert.equal(check.state, 'repairable', check.issues.join('\n'));
  assert.equal(check.counts.legacy_assignments, 3);
  assert.equal(check.counts.title_assignments, 2);
  assert.equal((await pool.query("SELECT to_regclass('title_label_assignments') AS name")).rows[0].name, null);
  assert.deepEqual((await pool.query('SELECT id,revision FROM titles ORDER BY id')).rows, before);
  const repaired = await repairSchema(pool, true);
  assert.equal(repaired.state, 'repaired', repaired.issues.join('\n'));
  assert.deepEqual((await pool.query('SELECT title_id,label_id FROM title_label_assignments ORDER BY title_id,label_id')).rows,
    [{ title_id: 't1', label_id: 'g' }, { title_id: 't1', label_id: 'v' }]);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM kit_label_assignments')).rows[0].n, 3);
  assert.equal((await pool.query("SELECT revision FROM titles WHERE id='t1'")).rows[0].revision, 2);
  assert.deepEqual((await pool.query("SELECT id,revision FROM kits WHERE id IN ('k1','k2','k3') ORDER BY id")).rows,
    [{ id: 'k1', revision: 2 }, { id: 'k2', revision: 2 }, { id: 'k3', revision: 1 }]);
  await migrate(pool);
  assert.equal((await repairSchema(pool, true)).state, 'current');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM kit_label_assignments')).rows[0].n, 3);
  assert.equal((await pool.query("SELECT revision FROM titles WHERE id='t1'")).rows[0].revision, 2);
  const { schema } = (await pool.query('SELECT current_schema() AS schema')).rows[0];
  const previousUrl = process.env.DATABASE_URL;
  const previousOptions = process.env.PGOPTIONS;
  process.env.DATABASE_URL = url;
  process.env.PGOPTIONS = `-c search_path=${schema}`;
  const appPool = require('../src/db').getPool();
  const server = require('../src/app').listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const title = await fetch(`${base}/api/titles/t1`);
    assert.equal(title.status, 200);
    assert.deepEqual((await title.json()).labelIds, ['g', 'v']);
    const preferences = await fetch(`${base}/api/users/p4/views/preferences`);
    assert.equal(preferences.status, 200);
    assert.deepEqual((await preferences.json()).titles.find((value) => value.id === 't1').labelIds, ['g', 'v']);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await appPool.end();
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
    if (previousOptions === undefined) delete process.env.PGOPTIONS; else process.env.PGOPTIONS = previousOptions;
  }
  await pool.query("DELETE FROM title_label_assignments WHERE label_id='g'");
  assert.equal((await repairSchema(pool, true)).state, 'current');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM title_label_assignments')).rows[0].n, 1);
  await pool.query("DELETE FROM kit_labels WHERE id='g'");
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM kit_label_assignments WHERE label_id='g'")).rows[0].n, 2);
});

test('repair blocks missing or ambiguous schema and historical migrations', { skip: !enabled }, async (t) => {
  const pool = await fixture(t);
  await pool.query("DELETE FROM schema_migrations WHERE name='007_cycle_months.sql'");
  let report = await repairSchema(pool, true);
  assert.equal(report.state, 'blocked');
  assert.match(report.issues.join(' '), /007_cycle_months/);
  await pool.query("INSERT INTO schema_migrations(name) VALUES ('007_cycle_months.sql')");
  await pool.query("INSERT INTO schema_migrations(name) VALUES ('009_title_labels.sql')");
  report = await repairSchema(pool, true);
  assert.match(report.issues.join(' '), /009 is recorded/);
  await pool.query("DELETE FROM schema_migrations WHERE name='009_title_labels.sql'");
  await pool.query('CREATE TABLE title_label_assignments (title_id text, label_id text)');
  report = await repairSchema(pool, true);
  assert.match(report.issues.join(' '), /history is ambiguous/);
  await pool.query('DROP TABLE title_label_assignments');
  await pool.query('ALTER TABLE titles DROP COLUMN synopsis');
  report = await repairSchema(pool, true);
  assert.match(report.issues.join(' '), /titles.synopsis/);
  assert.equal((await pool.query("SELECT to_regclass('title_label_assignments') AS name")).rows[0].name, null);
});

test('repair rolls back every change when the copy cannot finish', { skip: !enabled }, async (t) => {
  const pool = await fixture(t);
  await pool.query("INSERT INTO kit_labels(id,category,name) VALUES ('g','genre','Mystery')");
  await pool.query("INSERT INTO kit_label_assignments(kit_id,label_id) VALUES ('k1','g')");
  const failingPool = { connect: async () => {
    const client = await pool.connect();
    return {
      query: (sql, ...args) => {
        if (sql.startsWith('INSERT INTO schema_migrations')) throw new Error('test failure');
        return client.query(sql, ...args);
      },
      release: () => client.release(),
    };
  } };
  await assert.rejects(repairSchema(failingPool, true), /test failure/);
  assert.equal((await pool.query("SELECT to_regclass('title_label_assignments') AS name")).rows[0].name, null);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM schema_migrations WHERE name='009_title_labels.sql'")).rows[0].n, 0);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM kit_label_assignments')).rows[0].n, 1);
});

test('repair never runs the older destructive meeting migration', { skip: !enabled }, async (t) => {
  const pool = await fixture(t, '006_title_isbndb_details.sql');
  await pool.query("INSERT INTO clubs(id,name,branch,size,pickup) VALUES ('c','Club','Central',1,'pickup')");
  await pool.query("INSERT INTO cycles(id,name,deadline,status) VALUES ('cy','Cycle','2027-01-01','open')");
  await pool.query("INSERT INTO meeting_slots(id,cycle_id,club_id,meeting) VALUES ('s1','cy','c','2027-02-01'),('s2','cy','c','2027-02-02')");
  await pool.query("INSERT INTO titles(id,name,author,pages) VALUES ('t','Title','Author',1)");
  await pool.query("INSERT INTO kits(id,title_id,branch,copies) VALUES ('k','t','Central',1)");
  await pool.query("INSERT INTO schedule_assignments(id,cycle_id,slot_id,club_id,kit_id,ready,meeting,due,locked) VALUES ('a','cy','s2','c','k','2027-01-30','2027-02-02','2027-02-03',false)");
  const result = await repairSchema(pool, true);
  assert.equal(result.state, 'blocked');
  assert.match(result.issues.join(' '), /007_cycle_months/);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM meeting_slots')).rows[0].n, 2);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM schedule_assignments')).rows[0].n, 1);
});
