const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const { Pool } = require('pg');

const databaseUrl = process.env.TEST_LIBRARY_MIGRATION_DATABASE_URL;
const enabled = Boolean(databaseUrl && process.env.TEST_DATABASE_CONFIRM === 'isolated');

test('library migration preserves existing records and Firebase identities in Hume', { skip: !enabled }, async (t) => {
  const schema = `library_migration_${randomBytes(8).toString('hex')}`;
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
  for (const name of migrations.filter((name) => name < '018_')) {
    await pool.query(await fs.readFile(path.join(dir, name), 'utf8'));
    await pool.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
  }
  await require('../src/seed').seed(pool);
  await pool.query("INSERT INTO people(id,name,role) VALUES('firebase-person','Firebase administrator','admin')");
  await pool.query("INSERT INTO firebase_identities(uid,person_id) VALUES('firebase-uid','firebase-person')");
  await pool.query("INSERT INTO circulation_events(id,kit_id,action,at,notes) VALUES('event-1','k1','reserved',now(),'fictional')");
  const before = (await pool.query(`SELECT
    (SELECT count(*)::int FROM titles) AS titles,
    (SELECT count(*)::int FROM kits) AS kits,
    (SELECT count(*)::int FROM clubs) AS clubs,
    (SELECT count(*)::int FROM people) AS people,
    (SELECT count(*)::int FROM ballots) AS ballots,
    (SELECT count(*)::int FROM circulation_events) AS events,
    (SELECT name FROM lending_settings WHERE singleton) AS library`)).rows[0];
  await pool.query(await fs.readFile(path.join(dir, '018_library_services.sql'), 'utf8'));
  const after = (await pool.query(`SELECT
    (SELECT count(*)::int FROM titles WHERE library_service_id='hume') AS titles,
    (SELECT count(*)::int FROM kits WHERE library_service_id='hume') AS kits,
    (SELECT count(*)::int FROM clubs WHERE library_service_id='hume') AS clubs,
    (SELECT count(*)::int FROM people WHERE library_service_id='hume') AS people,
    (SELECT count(*)::int FROM ballots WHERE library_service_id='hume') AS ballots,
    (SELECT count(*)::int FROM circulation_events WHERE library_service_id='hume') AS events,
    (SELECT name FROM lending_settings WHERE library_service_id='hume') AS library`)).rows[0];
  assert.deepEqual(after, before);
  assert.equal((await pool.query("SELECT person_id FROM firebase_identities WHERE uid='firebase-uid' AND library_service_id='hume'")).rows[0].person_id, 'firebase-person');
  assert.equal((await pool.query("SELECT name FROM library_services WHERE id='hume'")).rows[0].name, 'Hume');
});

test('the API refuses database roles that bypass isolation', { skip: !enabled }, async (t) => {
  process.env.DATABASE_URL = databaseUrl;
  const { getPool } = require('../src/db');
  const app = require('../src/app').createApp();
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await getPool().end();
  });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/library-services`);
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /must not bypass row-level security/);
});
