const express = require('express');
const { randomUUID } = require('node:crypto');
const { getPool } = require('../db');
const { HttpError, object, text } = require('../http');
const { id, date, list, unique, expected, transaction, one, stale } = require('./workflow-util');
const router = express.Router();
async function getCycle(c, cycleId) {
  const cycle = await one(c, `SELECT id,name,to_char(deadline,'YYYY-MM-DD') AS deadline,to_char(starts_on,'YYYY-MM-DD') AS "startsOn",to_char(ends_on,'YYYY-MM-DD') AS "endsOn",status,revision FROM cycles WHERE id=$1`, [cycleId], 'Cycle');
  cycle.slots = (await c.query(`SELECT id,club_id AS "clubId",month,to_char(meeting,'YYYY-MM-DD') AS meeting FROM meeting_slots WHERE cycle_id=$1 ORDER BY month,club_id,id`, [cycleId])).rows;
  cycle.finalized = Object.create(null);
  const groups = await c.query('SELECT club_id FROM finalized_groups WHERE cycle_id=$1', [cycleId]);
  for (const row of groups.rows) cycle.finalized[row.club_id] = [];
  const rankings = await c.query('SELECT club_id,title_id FROM finalized_rankings WHERE cycle_id=$1 ORDER BY club_id,rank', [cycleId]);
  for (const row of rankings.rows) (cycle.finalized[row.club_id] ||= []).push(row.title_id);
  return cycle;
}
function yearMonth(v, field) {
  if (typeof v !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) throw new HttpError(400, `${field} is invalid.`);
  return v;
}
function validate(b) {
  object(b);
  const startsOn = date(b.startsOn, 'startsOn');
  const endsOn = date(b.endsOn, 'endsOn');
  if (startsOn > endsOn) throw new HttpError(400, 'The cycle must start on or before it ends.');
  const deadline = date(b.deadline, 'deadline');
  const slots = list(b.slots, 'slots').map((s) => {
    object(s);
    const month = yearMonth(s.month, 'month');
    const meeting = s.meeting === undefined || s.meeting === null ? null : date(s.meeting, 'meeting');
    if (meeting && meeting.slice(0, 7) !== month) throw new HttpError(400, 'A meeting must fall in its month.');
    if (meeting && meeting <= deadline) throw new HttpError(400, 'Every meeting must be after the voting deadline.');
    return { id: id(s.id), clubId: id(s.clubId, 'clubId'), month, meeting };
  });
  unique(slots.map((s) => s.id), 'slots');
  unique(slots.map((s) => `${s.clubId}\0${s.month}`), 'club months');
  if (slots.some((s) => s.month < startsOn.slice(0, 7) || s.month > endsOn.slice(0, 7))) throw new HttpError(400, 'Every month must fall within the cycle range.');
  const status = text(b.status, 'status', true, 20);
  if (!['open','collecting','drafted','published'].includes(status)) throw new HttpError(400, 'status is invalid.');
  return { name: text(b.name, 'name', true, 200), deadline, startsOn, endsOn, status, slots };
}
router.get('/cycles', async (_req, res) => {
  const c = await getPool().connect();
  try { const ids = await c.query('SELECT id FROM cycles ORDER BY id'); res.json(await Promise.all(ids.rows.map((r) => getCycle(c, r.id)))); }
  finally { c.release(); }
});
router.get('/cycles/:cycleId', async (req, res) => res.json(await getCycle(getPool(), id(req.params.cycleId))));
router.post('/cycles', async (req, res) => {
  const b = validate(req.body); const cycleId = req.body.id === undefined ? randomUUID() : id(req.body.id);
  if (!['open','collecting'].includes(b.status)) throw new HttpError(400, 'A new cycle must be open or collecting.');
  const result = await transaction(async (c) => {
    await c.query('INSERT INTO cycles(id,name,deadline,starts_on,ends_on,status) VALUES($1,$2,$3,$4,$5,$6)', [cycleId,b.name,b.deadline,b.startsOn,b.endsOn,b.status]);
    for (const s of b.slots) await c.query('INSERT INTO meeting_slots(id,cycle_id,club_id,month,meeting) VALUES($1,$2,$3,$4,$5)', [s.id,cycleId,s.clubId,s.month,s.meeting]);
    return getCycle(c, cycleId);
  });
  res.status(201).json(result);
});
router.post('/cycles/:cycleId/reopen', async (req, res) => {
  const b = object(req.body); const rev = expected(b.revision); const cycleId = id(req.params.cycleId);
  if (b.acknowledge !== true) throw new HttpError(400, 'Confirm the effects of reopening this cycle.');
  const result = await transaction(async (c) => {
    const old = await one(c, 'SELECT status,revision FROM cycles WHERE id=$1 FOR UPDATE', [cycleId], 'Cycle');
    stale(old.revision, rev);
    if (!['drafted','published'].includes(old.status)) throw new HttpError(409, 'Only a drafted or published cycle can be reopened.');
    await c.query("UPDATE cycles SET status='collecting',revision=revision+1 WHERE id=$1", [cycleId]);
    return getCycle(c, cycleId);
  });
  res.json(result);
});
router.put('/cycles/:cycleId', async (req, res) => {
  const b = validate(req.body); const rev = expected(req.body.revision); const cycleId = id(req.params.cycleId);
  const result = await transaction(async (c) => {
    const old = await one(c, 'SELECT status,revision FROM cycles WHERE id=$1 FOR UPDATE', [cycleId], 'Cycle'); stale(old.revision,rev);
    if (['drafted','published'].includes(old.status) || ['drafted','published'].includes(b.status)) throw new HttpError(409, 'Use the schedule endpoint for draft or publication changes.');
    if (old.status === 'collecting' && b.status === 'open') throw new HttpError(409, 'An active voting cycle cannot be reopened as a new cycle.');
    const existing = (await c.query(`SELECT id,cycle_id AS "cycleId",club_id AS "clubId",month,to_char(meeting,'YYYY-MM-DD') AS meeting
      FROM meeting_slots WHERE cycle_id=$1 OR id=ANY($2::text[])`, [cycleId,b.slots.map((s) => s.id)])).rows;
    if (existing.some((s) => s.cycleId !== cycleId)) throw new HttpError(409, 'Slot belongs to another cycle.');
    const previous = new Map(existing.map((s) => [s.id,s]));
    const submitted = new Map(b.slots.map((s) => [s.id,s]));
    const changed = (a,b) => a.clubId !== b.clubId || a.month !== b.month || a.meeting !== b.meeting;
    const removedIds = existing.filter((s) => !submitted.has(s.id) || changed(s,submitted.get(s.id))).map((s) => s.id);
    await c.query('DELETE FROM schedule_assignments WHERE cycle_id=$1 AND slot_id=ANY($2::text[])', [cycleId,removedIds]);
    await c.query('DELETE FROM meeting_slots WHERE cycle_id=$1 AND id=ANY($2::text[])', [cycleId,removedIds]);
    for (const s of b.slots) {
      if (!previous.has(s.id) || changed(previous.get(s.id),s)) {
        await c.query('INSERT INTO meeting_slots(id,cycle_id,club_id,month,meeting) VALUES($1,$2,$3,$4,$5)', [s.id,cycleId,s.clubId,s.month,s.meeting]);
      }
    }
    await c.query('UPDATE cycles SET name=$2,deadline=$3,starts_on=$4,ends_on=$5,status=$6,revision=revision+1 WHERE id=$1', [cycleId,b.name,b.deadline,b.startsOn,b.endsOn,b.status]);
    return getCycle(c,cycleId);
  });
  res.json(result);
});
router.delete('/cycles/:cycleId', async (req, res) => {
  await transaction(async (c) => {
    const cycleId = id(req.params.cycleId); const row = await one(c,'SELECT revision FROM cycles WHERE id=$1 FOR UPDATE',[cycleId],'Cycle'); stale(row.revision,expected(Number(req.get('If-Match'))));
    // Child rows first, in foreign-key order, since cycle references are ON DELETE RESTRICT.
    for (const table of ['schedule_assignments','finalized_rankings','finalized_groups','ballot_marks','ballots','meeting_slots']) {
      await c.query(`DELETE FROM ${table} WHERE cycle_id=$1`,[cycleId]);
    }
    await c.query('DELETE FROM cycles WHERE id=$1',[cycleId]);
  });
  res.status(204).end();
});
module.exports = { router, getCycle };
