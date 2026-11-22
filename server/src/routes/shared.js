const express = require('express');
const { withTransaction } = require('../db');
const { getCycle } = require('./cycles');
const { getBallot } = require('./ballots');
const { titleColumns, clubColumns, kitSelect, linksSelect } = require('./shared-selects');
const router = express.Router();
router.get('/shared', async (_req,res) => {
  const data = await withTransaction(async (c) => {
    const people = (await c.query('SELECT id,name,role,revision FROM people ORDER BY id')).rows;
    const titles = (await c.query(`SELECT ${titleColumns} FROM titles ORDER BY id`)).rows;
    const kits = (await c.query(`${kitSelect} ORDER BY k.id`)).rows;
    const kitLabels = (await c.query('SELECT id,category,name,revision FROM kit_labels ORDER BY category,lower(name),id')).rows;
    const clubs = (await c.query(`SELECT ${clubColumns} FROM clubs ORDER BY id`)).rows;
    const links = (await c.query(linksSelect)).rows;
    const memberships = (await c.query('SELECT person_id AS "personId",club_id AS "clubId",leader FROM memberships ORDER BY club_id,person_id')).rows;
    const membershipRevisions = (await c.query('SELECT club_id AS "clubId",revision FROM membership_versions ORDER BY club_id')).rows;
    const cycleIds = (await c.query('SELECT id FROM cycles ORDER BY id')).rows;
    const cycles = []; for (const row of cycleIds) cycles.push(await getCycle(c,row.id));
    const keys = (await c.query('SELECT cycle_id,club_id,person_id FROM ballots ORDER BY cycle_id,club_id,person_id')).rows;
    const ballots = []; for (const row of keys) ballots.push(await getBallot(c,row.cycle_id,row.club_id,row.person_id));
    const assignments = (await c.query(`SELECT id,cycle_id AS "cycleId",slot_id AS "slotId",club_id AS "clubId",kit_id AS "kitId",
      to_char(ready,'YYYY-MM-DD') AS ready,to_char(meeting,'YYYY-MM-DD') AS meeting,to_char(due,'YYYY-MM-DD') AS due,locked FROM schedule_assignments ORDER BY cycle_id,slot_id`)).rows;
    const library = (await c.query('SELECT name,branches,loan_days AS "loanDays",buffer_days AS "bufferDays",revision FROM lending_settings WHERE singleton=true')).rows[0];
    const events = (await c.query('SELECT id,kit_id AS "kitId",action,at,notes,returned_copies AS "returnedCopies",missing_components AS "missingComponents" FROM circulation_events ORDER BY at,id')).rows.map((e) => {
      if (e.returnedCopies === null) delete e.returnedCopies;
      if (e.missingComponents === null) delete e.missingComponents;
      return e;
    });
    const historyRows = (await c.query('SELECT club_id,title_id FROM club_history ORDER BY club_id,title_id')).rows;
    const historyMap = new Map(); for (const row of historyRows) { if (!historyMap.has(row.club_id)) historyMap.set(row.club_id,[]); historyMap.get(row.club_id).push(row.title_id); }
    const history = [...historyMap].map(([clubId,titles]) => ({ clubId,titles }));
    return { people,titles,kits,kitLabels,clubs,links,memberships,membershipRevisions,cycles,ballots,assignments,library,events,history };
  }, { readOnly: true });
  res.json(data);
});
module.exports = router;
