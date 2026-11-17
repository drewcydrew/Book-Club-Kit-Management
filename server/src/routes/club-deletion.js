const { createHash } = require('node:crypto');
const { HttpError, object, revision } = require('../http');
const { transaction, one, stale } = require('./workflow-util');

async function deletionSnapshot(c, clubId, expectedRevision) {
  const club = await one(c, 'SELECT id,name,revision FROM clubs WHERE id=$1 FOR UPDATE', [clubId], 'Club');
  stale(club.revision, expectedRevision);
  const rows = async (sql) => (await c.query(sql, [clubId])).rows;
  const memberships = await rows('SELECT club_id,person_id,leader FROM memberships WHERE club_id=$1 ORDER BY person_id');
  const membershipVersions = await rows('SELECT club_id,revision FROM membership_versions WHERE club_id=$1');
  const links = await rows('SELECT club_id,kit_id FROM club_kits WHERE club_id=$1 ORDER BY kit_id');
  const history = await rows('SELECT club_id,title_id FROM club_history WHERE club_id=$1 ORDER BY title_id');
  const ballots = await rows('SELECT cycle_id,club_id,person_id,revision FROM ballots WHERE club_id=$1 ORDER BY cycle_id,person_id');
  const marks = await rows('SELECT cycle_id,club_id,person_id,title_id,mark,rank FROM ballot_marks WHERE club_id=$1 ORDER BY cycle_id,person_id,title_id');
  const groups = await rows('SELECT cycle_id,club_id FROM finalized_groups WHERE club_id=$1 ORDER BY cycle_id');
  const rankings = await rows('SELECT cycle_id,club_id,title_id,rank FROM finalized_rankings WHERE club_id=$1 ORDER BY cycle_id,title_id');
  const slots = await rows('SELECT id,cycle_id,club_id,month,meeting FROM meeting_slots WHERE club_id=$1 ORDER BY id');
  const assignments = await rows('SELECT id,cycle_id,slot_id,club_id,kit_id,ready,meeting,due,locked FROM schedule_assignments WHERE club_id=$1 ORDER BY id');
  const cycles = await rows(`SELECT id,name,status,revision,
    (SELECT count(*)::int FROM meeting_slots WHERE cycle_id=cycles.id AND club_id<>$1) AS remaining_slots
    FROM cycles WHERE id IN (
    SELECT cycle_id FROM meeting_slots WHERE club_id=$1 UNION SELECT cycle_id FROM schedule_assignments WHERE club_id=$1
    UNION SELECT cycle_id FROM ballots WHERE club_id=$1 UNION SELECT cycle_id FROM finalized_groups WHERE club_id=$1
  ) ORDER BY id`);
  const kits = await rows(`SELECT k.id,k.status,k.revision,
    COALESCE((SELECT identifier FROM kit_identifiers WHERE kit_id=k.id AND kind='kit'),k.id) AS barcode
    FROM kits k WHERE k.id IN (SELECT kit_id FROM club_kits WHERE club_id=$1 UNION
      SELECT kit_id FROM schedule_assignments WHERE club_id=$1) ORDER BY k.id`);
  const snapshot = { club, memberships, membershipVersions, links, history, ballots, marks, groups, rankings, slots, assignments, cycles, kits };
  const token = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  return {
    token,
    club,
    counts: { memberships: memberships.length, kitLinks: links.length, history: history.length, ballots: ballots.length,
      ballotMarks: marks.length, finalizedGroups: groups.length, finalizedRankings: rankings.length, slots: slots.length,
      assignments: assignments.length, lockedAssignments: assignments.filter((item) => item.locked).length },
    cycles: cycles.map((cycle) => ({ id: cycle.id, name: cycle.name, status: cycle.status,
      slots: slots.filter((slot) => slot.cycle_id === cycle.id).length,
      assignments: assignments.filter((assignment) => assignment.cycle_id === cycle.id).length,
      remainingSlots: cycle.remaining_slots })),
    affectedKits: kits.filter((kit) => kit.status === 'out' || kit.status === 'reserved')
      .map(({ id, barcode, status }) => ({ id, barcode, status })),
  };
}

async function previewClubDeletion(req, res) {
  const expected = revision(object(req.body).revision);
  const preview = await transaction((c) => deletionSnapshot(c, req.params.id, expected));
  res.json(preview);
}

async function deleteClub(req, res) {
  const expected = revision(req.header('If-Match'));
  const body = object(req.body);
  if (body.acknowledge !== true || typeof body.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token)) {
    throw new HttpError(400, 'Review and confirm the club deletion preview first.');
  }
  await transaction(async (c) => {
    const preview = await deletionSnapshot(c, req.params.id, expected);
    if (preview.token !== body.token) throw new HttpError(409, 'Club deletion details changed. Refresh and review a new preview.');
    const cycleIds = preview.cycles.map((cycle) => cycle.id);
    for (const table of ['schedule_assignments', 'finalized_rankings', 'finalized_groups', 'ballot_marks',
      'ballots', 'meeting_slots', 'club_history', 'club_kits', 'memberships', 'membership_versions']) {
      await c.query(`DELETE FROM ${table} WHERE club_id=$1`, [req.params.id]);
    }
    await c.query('UPDATE cycles SET revision=revision+1 WHERE id=ANY($1::text[])', [cycleIds]);
    await c.query('DELETE FROM clubs WHERE id=$1', [req.params.id]);
  });
  res.status(204).end();
}

module.exports = { previewClubDeletion, deleteClub };
