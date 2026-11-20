const express = require('express');
const { createHash } = require('node:crypto');
const { HttpError, object, boolean } = require('../http');
const { id, date, list, unique, expected, transaction, one, stale } = require('./workflow-util');
const router = express.Router();
const addDays = (d,n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0,10);
const MAX_ASSIGNMENTS = 5000;
const found = (rows, key, label) => { const row = rows.get(key); if (!row) throw new HttpError(404, `${label} not found.`); return row; };

async function schedule(req, res, validateOnly) {
  const b = object(req.body); const cycleId = id(req.params.cycleId); const rev = expected(b.revision); const publish = boolean(b.publish,'publish');
  const basis = b.basis === undefined ? null : object(b.basis);
  const unlockIds = unique(list(b.unlockIds ?? [], 'unlockIds', MAX_ASSIGNMENTS).map((value) => id(value)), 'unlockIds').sort();
  const assignments = list(b.assignments,'assignments',MAX_ASSIGNMENTS).map((a) => {
    object(a);
    const item = { id:id(a.id),cycleId:id(a.cycleId,'cycleId'),slotId:id(a.slotId,'slotId'),clubId:id(a.clubId,'clubId'),kitId:id(a.kitId,'kitId'),
      ready:date(a.ready,'ready'),meeting:date(a.meeting,'meeting'),due:date(a.due,'due'),locked:boolean(a.locked,'locked') };
    if (item.cycleId !== cycleId || item.ready > item.meeting || item.meeting > item.due) throw new HttpError(400,'Assignment dates or cycle are invalid.');
    return item;
  });
  unique(assignments.map((a) => a.id),'assignments'); unique(assignments.map((a) => a.slotId),'slots');
  const newSlots = list(b.newSlots ?? [],'newSlots',MAX_ASSIGNMENTS).map((s) => {
    object(s);
    const month = s.month;
    if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpError(400,'month is invalid.');
    return { id:id(s.id), clubId:id(s.clubId,'clubId'), month };
  });
  const removedSlotIds = unique(list(b.removedSlotIds ?? [],'removedSlotIds',MAX_ASSIGNMENTS).map((value) => id(value,'removedSlotIds')),'removedSlotIds').sort();
  const datedSlots = list(b.datedSlots ?? [],'datedSlots',MAX_ASSIGNMENTS).map((s) => {
    object(s);
    return { id:id(s.id), meeting:date(s.meeting,'meeting') };
  }).sort((a,b) => a.id.localeCompare(b.id));
  unique(datedSlots.map((s) => s.id),'datedSlots');
  unique(newSlots.map((s) => s.id),'newSlots'); unique(newSlots.map((s) => `${s.clubId}\0${s.month}`),'newSlots');
  const result = await transaction(async (c) => {
    const cycle = await one(c,`SELECT revision,status,to_char(deadline,'YYYY-MM-DD') AS deadline,to_char(starts_on,'YYYY-MM') AS "startMonth",to_char(ends_on,'YYYY-MM') AS "endMonth" FROM cycles WHERE id=$1 FOR UPDATE`,[cycleId],'Cycle'); stale(cycle.revision,rev);
    if (!['collecting','drafted','published'].includes(cycle.status)) throw new HttpError(409,'Cycle must be collecting before drafting.');
    if (publish && cycle.status === 'collecting') throw new HttpError(409,'Save a draft before publishing.');
    if (cycle.status === 'published' && !publish) throw new HttpError(409,'A published schedule cannot be reverted to a draft.');
    if (cycle.status === 'published' && (newSlots.length || removedSlotIds.length || datedSlots.length)) throw new HttpError(409,'Meetings can only change before publication.');
    const settings = await one(c,'SELECT loan_days,buffer_days FROM lending_settings WHERE singleton=true',[],'Settings');
    if (basis) {
      const sortIds = (rows) => rows.sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      const currentBasis = {
        cycles:sortIds((await c.query('SELECT id,revision FROM cycles ORDER BY id FOR SHARE')).rows),
        kits:sortIds((await c.query('SELECT id,revision FROM kits ORDER BY id FOR SHARE')).rows),
        clubs:sortIds((await c.query('SELECT id,revision FROM clubs ORDER BY id FOR SHARE')).rows),
        settings:(await c.query('SELECT revision FROM lending_settings WHERE singleton=true')).rows[0].revision,
      };
      const submittedBasis = { cycles:basis.cycles, kits:basis.kits, clubs:basis.clubs, settings:basis.settings };
      if (JSON.stringify(submittedBasis) !== JSON.stringify(currentBasis)) throw new HttpError(409,'Shared schedule inputs changed. Refresh and start the local schedule again.');
    }
    const locked = (await c.query(`SELECT id,slot_id AS "slotId",club_id AS "clubId",kit_id AS "kitId",to_char(ready,'YYYY-MM-DD') AS ready,
      to_char(meeting,'YYYY-MM-DD') AS meeting,to_char(due,'YYYY-MM-DD') AS due FROM schedule_assignments WHERE cycle_id=$1 AND locked=true ORDER BY id`,[cycleId])).rows;
    if (unlockIds.some((value) => !locked.some((item) => item.id === value))) throw new HttpError(409,'An assignment to unlock is no longer locked. Refresh and retry.');
    for (const old of locked) {
      const current = assignments.find((a) => a.id === old.id);
      if ((!current || ['slotId','clubId','kitId','ready','meeting','due'].some((key) => old[key] !== current[key])) && !unlockIds.includes(old.id)) {
        throw new HttpError(409,'Unlock the assignment before changing or removing it.');
      }
    }
    const allOther = (await c.query(`SELECT a.id,a.cycle_id AS "cycleId",a.slot_id AS "slotId",a.club_id AS "clubId",a.kit_id AS "kitId",
      to_char(a.ready,'YYYY-MM-DD') AS ready,to_char(a.due,'YYYY-MM-DD') AS due,k.title_id AS "titleId",cy.status
      FROM schedule_assignments a JOIN kits k ON k.id=a.kit_id JOIN cycles cy ON cy.id=a.cycle_id WHERE a.cycle_id<>$1 ORDER BY a.id`,[cycleId])).rows;
    const kitIds = [...new Set(assignments.map((a) => a.kitId))];
    const clubIds = [...new Set(assignments.map((a) => a.clubId))];
    const cycleSlots = (await c.query(`SELECT id,club_id AS "clubId",month,to_char(meeting,'YYYY-MM-DD') AS meeting FROM meeting_slots WHERE cycle_id=$1 ORDER BY id`,[cycleId])).rows;
    const kits = (await c.query('SELECT id,title_id AS "titleId",status FROM kits WHERE id=ANY($1) ORDER BY id FOR SHARE',[kitIds])).rows;
    const history = (await c.query('SELECT club_id,title_id FROM club_history WHERE club_id=ANY($1) ORDER BY club_id,title_id',[clubIds])).rows;
    const existing = (await c.query(`SELECT id,slot_id AS "slotId",club_id AS "clubId",kit_id AS "kitId",to_char(ready,'YYYY-MM-DD') AS ready,to_char(meeting,'YYYY-MM-DD') AS meeting,
      to_char(due,'YYYY-MM-DD') AS due FROM schedule_assignments WHERE cycle_id=$1 ORDER BY id`,[cycleId])).rows;
    const active = (await c.query(`SELECT DISTINCT ON (a.kit_id) a.kit_id AS "kitId",a.id,to_char(a.ready,'YYYY-MM-DD') AS ready,to_char(a.due,'YYYY-MM-DD') AS due
      FROM schedule_assignments a JOIN cycles cy ON cy.id=a.cycle_id WHERE a.kit_id=ANY($1) AND cy.status='published' AND a.ready <= CURRENT_DATE ORDER BY a.kit_id,a.ready DESC,a.id`,[kitIds])).rows;
    const dbToday = (await c.query("SELECT to_char(CURRENT_DATE,'YYYY-MM-DD') AS today")).rows[0].today;
    const kitById = new Map(kits.map((r) => [r.id,r]));
    const readTitles = new Set(history.map((r) => `${r.club_id}|${r.title_id}`));
    const existingById = new Map(existing.map((r) => [r.id,r]));
    const cycleSlotIds = new Set(cycleSlots.map((s) => s.id));
    const removedSet = new Set(removedSlotIds);
    for (const slotId of removedSlotIds) {
      if (!cycleSlotIds.has(slotId)) throw new HttpError(409,'A meeting to remove is no longer available. Refresh and retry.');
      if (assignments.some((a) => a.slotId === slotId)) throw new HttpError(409,'Clear the assignment before removing its meeting.');
    }
    const kept = cycleSlots.filter((s) => !removedSet.has(s.id));
    for (const s of newSlots) {
      if (cycleSlotIds.has(s.id)) throw new HttpError(409,'A new meeting reuses an existing id. Refresh and retry.');
      if (s.month < cycle.startMonth || s.month > cycle.endMonth) throw new HttpError(400,'The month must fall within the cycle range.');
      if (kept.some((k) => k.clubId === s.clubId && k.month === s.month)) throw new HttpError(409,'This club already has a meeting in that month.');
    }
    const slots = [...kept, ...newSlots.map((s) => ({ id:s.id, clubId:s.clubId, month:s.month, meeting:null }))];
    const slotById = new Map(slots.map((r) => [r.id,r]));
    for (const change of datedSlots) {
      const slot = found(slotById,change.id,'Slot');
      if (slot.meeting || change.meeting.slice(0,7) !== slot.month || change.meeting <= cycle.deadline) {
        throw new HttpError(409,'A date can only be set on an undated meeting in its month and after the voting deadline.');
      }
      slot.meeting = change.meeting;
    }
    const activeByKit = new Map(active.map((r) => [r.kitId,r]));
    const enriched = [];
    const dateless = [];
    const warnings = [];
    const warn = (a, message) => warnings.push({ slotId:a.slotId, message });
    for (const a of assignments) {
      const slot = found(slotById,a.slotId,'Slot');
      if (slot.clubId !== a.clubId) throw new HttpError(409,'Assignment does not match the meeting slot.');
      if (slot.meeting) {
        if (slot.meeting !== a.meeting) throw new HttpError(409,'Assignment does not match the meeting slot.');
      } else {
        if (a.meeting.slice(0,7) !== slot.month || a.meeting <= cycle.deadline) throw new HttpError(409,'Assignment meeting must fall in the slot month and after the voting deadline.');
        dateless.push({ slotId:a.slotId, meeting:a.meeting });
      }
      const kit = found(kitById,a.kitId,'Kit');
      if (['inspection','unavailable'].includes(kit.status)) warn(a,`Kit ${a.kitId} is currently unavailable.`);
      const previous = existingById.get(a.id);
      if (addDays(a.ready,settings.loan_days) !== a.due) {
        if (!previous || previous.ready !== a.ready || previous.due !== a.due) throw new HttpError(409,'New or rescheduled assignments must use the current loan length.');
      }
      if (readTitles.has(`${a.clubId}|${kit.titleId}`)) {
        const historic = previous && previous.clubId === a.clubId && previous.kitId === a.kitId && previous.meeting === a.meeting && previous.meeting < dbToday;
        if (cycle.status !== 'published' || !historic) warn(a,`Club ${a.clubId} has already read title ${kit.titleId}.`);
      }
      if (kit.status === 'out') {
        const current = activeByKit.get(a.kitId);
        if (!current || (current.id !== a.id && (a.ready <= addDays(current.due,settings.buffer_days) || (current.due < dbToday && a.ready <= addDays(dbToday,settings.buffer_days))))) {
          warn(a,`Checked-out or overdue kit ${a.kitId} blocks this assignment.`);
        }
      }
      const candidate = { ...a, titleId: kit.titleId };
      for (const other of [...allOther,...enriched]) {
        if (other.cycleId === cycleId && other.clubId === a.clubId && other.titleId === kit.titleId) warn(a,`Club ${a.clubId} already has title ${kit.titleId} in slot ${other.slotId}.`);
        if (other.kitId === a.kitId && a.ready <= addDays(other.due,settings.buffer_days) && other.ready <= addDays(a.due,settings.buffer_days)) {
          warn(a,`Kit ${a.kitId} overlaps slot ${other.slotId} in cycle ${other.cycleId}, including the turnaround buffer.`);
        }
      }
      enriched.push(candidate);
    }
    if (publish) {
      if (!slots.length || slots.length !== assignments.length) throw new HttpError(409,'Every meeting needs an assignment before publication.');
    }
    const token = createHash('sha256').update(JSON.stringify({ cycleId,cycle,settings,assignments,unlockIds,publish,basis,slots,newSlots,removedSlotIds,datedSlots,kits,history,existing,locked,active,allOther,dbToday,warnings })).digest('hex');
    if (validateOnly) return { warnings, token };
    if (b.validationToken === undefined) {
      if (unlockIds.length) throw new HttpError(409,'Validate and confirm unlocked assignments before saving.');
      if (warnings.length) throw new HttpError(409,warnings[0].message);
    } else if (typeof b.validationToken !== 'string' || b.validationToken !== token || (warnings.length && b.acknowledge !== true)) {
      throw new HttpError(409,'Schedule validation changed or warnings were not acknowledged. Review and validate again.');
    }
    await c.query('DELETE FROM schedule_assignments WHERE cycle_id=$1',[cycleId]);
    if (removedSlotIds.length) await c.query('DELETE FROM meeting_slots WHERE cycle_id=$1 AND id=ANY($2)',[cycleId,removedSlotIds]);
    for (const s of newSlots) await c.query('INSERT INTO meeting_slots(id,cycle_id,club_id,month,meeting) VALUES($1,$2,$3,$4,NULL)',[s.id,cycleId,s.clubId,s.month]);
    for (const d of datedSlots) await c.query('UPDATE meeting_slots SET meeting=$3 WHERE cycle_id=$1 AND id=$2',[cycleId,d.id,d.meeting]);
    for (const d of dateless) await c.query('UPDATE meeting_slots SET meeting=$3 WHERE cycle_id=$1 AND id=$2',[cycleId,d.slotId,d.meeting]);
    const column = (key) => assignments.map((a) => a[key]);
    await c.query(`INSERT INTO schedule_assignments(id,cycle_id,slot_id,club_id,kit_id,ready,meeting,due,locked)
      SELECT * FROM unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::date[],$7::date[],$8::date[],$9::boolean[])`,
      [column('id'),column('cycleId'),column('slotId'),column('clubId'),column('kitId'),column('ready'),column('meeting'),column('due'),column('locked')]);
    return { revision:(await c.query('UPDATE cycles SET status=$2,revision=revision+1 WHERE id=$1 RETURNING revision',[cycleId,publish?'published':'drafted'])).rows[0].revision };
  });
  res.json(result);
}
router.post('/cycles/:cycleId/schedule/validate', (req,res) => schedule(req,res,true));
router.put('/cycles/:cycleId/schedule', (req,res) => schedule(req,res,false));
module.exports = router;
