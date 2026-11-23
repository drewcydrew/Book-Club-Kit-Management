const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const { Pool } = require('pg');
const { app, fetchAuthenticated: fetch } = require('../test-support/authenticated-app');
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
  await pool.query("INSERT INTO cycles(id,name,deadline,starts_on,ends_on,status) VALUES('proof','Proof','2026-12-01','2027-01-01','2027-01-31','collecting')");
  await pool.query("INSERT INTO meeting_slots(id,cycle_id,club_id,month,meeting) VALUES('proof-slot','proof','a','2027-01','2027-01-20')");
  await assert.rejects(migrate(pool), /Unrecognized club cadence values:.*unexpected/);
  assert.equal((await pool.query("SELECT data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='clubs' AND column_name='cadence'")).rows[0].data_type, 'text');
  await pool.query("UPDATE clubs SET cadence='' WHERE id='c'");
  await migrate(pool);
  assert.deepEqual((await pool.query("SELECT cadence FROM clubs WHERE id IN ('a','b','c') ORDER BY id")).rows.map((row) => row.cadence), [1, 1.5, 1]);
  assert.deepEqual((await pool.query("SELECT meeting_weekday,meeting_occurrence FROM clubs WHERE id='a'")).rows[0], { meeting_weekday: 1, meeting_occurrence: 1 });
  assert.equal((await pool.query("SELECT revision FROM clubs WHERE id='a'")).rows[0].revision, 1);
  assert.deepEqual((await pool.query("SELECT cadence_offset FROM clubs WHERE id IN ('a','b','c') ORDER BY id")).rows.map((row) => row.cadence_offset), [0, 0, 0]);
  assert.equal((await pool.query("SELECT to_char(meeting,'YYYY-MM-DD') AS meeting FROM meeting_slots WHERE id='proof-slot'")).rows[0].meeting, '2027-01-20');
  const report = await repairSchema(pool);
  assert.equal(report.state, 'current', report.issues.join('\n'));
  await assert.rejects(pool.query("UPDATE clubs SET cadence=2 WHERE id='a'"), { code: '23514' });
  await assert.rejects(pool.query("UPDATE clubs SET cadence_offset=3 WHERE id='a'"), { code: '23514' });
  await assert.rejects(pool.query("UPDATE clubs SET meeting_occurrence=5 WHERE id='a'"), { code: '23514' });
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
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  async function req(route, method = 'GET', body) {
    const response = await fetch(base + route, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, json: response.status === 204 ? null : await response.json() };
  }
  let shared = (await req('/api/shared')).json;
  const club = shared.clubs.find((item) => item.id === 'c1');
  assert.equal(club.cadenceOffset, 0);
  const originalSlots = shared.cycles.find((item) => item.id === 'cycle1').slots;
  assert.equal((await req('/api/clubs/c1', 'PUT', { ...club, meetingWeekday: 7 })).status, 400);
  assert.equal((await req('/api/clubs/c1', 'PUT', { ...club, meetingOccurrence: 5 })).status, 400);
  const { meetingWeekday: _missing, ...oldClient } = club;
  assert.equal((await req('/api/clubs/c1', 'PUT', oldClient)).status, 400);
  assert.equal((await req('/api/clubs/c1', 'PUT', { ...club, cadence: 2 })).status, 400);
  for (const invalid of [-1, 3, 1.5, '1', null]) {
    assert.equal((await req('/api/clubs/c1', 'PUT', { ...club, cadenceOffset: invalid })).status, 400);
  }
  const { cadenceOffset: _missingOffset, ...oldOffsetClient } = club;
  assert.equal((await req('/api/clubs/c1', 'PUT', oldOffsetClient)).status, 400);
  assert.equal((await req('/api/clubs/c1', 'PUT', { ...club, cadence: 1.5, cadenceOffset: 1, meetingWeekday: 4, meetingOccurrence: -1 })).status, 200);
  shared = (await req('/api/shared')).json;
  assert.equal(shared.clubs.find((item) => item.id === 'c1').cadence, 1.5);
  assert.equal(shared.clubs.find((item) => item.id === 'c1').cadenceOffset, 1);
  assert.deepEqual(shared.cycles.find((item) => item.id === 'cycle1').slots, originalSlots);
  assert.equal(shared.clubs.find((item) => item.id === 'c1').meetingWeekday, 4);
  assert.equal(shared.clubs.find((item) => item.id === 'c1').meetingOccurrence, -1);
  const edited = shared.clubs.find((item) => item.id === 'c1');
  const monthly = await req('/api/clubs/c1', 'PUT', { ...edited, cadence: 1 });
  assert.equal(monthly.status, 200);
  assert.equal(monthly.json.cadenceOffset, 1);
  const restored = await req('/api/clubs/c1', 'PUT', { ...monthly.json, cadence: 1.5 });
  assert.equal(restored.status, 200);
  assert.equal(restored.json.cadenceOffset, 1);
  const created = await req('/api/clubs', 'POST', { name: 'Offset club', branch: 'Central', size: 2,
    cadence: 1.5, cadenceOffset: 2, meetingWeekday: 1, meetingOccurrence: 1, pickupWeekday: 4, pickupOccurrence: 2, pickup: 'pickup', address: '' });
  assert.equal(created.status, 201);
  assert.equal((await req(`/api/clubs/${created.json.id}`)).json.cadenceOffset, 2);
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
  const dated = { revision: saved.json.revision, assignments: [], publish: false,
    newSlots: [{ id: 'replacement', clubId: slot.clubId, month: slot.month }],
    datedSlots: [{ id: 'replacement', meeting: slot.meeting }] };
  const preview = await req(`${route}/validate`, 'POST', dated);
  assert.equal(preview.status, 200, JSON.stringify(preview.json));
  assert.equal((await req(`${route}/validate`, 'POST', { ...dated, datedSlots: [{ id: 'replacement', meeting: '2020-01-01' }] })).status, 409);
  assert.equal((await req(route, 'PUT', { ...dated, datedSlots: [], validationToken: preview.json.token })).status, 409);
  assert.equal((await req(route, 'PUT', { ...dated, validationToken: preview.json.token })).status, 200);
  shared = (await req('/api/shared')).json;
  assert.equal(shared.cycles.find((item) => item.id === cycle.id).slots.find((item) => item.id === 'replacement').meeting, slot.meeting);
  assert.equal((await req(`${route}/validate`, 'POST', { ...dated, revision: shared.cycles.find((item) => item.id === cycle.id).revision, newSlots: [] })).status, 409);
  await pool.query("INSERT INTO cycles(id,name,deadline,starts_on,ends_on,status) VALUES('rule-cycle','Rule dates','2026-12-01','2027-01-01','2027-02-28','collecting')");
  await pool.query("INSERT INTO meeting_slots(id,cycle_id,club_id,month,meeting) VALUES('jan-rule','rule-cycle','c1','2027-01',NULL),('feb-rule','rule-cycle','c2','2027-02',NULL)");
  const makeRuleAssignment = (id, clubId, meeting) => {
    const ready = plus(meeting, -21);
    return { id, cycleId: 'rule-cycle', slotId: id, clubId, kitId: 'k1', ready, meeting, due: plus(ready, 28), locked: false };
  };
  const jan = makeRuleAssignment('jan-rule', 'c1', '2027-01-04');
  const febBoundary = makeRuleAssignment('feb-rule', 'c2', '2027-02-04');
  const ruleBody = { revision: 1, assignments: [jan, febBoundary], publish: false };
  const boundary = await req('/api/cycles/rule-cycle/schedule/validate', 'POST', ruleBody);
  assert.ok(boundary.json.warnings.some((warning) => warning.message.includes('turnaround buffer')));
  const febAfter = makeRuleAssignment('feb-rule', 'c2', '2027-02-05');
  const clearBody = { ...ruleBody, assignments: [jan, febAfter] };
  const clear = await req('/api/cycles/rule-cycle/schedule/validate', 'POST', clearBody);
  assert.equal(clear.status, 200);
  assert.ok(!clear.json.warnings.some((warning) => warning.message.includes('turnaround buffer')));
  assert.equal((await req('/api/cycles/rule-cycle/schedule', 'PUT', { ...clearBody, validationToken: clear.json.token })).status, 200);
});
