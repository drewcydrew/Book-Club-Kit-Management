const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const { Pool } = require('pg');
const { app, fetchAuthenticated: fetch } = require('../test-support/authenticated-app');

const url = process.env.TEST_DATABASE_URL;
const enabled = Boolean(url && process.env.TEST_DATABASE_CONFIRM === 'isolated');

test('migration unions kit labels and rolls back safely on failure', { skip: !enabled, timeout: 30000 }, async (t) => {
  const schema = `title_migrate_${randomBytes(8).toString('hex')}`;
  const admin = new Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
  t.after(async () => { await pool.end(); await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end(); });
  await pool.query('CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const directory = path.join(__dirname, '..', 'migrations');
  for (const name of (await fs.readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name) && name < '009_title_labels.sql').sort()) {
    await pool.query(await fs.readFile(path.join(directory, name), 'utf8'));
    await pool.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
  }
  await require('../src/seed').seed(pool);
  await pool.query("UPDATE titles SET genres='Source genre' WHERE id='t1'");
  await pool.query("INSERT INTO kit_labels(id,category,name) VALUES ('g','genre','Mystery'),('v','vibe','Warm')");
  await pool.query("INSERT INTO kit_label_assignments(kit_id,label_id) VALUES ('k1','g'),('k2','g'),('k2','v')");
  await pool.query("UPDATE titles SET revision=2147483647 WHERE id='t1'");
  await assert.rejects(require('../src/migrate').migrate(pool));
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM kit_label_assignments")).rows[0].n, 3);
  assert.equal((await pool.query("SELECT to_regclass('title_label_assignments') AS name")).rows[0].name, null);
  await pool.query("UPDATE titles SET revision=1 WHERE id='t1'");
  await require('../src/migrate').migrate(pool);
  await require('../src/migrate').migrate(pool);
  assert.deepEqual((await pool.query('SELECT title_id,label_id FROM title_label_assignments ORDER BY title_id,label_id')).rows,
    [{ title_id: 't1', label_id: 'g' }, { title_id: 't1', label_id: 'v' }]);
  assert.deepEqual((await pool.query("SELECT genres,revision FROM titles WHERE id='t1'")).rows[0], { genres: 'Source genre', revision: 2 });
  assert.deepEqual((await pool.query("SELECT id,revision FROM kits WHERE id IN ('k1','k2','k3') ORDER BY id")).rows,
    [{ id: 'k1', revision: 2 }, { id: 'k2', revision: 2 }, { id: 'k3', revision: 1 }]);
});

test('title labels and legacy kit edits remain atomic and revision-safe', { skip: !enabled, timeout: 30000 }, async (t) => {
  const schema = `title_api_${randomBytes(8).toString('hex')}`;
  const admin = new Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  process.env.DATABASE_URL = url;
  process.env.PGOPTIONS = `-c search_path=${schema}`;
  const pool = require('../src/db').getPool();
  let server;
  t.after(async () => { if (server) await new Promise((resolve) => server.close(resolve)); await pool.end(); await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end(); });
  await require('../src/migrate').migrate(pool);
  await require('../src/seed').seed(pool);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  async function req(route, method = 'GET', body, revision) {
    const response = await fetch(base + route, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(revision ? { 'If-Match': String(revision) } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, json: response.status === 204 ? null : await response.json() };
  }
  const genre = (await req('/api/kit-labels', 'POST', { category: 'genre', name: 'Genre' })).json;
  const vibe = (await req('/api/kit-labels', 'POST', { category: 'vibe', name: 'Vibe' })).json;
  const titleBody = { name: 'Tagged title', author: 'Writer', isbn: '', pages: 0, genres: 'Source', notes: '', largePrint: false, audio: false };
  let a = (await req('/api/titles', 'POST', { ...titleBody, labelIds: [genre.id] })).json;
  let b = (await req('/api/titles', 'POST', { ...titleBody, name: 'Destination', labelIds: [vibe.id] })).json;
  const bad = await req(`/api/titles/${a.id}`, 'PUT', { ...a, name: 'Not saved', labelIds: ['missing'] });
  assert.equal(bad.status, 409);
  assert.equal((await req(`/api/titles/${a.id}`)).json.name, titleBody.name);
  assert.equal((await req(`/api/titles/${a.id}`, 'PUT', { ...a, labelIds: [genre.id, genre.id] })).status, 400);
  const body = { titleId: a.id, branch: 'Central', copies: 1, extras: '', barcode: 'TAG-ONE', components: [], labelIds: [] };
  let one = (await req('/api/kits', 'POST', body)).json;
  assert.deepEqual(one.labelIds, [genre.id]);
  let two = (await req('/api/kits', 'POST', { ...body, barcode: 'TAG-TWO', labelIds: [vibe.id] })).json;
  assert.deepEqual(new Set(two.labelIds), new Set([genre.id, vibe.id]));
  assert.equal((await req(`/api/kits/${one.id}`, 'PUT', { ...one })).status, 409);
  assert.equal((await req(`/api/titles/${a.id}`, 'PUT', { ...a })).status, 409);
  one = (await req(`/api/kits/${one.id}`)).json;
  one = (await req(`/api/kits/${one.id}`, 'PUT', { ...one, labelIds: [vibe.id] })).json;
  a = (await req(`/api/titles/${a.id}`)).json;
  assert.deepEqual(a.labelIds, [vibe.id]);
  assert.deepEqual((await req(`/api/kits/${two.id}`)).json.labelIds, [vibe.id]);
  const { labelIds: _labels, ...legacyTitle } = a;
  a = (await req(`/api/titles/${a.id}`, 'PUT', { ...legacyTitle, name: 'Renamed' })).json;
  assert.deepEqual(a.labelIds, [vibe.id]);
  two = (await req(`/api/kits/${two.id}`)).json;
  assert.equal((await req(`/api/kits/${two.id}`, 'PUT', { ...two, titleId: b.id, labelIds: [genre.id] })).status, 409);
  one = (await req(`/api/kits/${one.id}`)).json;
  assert.equal((await req(`/api/kits/${one.id}`, 'PUT', { ...one, titleId: b.id })).status, 200);
  b = (await req(`/api/titles/${b.id}`)).json;
  assert.deepEqual(b.labelIds, [vibe.id]);
  const beforeTitleEdit = (await req(`/api/kits/${one.id}`)).json;
  b = (await req(`/api/titles/${b.id}`, 'PUT', { ...b, labelIds: [] })).json;
  assert.equal((await req(`/api/kits/${one.id}`, 'PUT', beforeTitleEdit)).status, 409);
  b = (await req(`/api/titles/${b.id}`, 'PUT', { ...b, labelIds: [vibe.id] })).json;
  assert.deepEqual((await req(`/api/kits/${one.id}`)).json.labelIds, [vibe.id]);
  const onlyTitle = (await req('/api/titles', 'POST', { ...titleBody, name: 'No kits', labelIds: [genre.id] })).json;
  let preview = (await req(`/api/kit-labels/${genre.id}/deletion-preview`, 'POST', { revision: genre.revision })).json;
  assert.equal(preview.titleCount, 1);
  assert.equal(preview.kitCount, 0);
  assert.equal((await req(`/api/titles/${onlyTitle.id}`, 'PUT', { ...onlyTitle, name: 'Changed' })).status, 200);
  assert.equal((await req(`/api/kit-labels/${genre.id}`, 'DELETE', { token: preview.token, acknowledge: true }, genre.revision)).status, 409);
  preview = (await req(`/api/kit-labels/${genre.id}/deletion-preview`, 'POST', { revision: genre.revision })).json;
  assert.equal((await req(`/api/kit-labels/${genre.id}`, 'DELETE', { token: preview.token, acknowledge: true }, genre.revision)).status, 204);
  assert.deepEqual((await req(`/api/titles/${onlyTitle.id}`)).json.labelIds, []);
  const shared = (await req('/api/shared')).json;
  const preferences = (await req('/api/users/p4/views/preferences')).json;
  assert.deepEqual(preferences.titles.find((title) => title.id === b.id).labelIds, [vibe.id]);
  assert.deepEqual(shared.kits.find((kit) => kit.id === one.id).labelIds, [vibe.id]);
});
