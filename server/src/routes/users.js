const express = require('express');
const { randomUUID } = require('node:crypto');
const { getPool } = require('../db');
const { HttpError, object, text, boolean } = require('../http');
const { id, list, unique, expected, transaction, one, stale } = require('./workflow-util');
const { requireDemoMember } = require('../auth');
const router = express.Router();
const person = 'id,name,role,revision';
function validate(body) {
  const b = object(body);
  const role = text(b.role, 'role', true, 20);
  if (!['admin', 'staff', 'member'].includes(role)) throw new HttpError(400, 'role is invalid.');
  return [text(b.name, 'name', true, 200), role];
}
async function protectLastAdmin(c, currentRole) {
  if (currentRole !== 'admin') return;
  const result = await c.query("SELECT count(*)::int AS count FROM people WHERE role='admin'");
  if (result.rows[0].count <= 1) throw new HttpError(409, 'Cannot remove or demote the last administrator.');
}
async function protectUserReferences(c, personId) {
  if ((await c.query('SELECT 1 FROM ballots WHERE person_id=$1 LIMIT 1', [personId])).rowCount) {
    throw new HttpError(409, 'Cannot delete user: saved preferences (ballots) exist for this user.');
  }
  if ((await c.query('SELECT 1 FROM memberships WHERE person_id=$1 LIMIT 1', [personId])).rowCount) {
    throw new HttpError(409, 'Cannot delete user: remove their club memberships first.');
  }
}
async function protectMembershipBallots(c, clubId, retainedPersonIds) {
  const result = await c.query('SELECT 1 FROM ballots WHERE club_id=$1 AND NOT (person_id=ANY($2::text[])) LIMIT 1', [clubId, retainedPersonIds]);
  if (result.rowCount) throw new HttpError(409, 'Cannot remove membership: saved preferences (ballots) exist for this member and club.');
}
router.get('/users', async (req, res) => res.json((await getPool().query(`SELECT ${person},
  EXISTS (SELECT 1 FROM firebase_identities f WHERE f.person_id=people.id) AS "firebaseManaged"
  FROM people ${req.auth ? '' : "WHERE role='member'"} ORDER BY id`)).rows));
router.get('/users/:id', async (req, res) => res.json(await one(getPool(), `SELECT ${person} FROM people WHERE id=$1`, [id(req.params.id)], 'User')));
router.post('/users', async (req, res) => {
  const b = object(req.body); const [name, role] = validate(b); const userId = b.id === undefined ? randomUUID() : id(b.id);
  const result = await getPool().query(`INSERT INTO people(id,name,role) VALUES($1,$2,$3) RETURNING ${person}`, [userId, name, role]);
  res.status(201).json(result.rows[0]);
});
router.put('/users/:id', async (req, res) => {
  const [name, role] = validate(req.body); const rev = expected(req.body.revision); const userId = id(req.params.id);
  const user = await transaction(async (c) => {
    const row = await one(c, 'SELECT revision,role FROM people WHERE id=$1 FOR UPDATE', [userId], 'User'); stale(row.revision, rev);
    if ((await c.query('SELECT 1 FROM firebase_identities WHERE person_id=$1', [userId])).rowCount) throw new HttpError(409, 'Firebase accounts are managed in Firebase.');
    if (role !== 'admin') await protectLastAdmin(c, row.role);
    return (await c.query(`UPDATE people SET name=$2,role=$3,revision=revision+1 WHERE id=$1 RETURNING ${person}`, [userId, name, role])).rows[0];
  });
  res.json(user);
});
router.delete('/users/:id', async (req, res) => {
  const rev = expected(Number(req.get('If-Match')));
  await transaction(async (c) => {
    const row = await one(c, 'SELECT revision,role FROM people WHERE id=$1 FOR UPDATE', [id(req.params.id)], 'User'); stale(row.revision, rev);
    if ((await c.query('SELECT 1 FROM firebase_identities WHERE person_id=$1', [req.params.id])).rowCount) throw new HttpError(409, 'Firebase accounts are managed in Firebase.');
    await protectLastAdmin(c, row.role);
    await protectUserReferences(c, req.params.id);
    await c.query('DELETE FROM people WHERE id=$1', [req.params.id]);
  });
  res.status(204).end();
});
router.put('/clubs/:clubId/memberships', async (req, res) => {
  const b = object(req.body); const rev = expected(b.revision, true);
  const members = list(b.members, 'members').map((m) => { object(m); return { personId: id(m.personId, 'personId'), leader: boolean(m.leader, 'leader') }; });
  unique(members.map((m) => m.personId), 'members');
  if (members.filter((m) => m.leader).length > 1) throw new HttpError(400, 'A club may have at most one leader.');
  const newRev = await transaction(async (c) => {
    await one(c, 'SELECT id FROM clubs WHERE id=$1', [id(req.params.clubId)], 'Club');
    const version = await c.query('SELECT revision FROM membership_versions WHERE club_id=$1', [req.params.clubId]);
    stale(version.rowCount ? version.rows[0].revision : 0, rev);
    for (const m of members) await one(c, 'SELECT id FROM people WHERE id=$1', [m.personId], 'User');
    await protectMembershipBallots(c, req.params.clubId, members.map((m) => m.personId));
    await c.query('UPDATE memberships SET leader=false WHERE club_id=$1', [req.params.clubId]);
    await c.query('DELETE FROM memberships WHERE club_id=$1 AND NOT (person_id=ANY($2::text[]))', [req.params.clubId, members.map((m) => m.personId)]);
    for (const m of members) await c.query('INSERT INTO memberships(club_id,person_id,leader) VALUES($1,$2,$3) ON CONFLICT(club_id,person_id) DO UPDATE SET leader=EXCLUDED.leader', [req.params.clubId, m.personId, m.leader]);
    const r = await c.query('INSERT INTO membership_versions(club_id,revision) VALUES($1,1) ON CONFLICT(club_id) DO UPDATE SET revision=membership_versions.revision+1 RETURNING revision', [req.params.clubId]);
    return r.rows[0].revision;
  });
  res.json({ revision: newRev });
});
async function clubVersion(c, clubId, rev) {
  await one(c,'SELECT id FROM clubs WHERE id=$1',[clubId],'Club');
  const version = await c.query('SELECT revision FROM membership_versions WHERE club_id=$1',[clubId]);
  stale(version.rowCount ? version.rows[0].revision : 0,rev);
}
async function incrementClubVersion(c, clubId) {
  return (await c.query('INSERT INTO membership_versions(club_id,revision) VALUES($1,1) ON CONFLICT(club_id) DO UPDATE SET revision=membership_versions.revision+1 RETURNING revision',[clubId])).rows[0].revision;
}
router.put('/clubs/:clubId/memberships/:personId', async (req,res) => {
  const b = object(req.body); const rev = expected(b.revision,true); const clubId = id(req.params.clubId); const personId = id(req.params.personId);
  const next = await transaction(async (c) => {
    await clubVersion(c,clubId,rev); await one(c,'SELECT id FROM people WHERE id=$1',[personId],'User');
    await c.query('INSERT INTO memberships(club_id,person_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[clubId,personId]);
    return incrementClubVersion(c,clubId);
  });
  res.json({revision:next});
});
router.delete('/clubs/:clubId/memberships/:personId', async (req,res) => {
  const rev = expected(Number(req.get('If-Match')),true); const clubId = id(req.params.clubId); const personId = id(req.params.personId);
  const next = await transaction(async (c) => {
    await clubVersion(c,clubId,rev);
    await one(c,'SELECT person_id FROM memberships WHERE club_id=$1 AND person_id=$2',[clubId,personId],'Membership');
    if ((await c.query('SELECT 1 FROM ballots WHERE club_id=$1 AND person_id=$2 LIMIT 1', [clubId,personId])).rowCount) {
      throw new HttpError(409, 'Cannot remove membership: saved preferences (ballots) exist for this member and club.');
    }
    await c.query('DELETE FROM memberships WHERE club_id=$1 AND person_id=$2',[clubId,personId]);
    return incrementClubVersion(c,clubId);
  });
  res.json({revision:next});
});
async function memberRole(c, personId) {
  const row = await one(c, 'SELECT role FROM people WHERE id=$1', [personId], 'User');
  if (row.role !== 'member') throw new HttpError(409, 'Only standard members can enrol in clubs.');
}
router.put('/users/:id/clubs/:clubId', async (req, res) => {
  const b = object(req.body); const rev = expected(b.revision, true); const personId = id(req.params.id); const clubId = id(req.params.clubId);
  const next = await transaction(async (c) => {
    if (!req.auth) await requireDemoMember(personId, c);
    await memberRole(c, personId); await clubVersion(c, clubId, rev);
    await c.query('INSERT INTO memberships(club_id,person_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [clubId, personId]);
    return incrementClubVersion(c, clubId);
  });
  res.json({ revision: next });
});
router.delete('/users/:id/clubs/:clubId', async (req, res) => {
  const rev = expected(Number(req.get('If-Match')), true); const personId = id(req.params.id); const clubId = id(req.params.clubId);
  const next = await transaction(async (c) => {
    if (!req.auth) await requireDemoMember(personId, c);
    await memberRole(c, personId); await clubVersion(c, clubId, rev);
    await one(c, 'SELECT person_id FROM memberships WHERE club_id=$1 AND person_id=$2', [clubId, personId], 'Membership');
    if ((await c.query('SELECT 1 FROM ballots WHERE club_id=$1 AND person_id=$2 LIMIT 1', [clubId, personId])).rowCount) {
      throw new HttpError(409, 'Cannot leave club: saved preferences (ballots) exist for this club.');
    }
    await c.query('DELETE FROM memberships WHERE club_id=$1 AND person_id=$2', [clubId, personId]);
    return incrementClubVersion(c, clubId);
  });
  res.json({ revision: next });
});
router.put('/clubs/:clubId/leader', async (req,res) => {
  const b = object(req.body); const rev = expected(b.revision,true); const clubId = id(req.params.clubId);
  const personId = b.personId === null ? null : id(b.personId,'personId');
  const next = await transaction(async (c) => {
    await clubVersion(c,clubId,rev);
    if (personId !== null) await one(c,'SELECT person_id FROM memberships WHERE club_id=$1 AND person_id=$2',[clubId,personId],'Membership');
    await c.query('UPDATE memberships SET leader=false WHERE club_id=$1 AND leader',[clubId]);
    if (personId !== null) await c.query('UPDATE memberships SET leader=true WHERE club_id=$1 AND person_id=$2',[clubId,personId]);
    return incrementClubVersion(c,clubId);
  });
  res.json({revision:next});
});
module.exports = router;
