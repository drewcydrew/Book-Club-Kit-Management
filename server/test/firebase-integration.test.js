const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const test = require('node:test');
const { Pool } = require('pg');
const { HttpError } = require('../src/http');

const databaseUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl && process.env.TEST_DATABASE_CONFIRM === 'isolated');

test('Firebase identity provisioning and demo/admin authorization', { skip: !enabled, timeout: 30000 }, async (t) => {
  const schema = `firebase_${randomBytes(8).toString('hex')}`;
  const database = new Pool({ connectionString: databaseUrl });
  await database.query(`CREATE SCHEMA "${schema}"`);
  process.env.DATABASE_URL = databaseUrl;
  process.env.PGOPTIONS = `-c search_path=${schema}`;
  const pool = require('../src/db').getPool();
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
    await database.query(`DROP SCHEMA "${schema}" CASCADE`);
    await database.end();
  });
  await require('../src/migrate').migrate(pool);
  await require('../src/seed').seed(pool);
  const repair = await require('../src/repair-schema').repairSchema(pool);
  assert.equal(repair.state, 'current', repair.issues.join('\n'));
  const app = require('../src/app').createApp(async (token) => {
    if (!['valid', 'another'].includes(token)) throw new HttpError(401, 'Invalid session.');
    return { uid: token === 'valid' ? 'firebase-test-uid' : 'another-test-uid' };
  });
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method = 'GET', body, token) => fetch(base + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const sessions = await Promise.all(Array.from({ length: 3 }, () => request('/api/session', 'GET', undefined, 'valid')));
  const identities = await Promise.all(sessions.map((response) => response.json()));
  assert.ok(sessions.every((response) => response.status === 200));
  assert.equal(new Set(identities.map((person) => person.id)).size, 1);
  assert.equal(identities[0].role, 'admin');
  assert.equal(identities[0].firebaseManaged, true);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM firebase_identities')).rows[0].count, 1);
  const second = await (await request('/api/session', 'GET', undefined, 'another')).json();
  assert.notEqual(second.id, identities[0].id);
  assert.equal((await request('/api/shared')).status, 401);
  assert.equal((await request('/api/shared', 'GET', undefined, 'expired')).status, 401);
  assert.equal((await request('/api/shared', 'GET', undefined, 'valid')).status, 200);
  assert.equal((await request('/api/users/p1/views/preferences')).status, 403);
  assert.equal((await request('/api/users/p3/views/preferences')).status, 200);
  assert.ok((await (await request('/api/users')).json()).every((person) => person.role === 'member'));
  assert.equal((await request('/api/settings', 'PUT', {})).status, 401);
  assert.equal((await request('/api/users/p2/views/preferences')).status, 403);
  assert.equal((await request('/api/cycles/cycle1/clubs/c1/ballots/p1', 'PUT', { marks: {}, ranking: [], revision: 0 })).status, 403);
  assert.equal((await request('/api/cycles/cycle1/clubs/c1/ranking', 'PUT', { ranking: [], revision: 1, personId: 'p1' })).status, 403);
  assert.equal((await request('/api/cycles/cycle1/clubs/c1/ranking', 'PUT', { ranking: [], revision: 1, personId: 'p4' })).status, 404);
  assert.equal((await request('/api/cycles/cycle1/clubs/c1/ranking', 'PUT', { ranking: ['t1'], revision: 1, personId: 'p3' })).status, 200);
  const admin = identities[0];
  assert.equal((await request(`/api/users/${admin.id}`, 'PUT', { name: 'Changed', role: 'member', revision: admin.revision }, 'valid')).status, 409);
  const deletion = await fetch(`${base}/api/users/${admin.id}`, { method: 'DELETE', headers: { Authorization: 'Bearer valid', 'If-Match': String(admin.revision) } });
  assert.equal(deletion.status, 409);
});
