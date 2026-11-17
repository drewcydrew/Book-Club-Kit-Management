const express = require('express');
const { getPool } = require('../db');
const { HttpError, object, text, integer } = require('../http');
const { id, list, unique, expected, transaction, one, stale } = require('./workflow-util');
const router = express.Router();
const selection = 'name,branches,loan_days AS "loanDays",buffer_days AS "bufferDays",revision';
router.get('/settings', async (_req,res) => res.json(await one(getPool(),`SELECT ${selection} FROM lending_settings WHERE singleton=true`,[],'Settings')));
router.put('/settings', async (req,res) => {
  const b = object(req.body); const name = text(b.name,'name',true,200); const branches = unique(list(b.branches,'branches',100).map((x) => text(x,'branch',true,200)),'branches');
  const loan = integer(b.loanDays,'loanDays',1); const buffer = integer(b.bufferDays,'bufferDays',0); const rev = expected(b.revision);
  if (loan > 3650 || buffer > 3650) throw new HttpError(400,'Loan and buffer lengths must not exceed 3650 days.');
  const result = await transaction(async (c) => {
    const old = await one(c,'SELECT revision FROM lending_settings WHERE singleton=true FOR UPDATE',[],'Settings'); stale(old.revision,rev);
    if ((await c.query(`SELECT 1 FROM schedule_assignments a JOIN schedule_assignments b ON a.kit_id=b.kit_id AND a.id<b.id
      WHERE a.ready <= b.due + $1::int AND b.ready <= a.due + $1::int LIMIT 1`,[buffer])).rowCount) throw new HttpError(409,'The new turnaround buffer conflicts with existing assignments. Discard the schedules of the affected cycles on Cycles, then try again.');
    return (await c.query(`UPDATE lending_settings SET name=$1,branches=$2,loan_days=$3,buffer_days=$4,revision=revision+1 WHERE singleton=true RETURNING ${selection}`,[name,branches,loan,buffer])).rows[0];
  });
  res.json(result);
});
router.put('/clubs/:clubId/history', async (req,res) => {
  const b = object(req.body); const clubId = id(req.params.clubId); const rev = expected(b.revision);
  const titles = unique(list(b.titles,'titles').map((x) => id(x,'titleId')),'titles');
  const next = await transaction(async (c) => {
    const club = await one(c,'SELECT revision FROM clubs WHERE id=$1 FOR UPDATE',[clubId],'Club'); stale(club.revision,rev);
    for (const titleId of titles) await one(c,'SELECT id FROM titles WHERE id=$1',[titleId],'Title');
    if ((await c.query(`SELECT 1 FROM schedule_assignments a JOIN kits k ON k.id=a.kit_id JOIN cycles cy ON cy.id=a.cycle_id
      WHERE a.club_id=$1 AND k.title_id=ANY($2::text[]) AND (cy.status<>'published' OR a.meeting>=CURRENT_DATE) LIMIT 1`,[clubId,titles])).rowCount) throw new HttpError(409,'History conflicts with an upcoming or draft schedule.');
    await c.query('DELETE FROM club_history WHERE club_id=$1',[clubId]);
    for (const titleId of titles) await c.query('INSERT INTO club_history(club_id,title_id) VALUES($1,$2)',[clubId,titleId]);
    return (await c.query('UPDATE clubs SET revision=revision+1 WHERE id=$1 RETURNING revision',[clubId])).rows[0].revision;
  });
  res.json({ revision:next });
});
module.exports = router;
