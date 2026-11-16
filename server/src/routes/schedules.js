const express = require('express');
const { HttpError, object, boolean } = require('../http');
const { id, date, list, unique, expected, transaction, one, stale } = require('./workflow-util');
const router = express.Router();
const addDays = (d,n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0,10);
const MAX_ASSIGNMENTS = 5000;
const found = (rows, key, label) => { const row = rows.get(key); if (!row) throw new HttpError(404, `${label} not found.`); return row; };
router.put('/cycles/:cycleId/schedule', async (req,res) => {
  const b = object(req.body); const cycleId = id(req.params.cycleId); const rev = expected(b.revision); const publish = boolean(b.publish,'publish');
  const assignments = list(b.assignments,'assignments',MAX_ASSIGNMENTS).map((a) => {
    object(a);
    const item = { id:id(a.id),cycleId:id(a.cycleId,'cycleId'),slotId:id(a.slotId,'slotId'),clubId:id(a.clubId,'clubId'),kitId:id(a.kitId,'kitId'),
      ready:date(a.ready,'ready'),meeting:date(a.meeting,'meeting'),due:date(a.due,'due'),locked:boolean(a.locked,'locked') };
    if (item.cycleId !== cycleId || item.ready > item.meeting || item.meeting > item.due) throw new HttpError(400,'Assignment dates or cycle are invalid.');
    return item;
  });
  unique(assignments.map((a) => a.id),'assignments'); unique(assignments.map((a) => a.slotId),'slots');
  const next = await transaction(async (c) => {
    const cycle = await one(c,'SELECT revision,status FROM cycles WHERE id=$1 FOR UPDATE',[cycleId],'Cycle'); stale(cycle.revision,rev);
    if (!['collecting','drafted','published'].includes(cycle.status)) throw new HttpError(409,'Cycle must be collecting before drafting.');
    if (publish && cycle.status === 'collecting') throw new HttpError(409,'Save a draft before publishing.');
    if (cycle.status === 'published' && !publish) throw new HttpError(409,'A published schedule cannot be reverted to a draft.');
    const settings = await one(c,'SELECT loan_days,buffer_days FROM lending_settings WHERE singleton=true',[],'Settings');
    const locked = (await c.query(`SELECT id,slot_id AS "slotId",club_id AS "clubId",kit_id AS "kitId",to_char(ready,'YYYY-MM-DD') AS ready,
      to_char(meeting,'YYYY-MM-DD') AS meeting,to_char(due,'YYYY-MM-DD') AS due FROM schedule_assignments WHERE cycle_id=$1 AND locked=true`,[cycleId])).rows;
    for (const old of locked) {
      const current = assignments.find((a) => a.id === old.id);
      if (!current || ['slotId','clubId','kitId','ready','meeting','due'].some((key) => old[key] !== current[key])) throw new HttpError(409,'Unlock the assignment before changing or removing it.');
    }
    const allOther = (await c.query(`SELECT a.id,a.cycle_id AS "cycleId",a.slot_id AS "slotId",a.club_id AS "clubId",a.kit_id AS "kitId",
      to_char(a.ready,'YYYY-MM-DD') AS ready,to_char(a.due,'YYYY-MM-DD') AS due,k.title_id AS "titleId",cy.status
      FROM schedule_assignments a JOIN kits k ON k.id=a.kit_id JOIN cycles cy ON cy.id=a.cycle_id WHERE a.cycle_id<>$1`,[cycleId])).rows;
    const slotIds = assignments.map((a) => a.slotId);
    const kitIds = [...new Set(assignments.map((a) => a.kitId))];
    const clubIds = [...new Set(assignments.map((a) => a.clubId))];
    const slotById = new Map((await c.query(`SELECT id,club_id AS "clubId",to_char(meeting,'YYYY-MM-DD') AS meeting FROM meeting_slots WHERE cycle_id=$1 AND id=ANY($2)`,[cycleId,slotIds])).rows.map((r) => [r.id,r]));
    const kitById = new Map((await c.query('SELECT id,title_id AS "titleId",status FROM kits WHERE id=ANY($1)',[kitIds])).rows.map((r) => [r.id,r]));
    const readTitles = new Set((await c.query('SELECT club_id,title_id FROM club_history WHERE club_id=ANY($1)',[clubIds])).rows.map((r) => `${r.club_id}|${r.title_id}`));
    const existingById = new Map((await c.query(`SELECT id,club_id AS "clubId",kit_id AS "kitId",to_char(ready,'YYYY-MM-DD') AS ready,to_char(meeting,'YYYY-MM-DD') AS meeting,
      to_char(due,'YYYY-MM-DD') AS due FROM schedule_assignments WHERE cycle_id=$1`,[cycleId])).rows.map((r) => [r.id,r]));
    const activeByKit = new Map((await c.query(`SELECT DISTINCT ON (a.kit_id) a.kit_id AS "kitId",a.id,to_char(a.ready,'YYYY-MM-DD') AS ready,to_char(a.due,'YYYY-MM-DD') AS due
      FROM schedule_assignments a JOIN cycles cy ON cy.id=a.cycle_id WHERE a.kit_id=ANY($1) AND cy.status='published' AND a.ready <= CURRENT_DATE ORDER BY a.kit_id,a.ready DESC`,[kitIds])).rows.map((r) => [r.kitId,r]));
    const dbToday = (await c.query("SELECT to_char(CURRENT_DATE,'YYYY-MM-DD') AS today")).rows[0].today;
    const enriched = [];
    for (const a of assignments) {
      const slot = found(slotById,a.slotId,'Slot');
      if (slot.clubId !== a.clubId || slot.meeting !== a.meeting) throw new HttpError(409,'Assignment does not match the meeting slot.');
      const kit = found(kitById,a.kitId,'Kit');
      if (['inspection','unavailable'].includes(kit.status)) throw new HttpError(409,'Kit is currently unavailable.');
      const existing = existingById.get(a.id);
      if (addDays(a.ready,settings.loan_days) !== a.due) {
        if (!existing || existing.ready !== a.ready || existing.due !== a.due) throw new HttpError(409,'New or rescheduled assignments must use the current loan length.');
      }
      if (readTitles.has(`${a.clubId}|${kit.titleId}`)) {
        const historic = existing && existing.clubId === a.clubId && existing.kitId === a.kitId && existing.meeting === a.meeting && existing.meeting < dbToday;
        if (cycle.status !== 'published' || !historic) throw new HttpError(409,'Club has already read this title.');
      }
      if (kit.status === 'out') {
        const active = activeByKit.get(a.kitId);
        const today = new Date().toISOString().slice(0,10);
        if (!active || (active.id !== a.id && (a.ready <= addDays(active.due,settings.buffer_days) || (active.due < today && a.ready <= addDays(today,settings.buffer_days))))) throw new HttpError(409,'A checked-out or overdue kit blocks this assignment.');
      }
      const candidate = { ...a, titleId: kit.titleId };
      for (const pool of [allOther,enriched]) {
        for (const other of pool) {
          if (other.cycleId === cycleId && other.clubId === a.clubId && other.titleId === kit.titleId) throw new HttpError(409,'Club already has this title in the cycle.');
          if (other.kitId === a.kitId && a.ready <= addDays(other.due,settings.buffer_days) && other.ready <= addDays(a.due,settings.buffer_days)) throw new HttpError(409,'Kit loan windows conflict, including the turnaround buffer.');
        }
      }
      enriched.push(candidate);
    }
    if (publish) {
      const slots = await c.query('SELECT count(*)::int AS count FROM meeting_slots WHERE cycle_id=$1',[cycleId]);
      if (!slots.rows[0].count || slots.rows[0].count !== assignments.length) throw new HttpError(409,'Every meeting needs an assignment before publication.');
    }
    await c.query('DELETE FROM schedule_assignments WHERE cycle_id=$1',[cycleId]);
    const column = (key) => assignments.map((a) => a[key]);
    await c.query(`INSERT INTO schedule_assignments(id,cycle_id,slot_id,club_id,kit_id,ready,meeting,due,locked)
      SELECT * FROM unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::date[],$7::date[],$8::date[],$9::boolean[])`,
      [column('id'),column('cycleId'),column('slotId'),column('clubId'),column('kitId'),column('ready'),column('meeting'),column('due'),column('locked')]);
    return (await c.query('UPDATE cycles SET status=$2,revision=revision+1 WHERE id=$1 RETURNING revision',[cycleId,publish?'published':'drafted'])).rows[0].revision;
  });
  res.json({ revision:next });
});
module.exports = router;
