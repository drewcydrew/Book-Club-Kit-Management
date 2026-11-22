const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const test = require('node:test');

const databaseUrl = process.env.TEST_LIBRARY_DATABASE_URL;
const enabled = Boolean(databaseUrl && process.env.TEST_DATABASE_CONFIRM === 'isolated');

test('guided setup and deletion are atomic, scoped and retry-safe', { skip: !enabled }, async (t) => {
  process.env.DATABASE_URL = databaseUrl;
  const { getPool, withLibraryService, withTransaction } = require('../src/db');
  const pool = getPool();
  const app = require('../src/app').createApp(async () => ({ uid: 'setup-test-admin' }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await pool.end(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = (path, { method = 'GET', body, service, auth = true } = {}) => fetch(base + path, {
    method,
    headers: {
      ...(auth ? { Authorization: 'Bearer test-token' } : {}),
      ...(service ? { 'X-Library-Service-Id': service } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const setup = {
    requestId: randomUUID(), name: 'Test library', branches: ['Main'],
    cycle: { name: 'Test cycle', deadline: '2099-01-01', startsOn: '2099-02-01', endsOn: '2099-12-31' },
    titles: [{ name: 'Fictional title', author: 'Fictional author', isbn: '', copies: 10 }],
    club: { name: 'Test club', branch: 'Main', size: 10 }, member: { name: 'Fictional member' },
  };
  assert.equal((await call('/library-services/setup', { method: 'POST', auth: false, body: setup })).status, 401);
  assert.equal((await call('/library-services/setup', { method: 'POST', body: { ...setup, titles: [] } })).status, 400);
  assert.equal((await call('/library-services/setup', { method: 'POST', body: {
    ...setup, cycle: { ...setup.cycle, deadline: '2099-12-31' },
  } })).status, 400);
  const firstResponse = await call('/library-services/setup', { method: 'POST', body: setup });
  assert.equal(firstResponse.status, 201);
  const first = await firstResponse.json();
  const retry = await call('/library-services/setup', { method: 'POST', body: setup });
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), first);
  assert.equal((await call('/library-services/setup', { method: 'POST', body: { ...setup, name: 'Changed' } })).status, 409);
  assert.deepEqual(await (await call(`/library-services/setup/${setup.requestId}`)).json(), first);
  const secondResponse = await call('/library-services/setup', { method: 'POST', body: { ...setup, requestId: randomUUID(), name: 'Other library' } });
  assert.equal(secondResponse.status, 201);
  const second = await secondResponse.json();
  await t.test('a waiting read rejects a service deleted before its lock is acquired', async () => {
    const transientId = randomUUID();
    await pool.query('INSERT INTO library_services(id,name) VALUES($1,$2)', [transientId, 'Transient']);
    let release;
    let acquired;
    const ready = new Promise((resolve) => { acquired = resolve; });
    const deletion = withLibraryService(transientId, () => withTransaction(async (c) => {
      acquired();
      await new Promise((resolve) => { release = resolve; });
      await c.query('DELETE FROM library_services WHERE id=$1', [transientId]);
    }, { exclusiveService: true }));
    await ready;
    const read = withLibraryService(transientId, () => withTransaction(
      (c) => c.query('SELECT id FROM library_services WHERE id=$1', [transientId]), { readOnly: true }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    release();
    await deletion;
    await assert.rejects(read, { status: 404 });
  });
  const kits = await (await call('/kits', { service: first.id })).json();
  const cycles = await (await call('/cycles', { service: first.id })).json();
  assert.equal(kits.length, 1);
  assert.equal(kits[0].copies, 10);
  assert.match(kits[0].barcode, /^starter-/);
  assert.equal(cycles[0].status, 'collecting');
  assert.equal((await call(`/kits/${kits[0].id}/events`, { method: 'POST', service: first.id,
    body: { action: 'reserved', at: '2099-01-01T00:00:00Z', notes: '', revision: kits[0].revision } })).status, 201);
  const previewPath = `/library-services/${first.id}/deletion-preview`;
  const preview = await (await call(previewPath, { method: 'POST' })).json();
  assert.equal(preview.counts.circulation_events, 1);
  assert.equal((await call('/users', { method: 'POST', service: first.id, body: { name: 'Another member', role: 'member' } })).status, 201);
  const deletionPath = `/library-services/${first.id}`;
  assert.equal((await call(deletionPath, { method: 'DELETE', body: { name: first.name, token: preview.token, acknowledge: true } })).status, 409);
  const current = await (await call(previewPath, { method: 'POST' })).json();
  assert.equal((await call(deletionPath, { method: 'DELETE', auth: false, body: { name: first.name, token: current.token, acknowledge: true } })).status, 401);
  assert.equal((await call(deletionPath, { method: 'DELETE', body: { name: 'wrong', token: current.token, acknowledge: true } })).status, 409);

  await t.test('deletion rolls back and restores the circulation trigger', {
    skip: !process.env.TEST_LIBRARY_ADMIN_DATABASE_URL,
  }, async () => {
    const { Client } = require('pg');
    const admin = new Client({ connectionString: process.env.TEST_LIBRARY_ADMIN_DATABASE_URL });
    await admin.connect();
    const table = `setup_blocker_${randomUUID().replace(/-/g, '')}`;
    let created = false;
    try {
      const location = 'SELECT current_database() AS database, inet_server_addr()::text AS address, inet_server_port() AS port';
      assert.deepEqual((await admin.query(location)).rows[0], (await pool.query(location)).rows[0]);
      await admin.query(`CREATE TABLE ${table} (service_id text REFERENCES library_services(id))`);
      created = true;
      await admin.query(`INSERT INTO ${table}(service_id) VALUES($1)`, [first.id]);
      assert.equal((await call(deletionPath, { method: 'DELETE', body: { name: first.name, token: current.token, acknowledge: true } })).status, 409);
      assert.equal((await (await call('/kits', { service: first.id })).json()).length, 1);
      const rolledBack = await (await call(previewPath, { method: 'POST' })).json();
      assert.equal(rolledBack.counts.circulation_events, 1);
      const trigger = await pool.query("SELECT tgenabled FROM pg_trigger WHERE tgrelid = 'circulation_events'::regclass AND tgname = 'circulation_events_append_only'");
      assert.equal(trigger.rows[0].tgenabled, 'O');
    } finally {
      if (created) await admin.query(`DROP TABLE ${table}`);
      await admin.end();
    }
  });

  let release;
  let acquired;
  const ready = new Promise((resolve) => { acquired = resolve; });
  const held = withLibraryService(first.id, () => withTransaction(async () => {
    acquired();
    await new Promise((resolve) => { release = resolve; });
  }));
  await ready;
  let finished = false;
  const deleting = call(deletionPath, { method: 'DELETE', body: { name: first.name, token: current.token, acknowledge: true } })
    .then((response) => { finished = true; return response; });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(finished, false);
  release();
  await held;
  assert.equal((await deleting).status, 204);
  assert.equal((await call('/kits', { service: first.id })).status, 404);
  assert.equal((await (await call('/kits', { service: second.id })).json()).length, 1);
  const other = await (await call(`/library-services/${second.id}/deletion-preview`, { method: 'POST' })).json();
  assert.equal((await call(`/library-services/${second.id}`, { method: 'DELETE', body: { name: second.name, token: other.token, acknowledge: true } })).status, 204);
});
