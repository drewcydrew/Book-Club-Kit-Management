const express = require('express');
const { withTransaction } = require('../db');
const { HttpError } = require('../http');
const { id, one } = require('./workflow-util');
const { titleColumns, clubColumns, kitSelect, linksSelect } = require('./shared-selects');

const router = express.Router();
const views = new Set(['home', 'preferences', 'schedule', 'catalog', 'clubs', 'cycles', 'circulation', 'admin']);
const memberViews = new Set(['home', 'preferences', 'schedule']);

async function loadBallots(c, condition, params) {
  const ballots = (await c.query(`SELECT b.cycle_id AS "cycleId",b.club_id AS "clubId",b.person_id AS "personId",b.revision
    FROM ballots b${condition} ORDER BY b.cycle_id,b.club_id,b.person_id`, params)).rows;
  const marks = (await c.query(`SELECT b.cycle_id AS "cycleId",b.club_id AS "clubId",b.person_id AS "personId",m.title_id,m.mark,m.rank
    FROM ballots b JOIN ballot_marks m ON m.cycle_id=b.cycle_id AND m.club_id=b.club_id AND m.person_id=b.person_id${condition}
    ORDER BY b.cycle_id,b.club_id,b.person_id,m.rank NULLS LAST,m.title_id`, params)).rows;
  const key = (b) => JSON.stringify([b.cycleId, b.clubId, b.personId]);
  const byKey = new Map(ballots.map((ballot) => [key(ballot), { ...ballot, marks: {}, ranking: [] }]));
  for (const mark of marks) {
    const ballot = byKey.get(key(mark));
    ballot.marks[mark.title_id] = mark.mark;
    if (mark.rank !== null) ballot.ranking.push(mark.title_id);
  }
  return [...byKey.values()];
}

async function loadView(c, personId, view) {
  const person = await one(c, 'SELECT id,name,role,revision FROM people WHERE id=$1', [personId], 'User');
  const member = person.role === 'member';
  if (!views.has(view)) throw new HttpError(400, 'View is invalid.');
  if (member && !memberViews.has(view)) {
    throw new HttpError(409, 'View is unavailable for this user. Refresh the user list.');
  }
  const memberClubs = member
    ? (await c.query('SELECT club_id FROM memberships WHERE person_id=$1 ORDER BY club_id', [personId])).rows.map((row) => row.club_id)
    : [];
  const scopeClubs = member;
  const clubsWhere = scopeClubs ? ' WHERE id=ANY($1::text[])' : '';
  const clubParams = scopeClubs ? [memberClubs] : [];
  const needsClubs = member || ['clubs', 'cycles', 'preferences', 'schedule'].includes(view);
  const needsMemberships = member || ['clubs', 'cycles', 'preferences', 'schedule'].includes(view);
  const needsCycles = ['cycles', 'preferences', 'schedule', 'circulation'].includes(view);
  const needsBallots = ['cycles', 'preferences', 'schedule'].includes(view) && (!member || view === 'preferences');
  const needsAssignments = ['catalog', 'cycles', 'preferences', 'schedule', 'circulation'].includes(view) && (!member || view === 'schedule');
  const needsCatalog = ['catalog', 'clubs', 'cycles', 'preferences', 'schedule', 'circulation'].includes(view);
  const needsHistory = ['clubs', 'cycles', 'preferences', 'schedule'].includes(view) && (!member || view === 'preferences');
  const data = {
    people: [person], memberships: [], membershipRevisions: [], cycles: [], ballots: [], assignments: [],
    library: await one(c, 'SELECT name,branches,loan_days AS "loanDays",buffer_days AS "bufferDays",revision FROM lending_settings WHERE singleton=true', [], 'Settings'),
    events: [], history: [], titles: [], kits: [], kitLabels: [], clubs: [], links: [],
  };
  if (needsClubs) {
    data.clubs = (await c.query(`SELECT ${clubColumns} FROM clubs${clubsWhere} ORDER BY id`, clubParams)).rows;
    data.membershipRevisions = (await c.query(
      `SELECT club_id AS "clubId",revision FROM membership_versions${scopeClubs ? ' WHERE club_id=ANY($1::text[])' : ''} ORDER BY club_id`, clubParams)).rows;
  }
  if (needsMemberships) {
    data.memberships = (await c.query(
      `SELECT person_id AS "personId",club_id AS "clubId",leader FROM memberships${member ? ' WHERE person_id=$1' : ''} ORDER BY club_id,person_id`,
      member ? [personId] : [])).rows;
  }
  if (needsCycles) {
    const cycleFilter = member && view === 'schedule' ? " WHERE status IN ('drafted','published')" : '';
    data.cycles = (await c.query(`SELECT id,name,to_char(deadline,'YYYY-MM-DD') AS deadline,
      to_char(starts_on,'YYYY-MM-DD') AS "startsOn",to_char(ends_on,'YYYY-MM-DD') AS "endsOn",status,revision
      FROM cycles${cycleFilter} ORDER BY id`)).rows.map((cycle) => ({ ...cycle, slots: [], finalized: {} }));
    const cycleIds = data.cycles.map((cycle) => cycle.id);
    const cycles = new Map(data.cycles.map((cycle) => [cycle.id, cycle]));
    const clubCondition = member ? ' AND club_id=ANY($2::text[])' : '';
    const params = member ? [cycleIds, memberClubs] : [cycleIds];
    const slots = (await c.query(`SELECT cycle_id,id,club_id AS "clubId",month,to_char(meeting,'YYYY-MM-DD') AS meeting
      FROM meeting_slots WHERE cycle_id=ANY($1::text[])${clubCondition} ORDER BY month,club_id,id`, params)).rows;
    for (const { cycle_id, ...slot } of slots) cycles.get(cycle_id).slots.push(slot);
    if (view !== 'circulation' && !(member && view === 'schedule')) {
      const groups = (await c.query(`SELECT cycle_id,club_id FROM finalized_groups WHERE cycle_id=ANY($1::text[])${clubCondition}`, params)).rows;
      for (const row of groups) cycles.get(row.cycle_id).finalized[row.club_id] = [];
      const rankings = (await c.query(`SELECT cycle_id,club_id,title_id FROM finalized_rankings
        WHERE cycle_id=ANY($1::text[])${clubCondition} ORDER BY club_id,rank`, params)).rows;
      for (const row of rankings) cycles.get(row.cycle_id).finalized[row.club_id].push(row.title_id);
    }
  }
  if (needsBallots) {
    const condition = member ? ' WHERE b.club_id=ANY($1::text[]) AND b.person_id=$2' : '';
    const params = member ? [memberClubs, personId] : [];
    data.ballots = await loadBallots(c, condition, params);
  }
  if (needsAssignments) {
    const where = member ? " WHERE club_id=ANY($1::text[]) AND cycle_id IN (SELECT id FROM cycles WHERE status IN ('drafted','published'))" : '';
    data.assignments = (await c.query(`SELECT id,cycle_id AS "cycleId",slot_id AS "slotId",club_id AS "clubId",kit_id AS "kitId",
      to_char(ready,'YYYY-MM-DD') AS ready,to_char(meeting,'YYYY-MM-DD') AS meeting,to_char(due,'YYYY-MM-DD') AS due,locked
      FROM schedule_assignments${where} ORDER BY cycle_id,slot_id`, member ? [memberClubs] : [])).rows;
  }
  if (needsCatalog) {
    const assignedKits = member && view === 'schedule' ? data.assignments.map((item) => item.kitId) : null;
    const kitWhere = assignedKits ? ' WHERE k.id=ANY($1::text[])' : '';
    data.kits = (await c.query(`${kitSelect}${kitWhere} ORDER BY k.id`, assignedKits ? [assignedKits] : [])).rows;
    const titleIds = assignedKits ? data.kits.map((kit) => kit.titleId) : null;
    data.titles = (await c.query(`SELECT ${titleColumns} FROM titles${titleIds ? ' WHERE id=ANY($1::text[])' : ''} ORDER BY id`, titleIds ? [titleIds] : [])).rows;
    if (view === 'catalog' || (member && view === 'preferences')) {
      data.kitLabels = (await c.query('SELECT id,category,name,revision FROM kit_labels ORDER BY category,lower(name),id')).rows;
    } else if (member && view === 'schedule') {
      data.kitLabels = (await c.query(`SELECT id,category,name,revision FROM kit_labels
        WHERE id IN (SELECT label_id FROM title_label_assignments WHERE title_id=ANY($1::text[]))
        ORDER BY category,lower(name),id`, [titleIds])).rows;
    }
  }
  if (needsHistory) {
    const rows = (await c.query(`SELECT club_id,title_id FROM club_history${member ? ' WHERE club_id=ANY($1::text[])' : ''} ORDER BY club_id,title_id`, member ? [memberClubs] : [])).rows;
    const history = new Map();
    for (const row of rows) {
      if (!history.has(row.club_id)) history.set(row.club_id, []);
      history.get(row.club_id).push(row.title_id);
    }
    data.history = [...history].map(([clubId, titles]) => ({ clubId, titles }));
  }
  if (view === 'clubs') data.links = (await c.query(linksSelect)).rows;
  if (view === 'circulation') {
    data.events = (await c.query(`SELECT id,kit_id AS "kitId",action,at,notes,returned_copies AS "returnedCopies",
      missing_components AS "missingComponents" FROM circulation_events ORDER BY at,id`)).rows.map((event) => {
      if (event.returnedCopies === null) delete event.returnedCopies;
      if (event.missingComponents === null) delete event.missingComponents;
      return event;
    });
  }
  return data;
}

router.get('/users/:personId/views/:view', async (req, res) => {
  const personId = id(req.params.personId, 'personId');
  const data = await withTransaction(async (c) => {
    if (!req.auth) await require('../auth').requireDemoMember(personId, c);
    return loadView(c, personId, req.params.view);
  }, { readOnly: true });
  res.json(data);
});

router.get('/users/:personId/enrolment', async (req, res) => {
  const personId = id(req.params.personId, 'personId');
  const clubs = await withTransaction(async (c) => {
    const person = await one(c, 'SELECT role FROM people WHERE id=$1', [personId], 'User');
    if (person.role !== 'member') throw new HttpError(409, 'Enrolment is unavailable for this user. Refresh the user list.');
    return (await c.query(`SELECT c.id,c.name,COALESCE(v.revision,0) AS revision,
      EXISTS (SELECT 1 FROM memberships m WHERE m.club_id=c.id AND m.person_id=$1) AS enrolled
      FROM clubs c LEFT JOIN membership_versions v ON v.club_id=c.id ORDER BY c.id`, [personId])).rows;
  }, { readOnly: true });
  res.json(clubs);
});

router.get('/users/:personId/clubs/:clubId/cycles/:cycleId/review', async (req, res) => {
  const personId = id(req.params.personId, 'personId');
  const clubId = id(req.params.clubId, 'clubId');
  const cycleId = id(req.params.cycleId, 'cycleId');
  const ballots = await withTransaction(async (c) => {
    if (!req.auth) await require('../auth').requireDemoMember(personId, c);
    await one(c, 'SELECT 1 FROM memberships WHERE person_id=$1 AND club_id=$2 AND leader=true', [personId, clubId], 'Club leader');
    await one(c, 'SELECT id FROM cycles WHERE id=$1', [cycleId], 'Cycle');
    return loadBallots(c, ' WHERE b.club_id=$1 AND b.cycle_id=$2', [clubId, cycleId]);
  }, { readOnly: true });
  res.json(ballots);
});

router.get('/club-schedules', async (_req, res) => {
  const clubs = await withTransaction(async (c) =>
    (await c.query('SELECT id,name,branch FROM clubs ORDER BY name,id')).rows, { readOnly: true });
  res.json(clubs);
});

router.get('/club-schedules/:clubId', async (req, res) => {
  const clubId = id(req.params.clubId, 'clubId');
  const data = await withTransaction(async (c) => {
    const club = await one(c, `SELECT ${clubColumns} FROM clubs WHERE id=$1`, [clubId], 'Club');
    const allCycles = (await c.query(`SELECT id,name,to_char(deadline,'YYYY-MM-DD') AS deadline,
      to_char(starts_on,'YYYY-MM-DD') AS "startsOn",to_char(ends_on,'YYYY-MM-DD') AS "endsOn",status,revision
      FROM cycles WHERE status IN ('drafted','published') ORDER BY id`)).rows.map((cycle) => ({ ...cycle, slots: [], finalized: {} }));
    const cycleById = new Map(allCycles.map((cycle) => [cycle.id, cycle]));
    const slots = (await c.query(`SELECT cycle_id,id,club_id AS "clubId",month,to_char(meeting,'YYYY-MM-DD') AS meeting
      FROM meeting_slots WHERE club_id=$1 AND cycle_id=ANY($2::text[]) ORDER BY month,id`, [clubId, [...cycleById.keys()]])).rows;
    for (const { cycle_id, ...slot } of slots) cycleById.get(cycle_id).slots.push(slot);
    const cycles = allCycles.filter((cycle) => cycle.slots.length > 0);
    const assignments = (await c.query(`SELECT id,cycle_id AS "cycleId",slot_id AS "slotId",club_id AS "clubId",kit_id AS "kitId",
      to_char(ready,'YYYY-MM-DD') AS ready,to_char(meeting,'YYYY-MM-DD') AS meeting,to_char(due,'YYYY-MM-DD') AS due,locked
      FROM schedule_assignments WHERE club_id=$1 AND cycle_id=ANY($2::text[]) ORDER BY cycle_id,slot_id`, [clubId, [...cycleById.keys()]])).rows;
    const kitIds = [...new Set(assignments.map((assignment) => assignment.kitId))];
    const kits = (await c.query(`${kitSelect} WHERE k.id=ANY($1::text[]) ORDER BY k.id`, [kitIds])).rows;
    const titleIds = [...new Set(kits.map((kit) => kit.titleId))];
    const titles = (await c.query(`SELECT ${titleColumns} FROM titles WHERE id=ANY($1::text[]) ORDER BY id`, [titleIds])).rows;
    const kitLabels = (await c.query(`SELECT id,category,name,revision FROM kit_labels
      WHERE id IN (SELECT label_id FROM title_label_assignments WHERE title_id=ANY($1::text[]))
      ORDER BY category,lower(name),id`, [titleIds])).rows;
    return { club, cycles, assignments, kits, titles, kitLabels };
  }, { readOnly: true });
  res.json(data);
});

module.exports = router;
