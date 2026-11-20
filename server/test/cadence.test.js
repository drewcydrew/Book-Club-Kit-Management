const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const { Pool } = require('pg');
const { migrate } = require('../src/migrate');
const { repairSchema } = require('../src/repair-schema');

const url = process.env.TEST_DATABASE_URL;
const enabled = Boolean(url && process.env.TEST_DATABASE_CONFIRM === 'isolated');

test('cadence migration reports unknown values and rolls back before converting known values', { skip: !enabled }, async (t) => {
  const schema = `cadence_${randomBytes(8).toString('hex')}`;
  const admin = new Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
  t.after(async () => { await pool.end(); await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end(); });
  await pool.query('CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const directory = path.join(__dirname, '..', 'migrations');
  for (const name of (await fs.readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name) && name < '013_').sort()) {
    await pool.query(await fs.readFile(path.join(directory, name), 'utf8'));
    await pool.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
  }
  await pool.query("INSERT INTO clubs(id,name,branch,size,cadence,pickup,address) VALUES('a','A','Central',1,'Monthly','pickup',''),('b','B','Central',1,'Six Weeks','pickup',''),('c','C','Central',1,'unexpected','pickup','')");
  await assert.rejects(migrate(pool), /Unrecognized club cadence values:.*unexpected/);
  assert.equal((await pool.query("SELECT data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='clubs' AND column_name='cadence'")).rows[0].data_type, 'text');
  await pool.query("UPDATE clubs SET cadence='' WHERE id='c'");
  await migrate(pool);
  assert.deepEqual((await pool.query("SELECT cadence FROM clubs WHERE id IN ('a','b','c') ORDER BY id")).rows.map((row) => row.cadence), [1, 1.5, 1]);
  const report = await repairSchema(pool);
  assert.equal(report.state, 'current', report.issues.join('\n'));
  await assert.rejects(pool.query("UPDATE clubs SET cadence=2 WHERE id='a'"), { code: '23514' });
});

test('validated draft removes an assigned slot atomically only with the required unlock', { skip: !enabled }, async (t) => {
  const schema = `cadence_save_${randomBytes(8).toString('hex')}`;
  const admin = new Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  process.env.DATABASE_URL = url;
  process.env.PGOPTIONS = `-c search_path=${schema}`;
  const pool = require('../src/db').getPool();
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end(); await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end();
  });
  await migrate(pool);
  await require('../src/seed').seed(pool);
  server = require('../src/app').listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  async function req(route, method = 'GET', body) {
    const response = await fetch(base + route, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, json: response.status === 204 ? null : await response.json() };
  }
  let shared = (await req('/api/shared')).json;
  const club = shared.clubs.find((item) => item.id === 'c1');
  assert.equal((await req('/api/clubs/c1', 'PUT', { ...club, cadence: 2 })).status, 400);
  assert.equal((await req('/api/clubs/c1', 'PUT', { ...club, cadence: 1.5 })).status, 200);
  shared = (await req('/api/shared')).json;
  assert.equal(shared.clubs.find((item) => item.id === 'c1').cadence, 1.5);
  const cycle = shared.cycles.find((item) => item.id === 'cycle1');
  const slot = cycle.slots[0];
  const plus = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
  const ready = plus(slot.meeting, -21);
  const assignment = { id: 'locked', cycleId: cycle.id, slotId: slot.id, clubId: slot.clubId, kitId: 'k1', ready, meeting: slot.meeting, due: plus(ready, 28), locked: true };
  const route = `/api/cycles/${cycle.id}/schedule`;
  const initial = await req(route, 'PUT', { revision: cycle.revision, assignments: [assignment], publish: false });
  assert.equal(initial.status, 200, JSON.stringify(initial.json));
  const body = { revision: initial.json.revision, assignments: [], publish: false, removedSlotIds: [slot.id], unlockIds: [] };
  assert.equal((await req(`${route}/validate`, 'POST', body)).status, 409);
  assert.equal((await req(`${route}/validate`, 'POST', { ...body, assignments: [assignment], unlockIds: [assignment.id] })).status, 409);
  const valid = await req(`${route}/validate`, 'POST', { ...body, unlockIds: [assignment.id] });
  assert.equal(valid.status, 200, JSON.stringify(valid.json));
  const saved = await req(route, 'PUT', { ...body, unlockIds: [assignment.id], validationToken: valid.json.token });
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  shared = (await req('/api/shared')).json;
  assert.ok(!shared.cycles.find((item) => item.id === cycle.id).slots.some((item) => item.id === slot.id));
  assert.ok(!shared.assignments.some((item) => item.id === assignment.id));
  assert.equal((await req(`${route}/validate`, 'POST', { revision: saved.json.revision, assignments: [], publish: true })).status, 409);
});
