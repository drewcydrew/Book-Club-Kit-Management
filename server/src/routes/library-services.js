const express = require('express');
const { createHash, randomUUID } = require('node:crypto');
const { HttpError, object, text, integer } = require('../http');
const { date, id, list, unique } = require('./workflow-util');
const { withLibraryService, withTransaction } = require('../db');

const router = express.Router();
const tables = [
  'schedule_assignments', 'finalized_rankings', 'finalized_groups', 'ballot_marks', 'ballots',
  'meeting_slots', 'club_history', 'club_kits', 'memberships', 'membership_versions',
  'firebase_identities', 'people', 'kit_identifiers', 'title_label_assignments',
  'circulation_events', 'kits', 'titles', 'kit_labels', 'cycles', 'clubs', 'lending_settings',
];

function setupInput(value) {
  const b = object(value);
  const requestId = id(b.requestId, 'requestId');
  const name = text(b.name, 'name', true, 200);
  const branches = unique(list(b.branches, 'branches', 100).map((branch) => text(branch, 'branch', true, 200)), 'branches');
  if (!branches.length) throw new HttpError(400, 'Add at least one branch.');
  const cycle = object(b.cycle);
  const startsOn = date(cycle.startsOn, 'startsOn');
  const endsOn = date(cycle.endsOn, 'endsOn');
  if (startsOn > endsOn) throw new HttpError(400, 'The cycle must start on or before it ends.');
  const deadline = date(cycle.deadline, 'deadline');
  if (deadline >= endsOn) throw new HttpError(400, 'The cycle must end after the voting deadline.');
  const validatedCycle = { name: text(cycle.name, 'cycle name', true, 200), deadline, startsOn, endsOn };
  const titles = list(b.titles, 'titles', 100).map((item) => {
    const title = object(item);
    const copies = integer(title.copies, 'copies', 1);
    if (copies > 10000) throw new HttpError(400, 'copies is invalid.');
    return { name: text(title.name, 'title name', true, 200), author: text(title.author, 'author', true, 200),
      isbn: text(title.isbn, 'isbn', false, 40), copies };
  });
  if (!titles.length) throw new HttpError(400, 'Add at least one title and kit.');
  const club = b.club === null ? null : object(b.club);
  const validatedClub = club ? { name: text(club.name, 'club name', true, 200), size: integer(club.size, 'club size', 1),
    branch: text(club.branch, 'club branch', true, 200) } : null;
  if (validatedClub && !branches.includes(validatedClub.branch)) throw new HttpError(400, 'The club branch must be a selected branch.');
  const member = b.member === null ? null : object(b.member);
  const validatedMember = member ? { name: text(member.name, 'member name', true, 200) } : null;
  return { requestId, name, branches, cycle: validatedCycle, titles, club: validatedClub, member: validatedMember };
}

router.post('/library-services/setup', async (req, res) => {
  const b = setupInput(req.body);
  const hash = createHash('sha256').update(JSON.stringify(b)).digest('hex');
  const serviceId = randomUUID();
  const result = await withLibraryService(serviceId, () => withTransaction(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(180313024, hashtext($1))', [`${req.auth.uid}:${b.requestId}`]);
    const previous = await c.query('SELECT id,name,setup_payload_hash FROM library_services WHERE created_by=$1 AND setup_request_id=$2', [req.auth.uid, b.requestId]);
    if (previous.rowCount) {
      if (previous.rows[0].setup_payload_hash !== hash) throw new HttpError(409, 'This setup request was already used with different details.');
      return { id: previous.rows[0].id, name: previous.rows[0].name, existing: true };
    }
    if (!(await c.query('SELECT $1::date > CURRENT_DATE AS valid', [b.cycle.deadline])).rows[0].valid) {
      throw new HttpError(400, 'The voting deadline must be in the future.');
    }
    await c.query('INSERT INTO library_services(id,name,created_by,setup_request_id,setup_payload_hash) VALUES($1,$2,$3,$4,$5)',
      [serviceId, b.name, req.auth.uid, b.requestId, hash]);
    await c.query('INSERT INTO lending_settings(name,branches,loan_days,buffer_days) VALUES($1,$2,28,3)', [b.name, b.branches]);
    await c.query("INSERT INTO cycles(id,name,deadline,starts_on,ends_on,status) VALUES($1,$2,$3,$4,$5,'collecting')",
      [randomUUID(), b.cycle.name, b.cycle.deadline, b.cycle.startsOn, b.cycle.endsOn]);
    for (const title of b.titles) {
      const titleId = randomUUID();
      const kitId = randomUUID();
      await c.query('INSERT INTO titles(id,name,author,isbn,pages) VALUES($1,$2,$3,$4,0)', [titleId, title.name, title.author, title.isbn]);
      await c.query("INSERT INTO kits(id,title_id,branch,copies,extras) VALUES($1,$2,$3,$4,'')", [kitId, titleId, b.branches[0], title.copies]);
      await c.query("INSERT INTO kit_identifiers(kit_id,identifier,kind) VALUES($1,$2,'kit')", [kitId, `starter-${kitId}`]);
    }
    let clubId;
    if (b.club) {
      clubId = randomUUID();
      await c.query("INSERT INTO clubs(id,name,branch,size,cadence,meeting_weekday,meeting_occurrence,pickup_offset_days,skip_months,pickup,address) VALUES($1,$2,$3,$4,1,1,1,-7,0,'pickup','')",
        [clubId, b.club.name, b.club.branch, b.club.size]);
    }
    if (b.member) {
      const personId = randomUUID();
      await c.query("INSERT INTO people(id,name,role) VALUES($1,$2,'member')", [personId, b.member.name]);
      if (clubId) {
        await c.query('INSERT INTO memberships(club_id,person_id) VALUES($1,$2)', [clubId, personId]);
        await c.query('INSERT INTO membership_versions(club_id,revision) VALUES($1,1)', [clubId]);
      }
    }
    return { id: serviceId, name: b.name, existing: false };
  }, { allowMissingService: true }));
  res.status(result.existing ? 200 : 201).json({ id: result.id, name: result.name });
});

router.get('/library-services/setup/:requestId', async (req, res) => {
  const requestId = id(req.params.requestId, 'requestId');
  const result = await withTransaction(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(180313024, hashtext($1))', [`${req.auth.uid}:${requestId}`]);
    return c.query('SELECT id,name FROM library_services WHERE created_by=$1 AND setup_request_id=$2', [req.auth.uid, requestId]);
  });
  if (!result.rowCount) throw new HttpError(404, 'Setup result not found.');
  res.json(result.rows[0]);
});

async function deletionSnapshot(c, serviceId) {
  const service = (await c.query('SELECT id,name FROM library_services WHERE id=$1', [serviceId])).rows[0];
  if (!service) throw new HttpError(404, 'Library service not found.');
  const scopedTables = [...tables];
  if ((await c.query("SELECT to_regclass('kit_label_assignments') IS NOT NULL AS present")).rows[0].present) {
    scopedTables.splice(scopedTables.indexOf('title_label_assignments'), 0, 'kit_label_assignments');
  }
  const counts = {};
  const fingerprints = {};
  for (const table of scopedTables) {
    const result = await c.query(`SELECT count(*)::int AS count,
      md5(COALESCE(string_agg(md5(row_to_json(t)::text), '' ORDER BY md5(row_to_json(t)::text)), '')) AS fingerprint
      FROM ${table} t WHERE library_service_id=$1`, [serviceId]);
    counts[table] = result.rows[0].count;
    fingerprints[table] = result.rows[0].fingerprint;
  }
  const token = createHash('sha256').update(JSON.stringify({ service, counts, fingerprints })).digest('hex');
  return { service, counts, token, scopedTables };
}

router.post('/library-services/:serviceId/deletion-preview', async (req, res) => {
  const serviceId = id(req.params.serviceId, 'serviceId');
  const preview = await withLibraryService(serviceId, () => withTransaction(
    (c) => deletionSnapshot(c, serviceId), { exclusiveService: true }));
  res.json({ service: preview.service, counts: preview.counts, token: preview.token });
});

router.delete('/library-services/:serviceId', async (req, res) => {
  const serviceId = id(req.params.serviceId, 'serviceId');
  const body = object(req.body);
  if (body.acknowledge !== true || typeof body.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token)) {
    throw new HttpError(400, 'Review and confirm the service deletion preview first.');
  }
  await withLibraryService(serviceId, () => withTransaction(async (c) => {
    const preview = await deletionSnapshot(c, serviceId);
    if (body.name !== preview.service.name || body.token !== preview.token) {
      throw new HttpError(409, 'Service details changed or the name does not match. Review the deletion again.');
    }
    for (const table of preview.scopedTables) {
      if (table === 'circulation_events' && preview.counts.circulation_events) {
        await c.query('ALTER TABLE circulation_events DISABLE TRIGGER circulation_events_append_only');
        await c.query('DELETE FROM circulation_events WHERE library_service_id=$1', [serviceId]);
        await c.query('ALTER TABLE circulation_events ENABLE TRIGGER circulation_events_append_only');
      } else {
        await c.query(`DELETE FROM ${table} WHERE library_service_id=$1`, [serviceId]);
      }
    }
    await c.query('DELETE FROM library_services WHERE id=$1', [serviceId]);
  }, { exclusiveService: true }));
  res.status(204).end();
});

module.exports = router;
