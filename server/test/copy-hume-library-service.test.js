const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const { Pool } = require('pg');
const { copyHumeLibraryService } = require('../src/copy-hume-library-service');

const databaseUrl = process.env.TEST_LIBRARY_MIGRATION_DATABASE_URL;
const enabled = Boolean(databaseUrl && process.env.TEST_DATABASE_CONFIRM === 'isolated');
const TABLES_TO_COMPARE = ['titles', 'kits', 'clubs', 'people', 'memberships', 'ballots', 'circulation_events', 'lending_settings', 'firebase_identities', 'kit_label_assignments'];

test('copying Hume creates an independent library service and leaves Hume unchanged', { skip: !enabled }, async (t) => {
  const schema = `copy_hume_${randomBytes(8).toString('hex')}`;
  const admin = new Pool({ connectionString: databaseUrl });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
  t.after(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  });

  await pool.query('CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const dir = path.join(__dirname, '..', 'migrations');
  const migrations = (await fs.readdir(dir)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
  const apply = async (name) => {
    await pool.query(await fs.readFile(path.join(dir, name), 'utf8'));
    await pool.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
  };
  for (const name of migrations.filter((name) => name < '018_')) await apply(name);
  await require('../src/seed').seed(pool);
  await pool.query("INSERT INTO people(id,name,role) VALUES('firebase-person','Firebase administrator','admin')");
  await pool.query("INSERT INTO firebase_identities(uid,person_id) VALUES('firebase-uid','firebase-person')");
  // Migration 009 drops this table, but a live database can still have it, and its foreign keys may be missing.
  await pool.query(`CREATE TABLE kit_label_assignments (
    kit_id text NOT NULL,
    label_id text NOT NULL,
    PRIMARY KEY (kit_id, label_id))`);
  await pool.query("INSERT INTO kit_labels(id,category,name) VALUES('label-mystery','genre','Mystery')");
  await pool.query("INSERT INTO kit_label_assignments(kit_id,label_id) SELECT id,'label-mystery' FROM kits LIMIT 2");
  for (const name of migrations.filter((name) => name >= '018_')) await apply(name);

  const snapshot = async () => {
    const hashes = {};
    for (const table of TABLES_TO_COMPARE) {
      hashes[table] = (await pool.query(`SELECT count(*)::int AS n, md5(COALESCE(string_agg(x::text, '|' ORDER BY x::text), '')) AS hash FROM ${table} x WHERE library_service_id='hume'`)).rows[0];
    }
    return hashes;
  };
  const before = await snapshot();

  const result = await copyHumeLibraryService(pool, '  Hume Development  ');
  assert.equal(result.name, 'Hume Development');
  assert.notEqual(result.id, 'hume');
  assert.deepEqual(await snapshot(), before);

  for (const table of TABLES_TO_COMPARE) {
    const copied = (await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE library_service_id=$1`, [result.id])).rows[0].n;
    assert.equal(copied, before[table].n, `${table} row count`);
  }
  const copiedTitleIds = (await pool.query('SELECT id FROM titles WHERE library_service_id=$1', [result.id])).rows.map((row) => row.id);
  const humeTitleIds = (await pool.query("SELECT id FROM titles WHERE library_service_id='hume'")).rows.map((row) => row.id);
  assert.equal(copiedTitleIds.filter((id) => humeTitleIds.includes(id)).length, 0, 'copied title IDs must be new');
  assert.equal((await pool.query('SELECT name FROM lending_settings WHERE library_service_id=$1', [result.id])).rows[0].name, 'Hume Development');

  const copiedPerson = (await pool.query('SELECT person_id FROM firebase_identities WHERE uid=$1 AND library_service_id=$2', ['firebase-uid', result.id])).rows[0].person_id;
  assert.notEqual(copiedPerson, 'firebase-person');
  assert.equal((await pool.query('SELECT library_service_id FROM people WHERE id=$1', [copiedPerson])).rows[0].library_service_id, result.id);

  await assert.rejects(copyHumeLibraryService(pool, 'hume development'), /already exists/);
});
