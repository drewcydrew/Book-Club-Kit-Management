const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const test = require('node:test');
const { Pool } = require('pg');
const { app, fetchAuthenticated: fetch } = require('../test-support/authenticated-app');

const url = process.env.TEST_DATABASE_URL;
const enabled = Boolean(url && process.env.TEST_DATABASE_CONFIRM === 'isolated');

test('confirmed club deletion is atomic, persistent and rejects changed previews', { skip: !enabled, timeout: 60000 }, async (t) => {
  const schema = `club_delete_${randomBytes(8).toString('hex')}`;
  const admin = new Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  process.env.DATABASE_URL = url;
  process.env.PGOPTIONS = `-c search_path=${schema}`;
  const pool = require('../src/db').getPool();
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  });
  await require('../src/migrate').migrate(pool);
  await require('../src/seed').seed(pool);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let base = `http://127.0.0.1:${server.address().port}`;
  async function req(path, method = 'GET', body, revision) {
    const response = await fetch(base + path, { method, headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(revision === undefined ? {} : { 'If-Match': String(revision) }),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, json: response.status === 204 ? null : await response.json() };
  }
  const preview = (club = 'c1') => req(`/api/clubs/${club}/deletion-preview`, 'POST', { revision: 1 });
  const remove = (value, club = 'c1', revision = 1) =>
    req(`/api/clubs/${club}`, 'DELETE', { token: value.token, acknowledge: true }, revision);

  await pool.query("INSERT INTO finalized_groups(cycle_id,club_id) VALUES('cycle1','c1'),('cycle1','c2')");
  await pool.query("INSERT INTO finalized_rankings(cycle_id,club_id,title_id,rank) VALUES('cycle1','c1','t1',1),('cycle1','c2','t2',1)");
  await pool.query("INSERT INTO club_kits(club_id,kit_id) VALUES('c1','k2'),('c2','k3')");
  await pool.query("UPDATE kits SET status=CASE id WHEN 'k1' THEN 'out' ELSE 'reserved' END WHERE id IN ('k1','k2')");
  await pool.query("INSERT INTO circulation_events(id,kit_id,action,at,notes) VALUES('event-1','k1','picked up',now(),'test')");
  await pool.query(`INSERT INTO schedule_assignments(id,cycle_id,slot_id,club_id,kit_id,ready,meeting,due,locked)
    SELECT 'assign-'||id,cycle_id,id,club_id,CASE club_id WHEN 'c1' THEN 'k1' ELSE 'k3' END,meeting-21,meeting,meeting+7,true
    FROM meeting_slots WHERE id IN ('s1','s2')`);
  await pool.query("INSERT INTO cycles(id,name,deadline,starts_on,ends_on,status) VALUES('solo','Solo',CURRENT_DATE,CURRENT_DATE,CURRENT_DATE+60,'published')");
  await pool.query("INSERT INTO meeting_slots(id,cycle_id,club_id,month,meeting) VALUES('solo-slot','solo','c1',to_char(CURRENT_DATE+30,'YYYY-MM'),CURRENT_DATE+30)");
  await pool.query(`INSERT INTO schedule_assignments(id,cycle_id,slot_id,club_id,kit_id,ready,meeting,due,locked)
    SELECT 'solo-assignment',cycle_id,id,club_id,'k1',meeting-21,meeting,meeting+7,true FROM meeting_slots WHERE id='solo-slot'`);

  let result = await preview();
  assert.equal(result.status, 200);
  assert.equal(result.json.counts.memberships, 2);
  assert.equal(result.json.counts.lockedAssignments, 2);
  assert.equal(result.json.cycles.find((c) => c.id === 'solo').remainingSlots, 0);
  assert.deepEqual(result.json.affectedKits.map((k) => k.status).sort(), ['out', 'reserved']);
  assert.equal((await req('/api/clubs/c1', 'DELETE', undefined, 1)).status, 400);
  assert.equal((await req('/api/clubs/c1', 'DELETE', { token: result.json.token, acknowledge: false }, 1)).status, 400);
  assert.equal((await remove(result.json, 'c1', 2)).status, 409);

  async function changed(mutate) {
    const before = (await preview()).json;
    await mutate();
    assert.equal((await remove(before)).status, 409);
    assert.equal((await pool.query("SELECT 1 FROM clubs WHERE id='c1'")).rowCount, 1);
  }
  await changed(() => req('/api/clubs/c1/kits/k4', 'PUT'));
  await changed(() => pool.query("UPDATE membership_versions SET revision=revision+1 WHERE club_id='c1'"));
  await changed(() => pool.query("UPDATE ballots SET revision=revision+1 WHERE club_id='c1' AND person_id='p3'"));
  await changed(() => pool.query("UPDATE finalized_rankings SET rank=2 WHERE club_id='c1' AND cycle_id='cycle1'"));
  await changed(() => pool.query(`UPDATE meeting_slots SET meeting=CASE
    WHEN extract(day FROM meeting)=1 THEN meeting+1 ELSE meeting-1 END WHERE id='s3'`));
  await changed(() => pool.query("UPDATE kits SET status='available',revision=revision+1 WHERE id='k2'"));
  await pool.query("UPDATE kits SET status='reserved',revision=revision+1 WHERE id='k2'");

  await pool.query("CREATE FUNCTION fail_membership_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$");
  await pool.query("CREATE TRIGGER fail_membership_delete BEFORE DELETE ON memberships FOR EACH ROW EXECUTE FUNCTION fail_membership_delete()");
  const failed = await remove((await preview()).json);
  assert.equal(failed.status, 500);
  assert.equal((await pool.query("SELECT 1 FROM schedule_assignments WHERE id='solo-assignment'")).rowCount, 1);
  assert.equal((await pool.query("SELECT 1 FROM ballot_marks WHERE club_id='c1'")).rowCount > 0, true);
  await pool.query('DROP TRIGGER fail_membership_delete ON memberships');
  await pool.query('DROP FUNCTION fail_membership_delete()');

  const cycleRevision = (await pool.query("SELECT revision FROM cycles WHERE id='cycle1'")).rows[0].revision;
  result = await preview();
  const both = await Promise.all([remove(result.json), remove(result.json)]);
  assert.deepEqual(both.map((item) => item.status).sort(), [204, 404]);
  for (const table of ['memberships','membership_versions','club_kits','club_history','ballots','ballot_marks',
    'finalized_groups','finalized_rankings','meeting_slots','schedule_assignments']) {
    assert.equal((await pool.query(`SELECT 1 FROM ${table} WHERE club_id='c1'`)).rowCount, 0, table);
  }
  assert.equal((await pool.query("SELECT 1 FROM clubs WHERE id='c1'")).rowCount, 0);
  assert.equal((await pool.query("SELECT 1 FROM schedule_assignments WHERE id='assign-s2' AND club_id='c2'")).rowCount, 1);
  assert.equal((await pool.query("SELECT 1 FROM ballot_marks WHERE club_id='c2'")).rowCount > 0, true);
  assert.equal((await pool.query("SELECT revision FROM cycles WHERE id='cycle1'")).rows[0].revision, cycleRevision + 1);
  assert.deepEqual((await pool.query("SELECT status,revision FROM cycles WHERE id='solo'")).rows[0], { status: 'published', revision: 2 });
  assert.equal((await pool.query("SELECT status FROM kits WHERE id='k1'")).rows[0].status, 'out');
  assert.equal((await pool.query("SELECT status FROM kits WHERE id='k2'")).rows[0].status, 'reserved');
  assert.equal((await pool.query("SELECT 1 FROM circulation_events WHERE id='event-1'")).rowCount, 1);
  assert.equal((await pool.query("SELECT 1 FROM people WHERE id='p3'")).rowCount, 1);

  await new Promise((resolve) => server.close(resolve));
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
  const shared = await req('/api/shared');
  assert.equal(shared.status, 200);
  assert.equal(shared.json.clubs.some((club) => club.id === 'c1'), false);
  assert.equal(shared.json.cycles.find((cycle) => cycle.id === 'solo').status, 'published');
  assert.equal(shared.json.cycles.find((cycle) => cycle.id === 'solo').slots.length, 0);

  await pool.query("INSERT INTO clubs(id,name,branch,size,cadence,pickup,address) VALUES('empty','Empty','Central',1,1,'pickup','')");
  const emptyPreview = await preview('empty');
  assert.equal(emptyPreview.json.counts.memberships, 0);
  assert.equal((await remove(emptyPreview.json, 'empty')).status, 204);
  await pool.query("INSERT INTO clubs(id,name,branch,size,cadence,pickup,address) VALUES('race','Race','Central',1,1,'pickup','')");
  const racePreview = (await preview('race')).json;
  const [linked, removed] = await Promise.all([req('/api/clubs/race/kits/k3', 'PUT'), remove(racePreview, 'race')]);
  assert.ok((linked.status === 204 && removed.status === 409) || (linked.status === 404 && removed.status === 204));
  if (removed.status === 409) assert.equal((await remove((await preview('race')).json, 'race')).status, 204);
  assert.equal((await preview('missing')).status, 404);
});
