const express = require('express');
const { randomUUID } = require('node:crypto');
const { getPool } = require('../db');
const { HttpError, object, text } = require('../http');
const { id, date, list, unique, expected, transaction, one, stale } = require('./workflow-util');
const router = express.Router();
async function getCycle(c, cycleId) {
  const cycle = await one(c, `SELECT id,name,to_char(deadline,'YYYY-MM-DD') AS deadline,status,revision FROM cycles WHERE id=$1`, [cycleId], 'Cycle');
  cycle.slots = (await c.query(`SELECT id,club_id AS "clubId",to_char(meeting,'YYYY-MM-DD') AS meeting FROM meeting_slots WHERE cycle_id=$1 ORDER BY meeting,id`, [cycleId])).rows;
  cycle.finalized = Object.create(null);
  const groups = await c.query('SELECT club_id FROM finalized_groups WHERE cycle_id=$1', [cycleId]);
  for (const row of groups.rows) cycle.finalized[row.club_id] = [];
  const rankings = await c.query('SELECT club_id,title_id FROM finalized_rankings WHERE cycle_id=$1 ORDER BY club_id,rank', [cycleId]);
  for (const row of rankings.rows) (cycle.finalized[row.club_id] ||= []).push(row.title_id);
  return cycle;
}
function validate(b) {
  object(b);
  const slots = list(b.slots, 'slots').map((s) => { object(s); return { id: id(s.id), clubId: id(s.clubId, 'clubId'), meeting: date(s.meeting, 'meeting') }; });
  unique(slots.map((s) => s.id), 'slots');
  unique(slots.map((s) => `${s.clubId}\0${s.meeting}`), 'club meetings');
  const deadline = date(b.deadline, 'deadline');
  if (slots.some((s) => s.meeting <= deadline)) throw new HttpError(400, 'Every meeting must be after the voting deadline.');
  const status = text(b.status, 'status', true, 20);
  if (!['open','collecting','drafted','published'].includes(status)) throw new HttpError(400, 'status is invalid.');
  return { name: text(b.name, 'name', true, 200), deadline, status, slots };
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
    await c.query('INSERT INTO cycles(id,name,deadline,status) VALUES($1,$2,$3,$4)', [cycleId,b.name,b.deadline,b.status]);
    for (const s of b.slots) await c.query('INSERT INTO meeting_slots(id,cycle_id,club_id,meeting) VALUES($1,$2,$3,$4)', [s.id,cycleId,s.clubId,s.meeting]);
    return getCycle(c, cycleId);
  });
  res.status(201).json(result);
});
router.put('/cycles/:cycleId', async (req, res) => {
  const b = validate(req.body); const rev = expected(req.body.revision); const cycleId = id(req.params.cycleId);
  const result = await transaction(async (c) => {
    const old = await one(c, 'SELECT status,revision FROM cycles WHERE id=$1 FOR UPDATE', [cycleId], 'Cycle'); stale(old.revision,rev);
    if (['drafted','published'].includes(old.status) || ['drafted','published'].includes(b.status)) throw new HttpError(409, 'Use the schedule endpoint for draft or publication changes.');
    if (old.status === 'collecting' && b.status === 'open') throw new HttpError(409, 'An active voting cycle cannot be reopened as a new cycle.');
    await c.query('UPDATE cycles SET name=$2,deadline=$3,status=$4,revision=revision+1 WHERE id=$1', [cycleId,b.name,b.deadline,b.status]);
    const ids = b.slots.map((s) => s.id);
    await c.query('DELETE FROM meeting_slots WHERE cycle_id=$1 AND NOT (id=ANY($2::text[]))', [cycleId,ids]);
    for (const s of b.slots) {
      const existing = await c.query('SELECT cycle_id FROM meeting_slots WHERE id=$1', [s.id]);
      if (existing.rowCount && existing.rows[0].cycle_id !== cycleId) throw new HttpError(409, 'Slot belongs to another cycle.');
      await c.query('INSERT INTO meeting_slots(id,cycle_id,club_id,meeting) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET club_id=EXCLUDED.club_id,meeting=EXCLUDED.meeting', [s.id,cycleId,s.clubId,s.meeting]);
    }
    return getCycle(c,cycleId);
  });
  res.json(result);
});
router.delete('/cycles/:cycleId', async (req, res) => {
  await transaction(async (c) => {
    const cycleId = id(req.params.cycleId); const row = await one(c,'SELECT revision FROM cycles WHERE id=$1 FOR UPDATE',[cycleId],'Cycle'); stale(row.revision,expected(Number(req.get('If-Match'))));
    await c.query('DELETE FROM cycles WHERE id=$1',[cycleId]);
  });
  res.status(204).end();
});
module.exports = { router, getCycle };
