const express = require('express');
const { getPool } = require('../db');
const { HttpError, object } = require('../http');
const { id, list, unique, expected, transaction, one, stale } = require('./workflow-util');
const router = express.Router();
async function getBallot(c, cycleId, clubId, personId) {
  const ballot = await one(c, 'SELECT cycle_id AS "cycleId",club_id AS "clubId",person_id AS "personId",revision FROM ballots WHERE cycle_id=$1 AND club_id=$2 AND person_id=$3', [cycleId,clubId,personId], 'Ballot');
  const marks = await c.query('SELECT title_id,mark,rank FROM ballot_marks WHERE cycle_id=$1 AND club_id=$2 AND person_id=$3 ORDER BY rank NULLS LAST,title_id', [cycleId,clubId,personId]);
  ballot.marks = {}; ballot.ranking = [];
  for (const m of marks.rows) { ballot.marks[m.title_id] = m.mark; if (m.rank !== null) ballot.ranking.push(m.title_id); }
  return ballot;
}
// Preferences stay editable after a schedule is drafted or published so late-added clubs can choose titles. Schedule changes are separate.
function assertPreferencesOpen(cycle) {
  const collecting = cycle.status === 'collecting' && cycle.voting;
  if (!collecting && !['drafted', 'published'].includes(cycle.status)) throw new HttpError(409, 'Preferences cannot be changed for this cycle.');
}

router.get('/cycles/:cycleId/clubs/:clubId/ballots/:personId', async (req, res) => {
  res.json(await getBallot(getPool(),id(req.params.cycleId),id(req.params.clubId),id(req.params.personId)));
});
router.put('/cycles/:cycleId/clubs/:clubId/ballots/:personId', async (req, res) => {
  const b = object(req.body); const marks = object(b.marks); const ranking = unique(list(b.ranking,'ranking').map((x) => id(x,'titleId')),'ranking');
  const entries = Object.entries(marks);
  if (entries.length > 500) throw new HttpError(400, 'Too many marks.');
  for (const [titleId,mark] of entries) { id(titleId,'titleId'); if (!['selected','read','wont'].includes(mark)) throw new HttpError(400, 'Invalid mark.'); }
  if (ranking.length !== entries.filter(([,m]) => m === 'selected').length || ranking.some((titleId) => marks[titleId] !== 'selected')) throw new HttpError(400, 'Ranking must contain exactly the selected titles.');
  const rev = expected(b.revision,true); const cycleId = id(req.params.cycleId); const clubId = id(req.params.clubId); const personId = id(req.params.personId);
  const result = await transaction(async (c) => {
    const cycle = await one(c,"SELECT status, deadline >= CURRENT_DATE AS voting FROM cycles WHERE id=$1 FOR UPDATE",[cycleId],'Cycle');
    assertPreferencesOpen(cycle);
    if (!req.auth) await require('../auth').requireDemoMember(personId, c);
    await one(c,'SELECT 1 FROM memberships WHERE club_id=$1 AND person_id=$2',[clubId,personId],'Membership');
    const existing = await c.query('SELECT revision FROM ballots WHERE cycle_id=$1 AND club_id=$2 AND person_id=$3',[cycleId,clubId,personId]);
    stale(existing.rowCount ? existing.rows[0].revision : 0,rev);
    for (const [titleId] of entries) await one(c,'SELECT id FROM titles WHERE id=$1',[titleId],'Title');
    if (existing.rowCount) {
      await c.query('UPDATE ballots SET revision=revision+1 WHERE cycle_id=$1 AND club_id=$2 AND person_id=$3',[cycleId,clubId,personId]);
      await c.query('DELETE FROM ballot_marks WHERE cycle_id=$1 AND club_id=$2 AND person_id=$3',[cycleId,clubId,personId]);
    } else await c.query('INSERT INTO ballots(cycle_id,club_id,person_id) VALUES($1,$2,$3)',[cycleId,clubId,personId]);
    for (const [titleId,mark] of entries) await c.query('INSERT INTO ballot_marks(cycle_id,club_id,person_id,title_id,mark,rank) VALUES($1,$2,$3,$4,$5,$6)',[cycleId,clubId,personId,titleId,mark,mark === 'selected' ? ranking.indexOf(titleId)+1 : null]);
    await c.query('DELETE FROM finalized_rankings WHERE cycle_id=$1 AND club_id=$2',[cycleId,clubId]);
    await c.query('DELETE FROM finalized_groups WHERE cycle_id=$1 AND club_id=$2',[cycleId,clubId]);
    await c.query('UPDATE cycles SET revision=revision+1 WHERE id=$1',[cycleId]);
    return getBallot(c,cycleId,clubId,personId);
  });
  res.json(result);
});
router.put('/cycles/:cycleId/clubs/:clubId/ranking', async (req, res) => {
  const b = object(req.body); const ranking = unique(list(b.ranking,'ranking').map((x) => id(x,'titleId')),'ranking');
  const cycleId = id(req.params.cycleId); const clubId = id(req.params.clubId); const rev = expected(b.revision);
  const next = await transaction(async (c) => {
    const cycle = await one(c,'SELECT revision,status,deadline >= CURRENT_DATE AS voting FROM cycles WHERE id=$1 FOR UPDATE',[cycleId],'Cycle'); stale(cycle.revision,rev);
    assertPreferencesOpen(cycle);
    if (!req.auth) {
      const personId = id(b.personId, 'personId');
      await require('../auth').requireDemoMember(personId, c);
      await one(c, 'SELECT 1 FROM memberships WHERE club_id=$1 AND person_id=$2 AND leader=true', [clubId, personId], 'Club leader');
    }
    await one(c,'SELECT id FROM clubs WHERE id=$1',[clubId],'Club');
    for (const titleId of ranking) await one(c,'SELECT id FROM titles WHERE id=$1',[titleId],'Title');
    await c.query('DELETE FROM finalized_rankings WHERE cycle_id=$1 AND club_id=$2',[cycleId,clubId]);
    await c.query('INSERT INTO finalized_groups(cycle_id,club_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[cycleId,clubId]);
    for (const [index,titleId] of ranking.entries()) await c.query('INSERT INTO finalized_rankings(cycle_id,club_id,title_id,rank) VALUES($1,$2,$3,$4)',[cycleId,clubId,titleId,index+1]);
    return (await c.query('UPDATE cycles SET revision=revision+1 WHERE id=$1 RETURNING revision',[cycleId])).rows[0].revision;
  });
  res.json({ revision: next });
});
module.exports = { router, getBallot };
