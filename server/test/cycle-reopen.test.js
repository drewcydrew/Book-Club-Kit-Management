const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const test = require('node:test');
const { Pool } = require('pg');

const url = process.env.TEST_DATABASE_URL;
const enabled = Boolean(url && process.env.TEST_DATABASE_CONFIRM === 'isolated');

test('reopening and editing cycles preserves unaffected shared records', { skip: !enabled, timeout: 30000 }, async (t) => {
  const schema = `reopen_${randomBytes(8).toString('hex')}`;
  const admin = new Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  process.env.DATABASE_URL = url;
  process.env.PGOPTIONS = `-c search_path=${schema}`;
  const pool = require('../src/db').getPool();
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  });
  await require('../src/migrate').migrate(pool);
  await require('../src/seed').seed(pool);
  server = require('../src/app').listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  async function req(path, method = 'GET', body) {
    const response = await fetch(base + path, {
      method, headers: body ? { 'Content-Type': 'application/json' } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, json: response.status === 204 ? null : await response.json() };
  }
  const snapshot = async () => (await req('/api/shared')).json;
  const plus = (day, count) => new Date(Date.parse(`${day}T00:00:00Z`) + count * 86400000).toISOString().slice(0, 10);
  const cycleUrl = '/api/cycles/cycle1';
  const reopen = (revision, acknowledge = true) => req(`${cycleUrl}/reopen`, 'POST', { revision, acknowledge });

  let state = await snapshot();
  let cycle = state.cycles.find((item) => item.id === 'cycle1');
  assert.equal((await reopen(cycle.revision)).status, 409);
  assert.equal((await reopen(cycle.revision, false)).status, 400);
  const ranking = await req(`${cycleUrl}/clubs/c1/ranking`, 'PUT', { revision: cycle.revision, ranking: ['t1', 't2'] });
  assert.equal(ranking.status, 200);
  state = await snapshot();
  cycle = state.cycles.find((item) => item.id === 'cycle1');
  const kitBySlot = { s1: 'k1', s2: 'k4', s3: 'k3', s4: 'k5' };
  const assignments = cycle.slots.map((slot) => {
    const ready = plus(slot.meeting, -21);
    return { id: `a-${slot.id}`, cycleId: cycle.id, slotId: slot.id, clubId: slot.clubId, kitId: kitBySlot[slot.id],
      ready, meeting: slot.meeting, due: plus(ready, 28), locked: slot.id === 's1' };
  });
  const draft = await req(`${cycleUrl}/schedule`, 'PUT', { revision: cycle.revision, assignments, publish: false });
  assert.equal(draft.status, 200, JSON.stringify(draft.json));
  state = await snapshot();
  cycle = state.cycles.find((item) => item.id === 'cycle1');
  assert.equal(cycle.status, 'drafted');
  assert.equal((await req(cycleUrl, 'PUT', { ...cycle, status: 'collecting' })).status, 409);
  assert.equal((await reopen(cycle.revision - 1)).status, 409);
  const race = await Promise.all([reopen(cycle.revision), reopen(cycle.revision)]);
  assert.deepEqual(race.map((response) => response.status).sort(), [200, 409]);
  let reopened = await snapshot();
  assert.equal(reopened.cycles.find((item) => item.id === 'cycle1').status, 'collecting');
  assert.deepEqual(reopened.assignments, state.assignments);
  assert.deepEqual(reopened.ballots, state.ballots);
  assert.deepEqual(reopened.cycles.find((item) => item.id === 'cycle1').finalized, cycle.finalized);
  cycle = reopened.cycles.find((item) => item.id === 'cycle1');
  assert.equal((await reopen(cycle.revision)).status, 409);

  const yesterday = (await pool.query("SELECT to_char(CURRENT_DATE-1,'YYYY-MM-DD') AS day")).rows[0].day;
  let saved = await req(cycleUrl, 'PUT', { ...cycle, deadline: yesterday });
  assert.equal(saved.status, 200);
  cycle = saved.json;
  const ballot = reopened.ballots.find((item) => item.cycleId === cycle.id && item.clubId === 'c1' && item.personId === 'p3');
  const ballotUrl = `${cycleUrl}/clubs/c1/ballots/p3`;
  assert.equal((await req(ballotUrl, 'PUT', ballot)).status, 409);
  assert.equal((await req(`${cycleUrl}/clubs/c1/ranking`, 'PUT', { revision: cycle.revision, ranking: ['t1'] })).status, 409);
  saved = await req(cycleUrl, 'PUT', { ...cycle, deadline: state.cycles.find((item) => item.id === 'cycle1').deadline });
  assert.equal(saved.status, 200);
  assert.equal((await req(ballotUrl, 'PUT', ballot)).status, 200);
  reopened = await snapshot();
  cycle = reopened.cycles.find((item) => item.id === 'cycle1');
  assert.equal(cycle.finalized.c1, undefined);
  assert.deepEqual(reopened.assignments, assignments.slice().sort((a, b) => a.slotId.localeCompare(b.slotId)));

  const redraft = await req(`${cycleUrl}/schedule`, 'PUT', { revision: cycle.revision, assignments, publish: false });
  assert.equal(redraft.status, 200, JSON.stringify(redraft.json));
  const publish = await req(`${cycleUrl}/schedule`, 'PUT', { revision: redraft.json.revision, assignments, publish: true });
  assert.equal(publish.status, 200, JSON.stringify(publish.json));
  const event = await req('/api/kits/k1/events', 'POST', { id: 'pickup', action: 'picked up', at: new Date().toISOString(), notes: '', revision: 1 });
  assert.equal(event.status, 201);
  state = await snapshot();
  cycle = state.cycles.find((item) => item.id === 'cycle1');
  assert.equal((await req(cycleUrl, 'PUT', { ...cycle, status: 'collecting' })).status, 409);
  const publishedReopen = await reopen(cycle.revision);
  assert.equal(publishedReopen.status, 200);
  reopened = await snapshot();
  cycle = reopened.cycles.find((item) => item.id === 'cycle1');
  assert.equal(cycle.status, 'collecting');
  assert.deepEqual(reopened.assignments, state.assignments);
  assert.deepEqual(reopened.ballots, state.ballots);
  assert.deepEqual(reopened.events, state.events);
  assert.equal(reopened.kits.find((kit) => kit.id === 'k1').status, 'out');

  saved = await req(cycleUrl, 'PUT', { ...cycle, name: 'Updated name' });
  assert.equal(saved.status, 200);
  cycle = saved.json;
  assert.deepEqual((await snapshot()).assignments, state.assignments);
  const slot = cycle.slots.find((item) => item.id === 's1');
  const invalidSlots = cycle.slots.map((item) => item.id === slot.id ? { ...item, clubId: 'missing-club', meeting: null } : item);
  assert.equal((await req(cycleUrl, 'PUT', { ...cycle, slots: invalidSlots })).status, 409);
  assert.deepEqual((await snapshot()).assignments, state.assignments);
  assert.equal((await req(cycleUrl, 'GET')).json.revision, cycle.revision);
  const duplicateSlots = cycle.slots.map((item) => item.id === 's2' ? { ...item, clubId: slot.clubId, month: slot.month, meeting: slot.meeting } : item);
  assert.equal((await req(cycleUrl, 'PUT', { ...cycle, slots: duplicateSlots })).status, 400);
  assert.deepEqual((await snapshot()).assignments, state.assignments);
  const other = await req('/api/cycles', 'POST', { ...cycle, id: 'other', status: 'open',
    slots: [{ ...slot, id: 'foreign-slot' }] });
  assert.equal(other.status, 201);
  const foreignSlots = cycle.slots.map((item) => item.id === slot.id ? { ...item, id: 'foreign-slot' } : item);
  assert.equal((await req(cycleUrl, 'PUT', { ...cycle, slots: foreignSlots })).status, 409);
  assert.deepEqual((await snapshot()).assignments, state.assignments);

  const changedSlots = cycle.slots.map((item) => item.id === slot.id ? { ...item, meeting: null } : item);
  saved = await req(cycleUrl, 'PUT', { ...cycle, slots: changedSlots });
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  cycle = saved.json;
  reopened = await snapshot();
  assert.equal(reopened.assignments.some((item) => item.slotId === slot.id), false);
  assert.deepEqual(reopened.assignments, state.assignments.filter((item) => item.slotId !== slot.id));
  assert.deepEqual(reopened.events, state.events);
  assert.equal(reopened.kits.find((kit) => kit.id === 'k1').status, 'out');
  saved = await req(cycleUrl, 'PUT', { ...cycle, slots: cycle.slots.filter((item) => item.id !== 's2') });
  assert.equal(saved.status, 200);
  assert.equal((await snapshot()).assignments.some((item) => item.slotId === 's2'), false);
  cycle = saved.json;
  const first = cycle.slots.find((item) => item.id === 's3');
  const second = cycle.slots.find((item) => item.id === 's4');
  const swapped = cycle.slots.map((item) => item.id === first.id ? { ...item, clubId: second.clubId }
    : item.id === second.id ? { ...item, clubId: first.clubId } : item);
  saved = await req(cycleUrl, 'PUT', { ...cycle, slots: swapped });
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  assert.equal((await snapshot()).assignments.length, 0);
});
