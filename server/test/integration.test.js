const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const test = require('node:test');
const { Pool } = require('pg');

const databaseUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl && process.env.TEST_DATABASE_CONFIRM === 'isolated');

test('shared records persist, enforce constraints and reject stale edits', { skip: !enabled, timeout: 30000 }, async (t) => {
  const schema = `test_${randomBytes(8).toString('hex')}`;
  const admin = new Pool({ connectionString: databaseUrl });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  process.env.DATABASE_URL = databaseUrl;
  process.env.PGOPTIONS = `-c search_path=${schema}`;
  const { getPool } = require('../src/db');
  const pool = getPool();
  const { migrate } = require('../src/migrate');
  const { seed } = require('../src/seed');
  const app = require('../src/app');
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  });
  await migrate(pool);
  await migrate(pool);
  await seed(pool);
  await pool.query("UPDATE titles SET name='Edited demo title' WHERE id='t1'");
  await seed(pool);
  assert.equal((await pool.query("SELECT name FROM titles WHERE id='t1'")).rows[0].name, 'Edited demo title');

  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let base = `http://127.0.0.1:${server.address().port}`;
  async function request(url, method = 'GET', body, revision) {
    const response = await fetch(`${base}${url}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(revision ? { 'If-Match': String(revision) } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const json = response.status === 204 ? null : await response.json();
    return { status: response.status, json };
  }
  const title = { name: 'Test title', author: 'Writer', isbn: '', pages: 10, genres: '', notes: '', largePrint: false, audio: false };
  assert.equal((await request('/api/titles', 'POST', { ...title, name: '' })).status, 400);
  const created = await request('/api/titles', 'POST', title);
  assert.equal(created.status, 201);
  const titleId = created.json.id;
  const kitBody = { titleId, barcode: 'unique-kit', branch: 'Central', copies: 2, extras: '', components: ['copy-one'] };
  assert.equal((await request('/api/kits', 'POST', { ...kitBody, titleId: 'missing' })).status, 404);
  const kit = await request('/api/kits', 'POST', kitBody);
  assert.equal(kit.status, 201);
  assert.equal((await request('/api/kits', 'POST', { ...kitBody, barcode: 'COPY-ONE' })).status, 409);
  assert.equal((await request('/api/kits', 'POST', { ...kitBody, barcode: 'another', components: ['a', 'b', 'c'] })).status, 400);
  const clubBody = { name: 'Test club', branch: 'Central', size: 5, cadence: 'Monthly', pickup: 'pickup', address: '' };
  const club = await request('/api/clubs', 'POST', clubBody);
  assert.equal(club.status, 201);
  const link = `/api/clubs/${club.json.id}/kits/${kit.json.id}`;
  assert.equal((await request(link, 'PUT')).status, 204);
  assert.equal((await request(link, 'PUT')).status, 204);
  assert.equal((await request(`/api/clubs/${club.json.id}/kits`)).json.length, 1);
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
  const restartedUrl = `${base}/api/clubs/${club.json.id}/kits`;
  assert.equal((await (await fetch(restartedUrl)).json()).length, 1);
  assert.equal((await request(`/api/kits/${kit.json.id}`, 'DELETE', undefined, kit.json.revision)).status, 409);
  const cascadeTitle = await request('/api/titles', 'POST', { ...title, name: 'Cascade title' });
  const cascadeKit = await request('/api/kits', 'POST', { ...kitBody, titleId: cascadeTitle.json.id, barcode: 'cascade-kit', components: [] });
  assert.equal((await request(`/api/clubs/${club.json.id}/kits/${cascadeKit.json.id}`, 'PUT')).status, 204);
  await pool.query("INSERT INTO circulation_events(id,kit_id,action,at,notes) VALUES($1,$2,'reserved',now(),'')", [randomBytes(8).toString('hex'), cascadeKit.json.id]);
  assert.equal((await request(`/api/titles/${cascadeTitle.json.id}`, 'DELETE', undefined, cascadeTitle.json.revision)).status, 204);
  assert.equal((await request(`/api/titles/${cascadeTitle.json.id}`)).status, 404);
  assert.equal((await request(`/api/kits/${cascadeKit.json.id}`)).status, 404);
  assert.equal((await pool.query("SELECT 1 FROM club_kits WHERE kit_id=$1", [cascadeKit.json.id])).rowCount, 0);
  assert.equal((await pool.query("SELECT 1 FROM circulation_events WHERE kit_id=$1", [cascadeKit.json.id])).rowCount, 0);
  assert.equal((await pool.query("SELECT tgenabled FROM pg_trigger WHERE tgname='circulation_events_append_only'")).rows[0].tgenabled, 'O');
  const concurrent = await Promise.all(['Updated', 'Other update'].map((name) =>
    request(`/api/titles/${titleId}`, 'PUT', { ...title, name, revision: created.json.revision })));
  assert.deepEqual(concurrent.map((result) => result.status).sort(), [200, 409]);
  const updated = concurrent.find((result) => result.status === 200);
  assert.equal((await request(`/api/titles/${titleId}`, 'PUT', { ...title, revision: created.json.revision })).status, 409);
  assert.equal((await request(`/api/titles/${titleId}`, 'DELETE', undefined, created.json.revision)).status, 409);
  assert.equal((await request(link, 'DELETE')).status, 204);
  assert.equal((await request(`/api/kits/${kit.json.id}`, 'DELETE', undefined, kit.json.revision)).status, 204);
  assert.equal((await request(`/api/titles/${titleId}`, 'DELETE', undefined, updated.json.revision)).status, 204);
  assert.equal((await request(`/api/clubs/${club.json.id}`, 'DELETE', undefined, club.json.revision)).status, 204);
  assert.equal((await request(`/api/titles/${titleId}`)).status, 404);
});

test('conflicting seed rolls back without partial demo records', { skip: !enabled, timeout: 30000 }, async (t) => {
  const schema = `test_${randomBytes(8).toString('hex')}`;
  const admin = new Pool({ connectionString: databaseUrl });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
  t.after(async () => { await pool.end(); await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end(); });
  const { migrate } = require('../src/migrate');
  const { seed } = require('../src/seed');
  await migrate(pool);
  await pool.query("INSERT INTO titles(id,name,author,pages) VALUES('t2','Existing','Author',1)");
  await assert.rejects(seed(pool), (error) => error.code === '23505');
  const result = await pool.query('SELECT id FROM titles ORDER BY id');
  assert.deepEqual(result.rows.map((row) => row.id), ['t2']);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM kits')).rows[0].count, 0);
});
