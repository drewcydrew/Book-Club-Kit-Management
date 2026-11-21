const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const test = require('node:test');
const { Pool } = require('pg');
const { app, fetchAuthenticated: fetch } = require('../test-support/authenticated-app');

const url = process.env.TEST_DATABASE_URL;
const enabled = Boolean(url && process.env.TEST_DATABASE_CONFIRM === 'isolated');

test('local schedule overrides require current specific validation and explicit unlock', { skip: !enabled, timeout: 30000 }, async (t) => {
  const schema = `schedule_${randomBytes(8).toString('hex')}`;
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
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  async function req(path, method = 'GET', body) {
    const response = await fetch(base + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {},
      ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, json: response.status === 204 ? null : await response.json() };
  }
  const state = () => req('/api/shared').then((result) => result.json);
  const plus = (day, count) => new Date(Date.parse(`${day}T00:00:00Z`) + count * 86400000).toISOString().slice(0, 10);
  const route = '/api/cycles/cycle1/schedule';
  let data = await state();
  let cycle = data.cycles.find((item) => item.id === 'cycle1');
  const make = (slot, kitId, locked = false) => {
    const ready = plus(slot.meeting, -21);
    return { id:`a-${slot.id}`,cycleId:cycle.id,slotId:slot.id,clubId:slot.clubId,kitId,ready,meeting:slot.meeting,due:plus(ready,28),locked };
  };
  const original = make(cycle.slots.find((slot) => slot.id === 's1'), 'k3', true);
  let result = await req(route, 'PUT', { revision:cycle.revision, assignments:[original], publish:false });
  assert.equal(result.status, 200, JSON.stringify(result.json));
  cycle = (await state()).cycles.find((item) => item.id === 'cycle1');
  const slot = cycle.slots.find((item) => item.id === 's4');
  const other = { ...make(slot, 'k1'), id:'other-a', cycleId:'other', slotId:'other-slot' };
  await pool.query("INSERT INTO cycles(id,name,deadline,starts_on,ends_on,status) VALUES('other','Other',$1,$2,$2,'drafted')", [cycle.deadline,slot.meeting]);
  await pool.query("INSERT INTO meeting_slots(id,cycle_id,club_id,month,meeting) VALUES('other-slot','other',$1,$2,$3)", [slot.clubId,slot.month,slot.meeting]);
  await pool.query("INSERT INTO schedule_assignments(id,cycle_id,slot_id,club_id,kit_id,ready,meeting,due,locked) VALUES($1,$2,$3,$4,$5,$6,$7,$8,false)",
    [other.id,other.cycleId,other.slotId,other.clubId,other.kitId,other.ready,other.meeting,other.due]);
  data = await state();
  const revisions = (items) => items.map(({ id, revision }) => ({ id, revision })).sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const basis = { cycles:revisions(data.cycles), kits:revisions(data.kits), clubs:revisions(data.clubs), settings:data.library.revision };
  const based = { revision:cycle.revision, assignments:[original], publish:false, unlockIds:[], basis };
  const basisValidation = await req(`${route}/validate`, 'POST', based);
  assert.equal(basisValidation.status, 200);
  await pool.query("UPDATE kits SET revision=revision+1 WHERE id='k4'");
  assert.equal((await req(route, 'PUT', { ...based, validationToken:basisValidation.json.token, acknowledge:true })).status, 409);
  assert.equal((await req(`${route}/validate`, 'POST', based)).status, 409);
  const updatedBasis = async () => {
    const snapshot = await state();
    return { cycles:revisions(snapshot.cycles), kits:revisions(snapshot.kits), clubs:revisions(snapshot.clubs), settings:snapshot.library.revision };
  };
  const beforeRule = { ...based, basis:await updatedBasis() };
  const ruleValidation = await req(`${route}/validate`, 'POST', beforeRule);
  const ruleClub = (await state()).clubs.find((item) => item.id === 'c1');
  assert.equal((await req('/api/clubs/c1', 'PUT', { ...ruleClub, meetingOccurrence:3, meetingWeekday:4 })).status, 200);
  assert.equal((await req(route, 'PUT', { ...beforeRule, validationToken:ruleValidation.json.token, acknowledge:true })).status, 409);
  const beforeOffset = { ...based, basis:await updatedBasis() };
  const offsetValidation = await req(`${route}/validate`, 'POST', beforeOffset);
  const offsetClub = (await state()).clubs.find((item) => item.id === 'c1');
  assert.equal((await req('/api/clubs/c1', 'PUT', { ...offsetClub, cadenceOffset:1 })).status, 200);
  assert.equal((await req(route, 'PUT', { ...beforeOffset, validationToken:offsetValidation.json.token, acknowledge:true })).status, 409);
  const beforeSettings = { ...based, basis:await updatedBasis() };
  const settingsValidation = await req(`${route}/validate`, 'POST', beforeSettings);
  const currentSettings = (await state()).library;
  assert.equal((await req('/api/settings', 'PUT', { ...currentSettings, name:'Updated library' })).status, 200);
  assert.equal((await req(route, 'PUT', { ...beforeSettings, validationToken:settingsValidation.json.token, acknowledge:true })).status, 409);
  const beforeHistory = { ...based, basis:await updatedBasis() };
  const historyValidation = await req(`${route}/validate`, 'POST', beforeHistory);
  const currentClub = (await state()).clubs.find((item) => item.id === 'c1');
  assert.equal((await req('/api/clubs/c1/history', 'PUT', { revision:currentClub.revision, titles:['t3','t4'] })).status, 200);
  assert.equal((await req(route, 'PUT', { ...beforeHistory, validationToken:historyValidation.json.token, acknowledge:true })).status, 409);
  const beforeOther = { ...based, basis:await updatedBasis() };
  const otherValidation = await req(`${route}/validate`, 'POST', beforeOther);
  assert.equal((await req('/api/cycles/other/schedule', 'PUT', { revision:1, assignments:[other], publish:false })).status, 200);
  assert.equal((await req(route, 'PUT', { ...beforeOther, validationToken:otherValidation.json.token, acknowledge:true })).status, 409);
  assert.deepEqual((await state()).assignments.find((item) => item.id === original.id), original);
  await pool.query("UPDATE kits SET status='unavailable' WHERE id='k5'");
  const kits = { s1:'k5',s2:'k5',s3:'k5',s4:'k1' };
  const assignments = cycle.slots.map((item) => make(item,kits[item.id]));
  const body = { revision:cycle.revision, assignments, publish:false, unlockIds:['a-s1'] };
  assert.equal((await req(route, 'PUT', { ...body, unlockIds:[] })).status, 409);
  assert.equal((await req(`${route}/validate`, 'POST', { ...body, unlockIds:[] })).status, 409);
  result = await req(`${route}/validate`, 'POST', body);
  assert.equal(result.status, 200, JSON.stringify(result.json));
  assert.ok(result.json.warnings.some((w) => /unavailable/.test(w.message)));
  assert.ok(result.json.warnings.some((w) => /already read/.test(w.message)));
  assert.ok(result.json.warnings.some((w) => /already has title/.test(w.message)));
  assert.ok(result.json.warnings.some((w) => /other/.test(w.message)));
  const token = result.json.token;
  assert.equal((await req(route, 'PUT', { ...body, validationToken:token })).status, 409);
  assert.equal((await req(route, 'PUT', { ...body, validationToken:token, acknowledge:true, assignments:assignments.slice(0, 3) })).status, 409);
  await pool.query("UPDATE kits SET status='out' WHERE id='k5'");
  assert.equal((await req(route, 'PUT', { ...body, validationToken:token, acknowledge:true })).status, 409);
  result = await req(`${route}/validate`, 'POST', body);
  assert.ok(result.json.warnings.some((w) => /Checked-out/.test(w.message)));
  await pool.query("UPDATE kits SET status='unavailable' WHERE id='k5'");
  result = await req(`${route}/validate`, 'POST', body);
  const saved = await req(route, 'PUT', { ...body, validationToken:result.json.token, acknowledge:true });
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  data = await state();
  assert.equal(data.assignments.filter((a) => a.cycleId === cycle.id).length, 4);
  assert.ok(data.assignments.some((a) => a.id === other.id && a.kitId === other.kitId));
  assert.equal(data.assignments.find((a) => a.id === 'a-s1').locked, false);
  const publication = { revision:saved.json.revision, assignments, publish:true, unlockIds:[] };
  assert.equal((await req(route, 'PUT', publication)).status, 409);
  assert.equal((await req(`${route}/validate`, 'POST', { ...publication, assignments:assignments.slice(0, 3) })).status, 409);
  result = await req(`${route}/validate`, 'POST', publication);
  assert.equal(result.status, 200);
  assert.ok(result.json.warnings.length > 0);
  assert.equal((await req(route, 'PUT', { ...publication, validationToken:result.json.token })).status, 409);
  const published = await Promise.all([1,2].map(() => req(route, 'PUT', { ...publication, validationToken:result.json.token, acknowledge:true })));
  assert.deepEqual(published.map((response) => response.status).sort(), [200,409]);
  assert.equal((await state()).cycles.find((item) => item.id === 'cycle1').status, 'published');

  await pool.query("INSERT INTO cycles(id,name,deadline,starts_on,ends_on,status) VALUES('regen','Regeneration','2031-12-01','2032-01-01','2032-02-29','collecting')");
  await pool.query(`INSERT INTO meeting_slots(id,cycle_id,club_id,month,meeting) VALUES
    ('regen-jan','regen','c1','2032-01','2032-01-03'),
    ('regen-feb','regen','c1','2032-02','2032-02-07'),
    ('regen-hidden','regen','c2','2032-01',NULL)`);
  const old = { id:'regen-old', cycleId:'regen', slotId:'regen-jan', clubId:'c1', kitId:'k3',
    ready:'2031-12-13', meeting:'2032-01-03', due:'2032-01-10', locked:true };
  await pool.query(`INSERT INTO schedule_assignments(id,cycle_id,slot_id,club_id,kit_id,ready,meeting,due,locked)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, Object.values(old));
  const regenRoute = '/api/cycles/regen/schedule';
  const fresh = { id:'regen-new-a', cycleId:'regen', slotId:'regen-new-jan', clubId:'c1', kitId:'k3',
    ready:'2031-12-25', meeting:'2032-01-15', due:'2032-01-22', locked:false };
  const replacement = { revision:1, publish:false, assignments:[fresh], unlockIds:[old.id], basis:await updatedBasis(),
    removedSlotIds:['regen-jan','regen-feb'],
    newSlots:[{ id:'regen-new-jan', clubId:'c1', month:'2032-01' }, { id:'regen-new-feb', clubId:'c1', month:'2032-02' }],
    datedSlots:[{ id:'regen-new-jan', meeting:'2032-01-15' }, { id:'regen-new-feb', meeting:'2032-02-19' }] };
  assert.equal((await req(`${regenRoute}/validate`, 'POST', { ...replacement, unlockIds:[] })).status, 409);
  const preview = await req(`${regenRoute}/validate`, 'POST', replacement);
  assert.equal(preview.status, 200, JSON.stringify(preview.json));
  assert.equal((await req(regenRoute, 'PUT', { ...replacement, datedSlots:replacement.datedSlots.slice(0, 1),
    validationToken:preview.json.token, acknowledge:true })).status, 409);
  const before = await state();
  const collision = { ...replacement,
    newSlots:[replacement.newSlots[0], { ...replacement.newSlots[1], id:'other-slot' }],
    datedSlots:[replacement.datedSlots[0], { ...replacement.datedSlots[1], id:'other-slot' }] };
  const collisionPreview = await req(`${regenRoute}/validate`, 'POST', collision);
  assert.equal(collisionPreview.status, 200, JSON.stringify(collisionPreview.json));
  assert.ok((await req(regenRoute, 'PUT', { ...collision, validationToken:collisionPreview.json.token, acknowledge:true })).status >= 400);
  const rolledBack = await state();
  assert.deepEqual(rolledBack.cycles.find((item) => item.id === 'regen'), before.cycles.find((item) => item.id === 'regen'));
  assert.deepEqual(rolledBack.assignments.filter((item) => item.cycleId === 'regen'), [old]);
  const regenSaved = await req(regenRoute, 'PUT', { ...replacement, validationToken:preview.json.token, acknowledge:true });
  assert.equal(regenSaved.status, 200, JSON.stringify(regenSaved.json));
  const after = await state();
  const newCycle = after.cycles.find((item) => item.id === 'regen');
  assert.deepEqual(newCycle.slots.map(({ id, meeting }) => ({ id, meeting })).sort((a,b) => a.id.localeCompare(b.id)), [
    { id:'regen-hidden', meeting:null }, { id:'regen-new-feb', meeting:'2032-02-19' }, { id:'regen-new-jan', meeting:'2032-01-15' },
  ]);
  assert.deepEqual(after.assignments.filter((item) => item.cycleId === 'regen'), [fresh]);
  assert.equal((await req(`${regenRoute}/validate`, 'POST', replacement)).status, 409);
  await pool.query("UPDATE cycles SET status='published' WHERE id='regen'");
  assert.equal((await req(`${regenRoute}/validate`, 'POST', { ...replacement, revision:regenSaved.json.revision, publish:true })).status, 409);
});
