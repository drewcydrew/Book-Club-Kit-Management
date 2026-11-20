const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const test = require('node:test');
const { Pool } = require('pg');

const url = process.env.TEST_DATABASE_URL;
const enabled = Boolean(url && process.env.TEST_DATABASE_CONFIRM === 'isolated');

test('scoped views load only relevant member data and retain complete staff scheduling inputs', { skip: !enabled, timeout: 30000 }, async (t) => {
  const schema = `scoped_${randomBytes(8).toString('hex')}`;
  const admin = new Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  process.env.DATABASE_URL = url;
  process.env.PGOPTIONS = `-c search_path=${schema}`;
  const pool = require('../src/db').getPool();
  const writer = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
    await writer.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  });
  await require('../src/migrate').migrate(pool);
  await require('../src/seed').seed(pool);
  await pool.query(`INSERT INTO kit_labels(id,category,name) VALUES
    ('schedule-genre','genre','Scheduled genre'),('schedule-vibe','vibe','Scheduled vibe'),('other-label','genre','Other genre')`);
  await pool.query(`INSERT INTO title_label_assignments(title_id,label_id) VALUES
    ('t1','schedule-genre'),('t1','schedule-vibe'),('t2','other-label')`);
  await pool.query("INSERT INTO people(id,name,role) VALUES('no-clubs','No clubs','member')");
  await pool.query(`INSERT INTO cycles(id,name,deadline,starts_on,ends_on,status)
    VALUES('published','Published','2030-12-01','2031-01-01','2031-01-31','published')`);
  await pool.query(`INSERT INTO meeting_slots(id,cycle_id,club_id,month,meeting)
    VALUES('pub1','published','c1','2031-01','2031-01-10'),('pub2','published','c2','2031-01','2031-01-11')`);
  await pool.query(`INSERT INTO schedule_assignments(id,cycle_id,slot_id,club_id,kit_id,ready,meeting,due,locked)
    VALUES('a1','published','pub1','c1','k1','2031-01-01','2031-01-10','2031-01-20',false),
          ('a2','published','pub2','c2','k3','2031-01-01','2031-01-11','2031-01-20',false)`);
  await pool.query(`INSERT INTO cycles(id,name,deadline,starts_on,ends_on,status)
    VALUES('drafted','Drafted','2031-12-01','2032-01-01','2032-01-31','drafted')`);
  await pool.query(`INSERT INTO meeting_slots(id,cycle_id,club_id,month,meeting)
    VALUES('draft1','drafted','c1','2032-01','2032-01-10')`);
  await pool.query(`INSERT INTO schedule_assignments(id,cycle_id,slot_id,club_id,kit_id,ready,meeting,due,locked)
    VALUES('a3','drafted','draft1','c1','k2','2032-01-01','2032-01-10','2032-01-20',false)`);
  server = require('../src/app').listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  async function get(path, status = 200) {
    const response = await fetch(base + path);
    assert.equal(response.status, status, path);
    return response.json();
  }

  const home = await get('/api/users/p4/views/home');
  assert.deepEqual(home.clubs.map((club) => club.id), ['c1']);
  assert.deepEqual(home.memberships.map((membership) => membership.personId), ['p4']);
  assert.deepEqual(home.cycles, []);
  assert.deepEqual(home.kits, []);
  assert.deepEqual(home.ballots, []);
  const enrolment = await get('/api/users/p4/enrolment');
  assert.ok(enrolment.some((club) => club.id === 'c2' && !club.enrolled));
  assert.ok(enrolment.some((club) => club.id === 'c1' && club.enrolled));
  assert.deepEqual(Object.keys(enrolment[0]).sort(), ['enrolled', 'id', 'name', 'revision']);

  const preferences = await get('/api/users/p4/views/preferences');
  assert.deepEqual(preferences.clubs.map((club) => club.id), ['c1']);
  assert.deepEqual(preferences.ballots.map((ballot) => ballot.personId), ['p4']);
  assert.ok(preferences.titles.length >= 4);
  assert.ok(preferences.cycles.every((cycle) => cycle.slots.every((slot) => slot.clubId === 'c1')));
  assert.ok(preferences.history.every((item) => item.clubId === 'c1'));
  assert.deepEqual(preferences.events, []);
  const leader = await get('/api/users/p3/views/preferences');
  assert.deepEqual(leader.ballots.map((ballot) => ballot.personId), ['p3']);
  const review = await get('/api/users/p3/clubs/c1/cycles/cycle1/review');
  assert.deepEqual(review.map((ballot) => ballot.personId), ['p3', 'p4']);
  await get('/api/users/p4/clubs/c1/cycles/cycle1/review', 404);
  await get('/api/users/p3/clubs/c2/cycles/cycle1/review', 404);

  const schedule = await get('/api/users/p4/views/schedule');
  assert.deepEqual(schedule.cycles.map((cycle) => cycle.id), ['drafted', 'published']);
  assert.deepEqual(schedule.assignments.map((item) => item.id), ['a3', 'a1']);
  assert.deepEqual(schedule.kits.map((item) => item.id), ['k1', 'k2']);
  assert.deepEqual(schedule.titles.map((item) => item.id), ['t1']);
  assert.deepEqual(schedule.kitLabels.map((label) => label.id), ['schedule-genre', 'schedule-vibe']);
  assert.deepEqual((await get('/api/users/no-clubs/views/schedule')).kitLabels, []);
  assert.ok(schedule.cycles.every((cycle) => cycle.slots.every((slot) => slot.clubId === 'c1')));
  assert.deepEqual(schedule.ballots, []);
  assert.deepEqual(schedule.events, []);

  const clubOne = await get('/api/clubs/c1/schedule');
  assert.equal(clubOne.club.id, 'c1');
  assert.ok(!('leaderId' in clubOne.club));
  assert.deepEqual(clubOne.cycles.map((cycle) => cycle.id), ['drafted', 'published']);
  assert.deepEqual(clubOne.cycles.flatMap((cycle) => cycle.slots.map((slot) => slot.id)), ['draft1', 'pub1']);
  assert.deepEqual(clubOne.assignments.map((item) => item.id), ['a3', 'a1']);
  assert.deepEqual(clubOne.kits.map((item) => item.id), ['k1', 'k2']);
  assert.deepEqual(clubOne.titles.map((item) => item.id), ['t1']);
  assert.deepEqual(clubOne.kitLabels.map((label) => label.id), ['schedule-genre', 'schedule-vibe']);
  const clubTwo = await get('/api/clubs/c2/schedule');
  assert.deepEqual(clubTwo.cycles.map((cycle) => cycle.id), ['published']);
  assert.deepEqual(clubTwo.assignments.map((item) => item.id), ['a2']);
  await get('/api/clubs/missing-club/schedule', 404);
  assert.deepEqual((await get('/api/clubs/schedule-index')).map((club) => club.id).sort(), ['c1', 'c2']);

  const full = await get('/api/shared');
  const staff = await get('/api/users/p2/views/schedule');
  for (const key of ['clubs', 'cycles', 'ballots', 'assignments', 'kits', 'titles', 'history']) {
    assert.deepEqual(staff[key], full[key], key);
  }
  assert.deepEqual(staff.events, []);
  await get('/api/users/p4/views/admin', 409);
  await get('/api/users/p4/views/not-a-view', 400);
  await get('/api/users/not-found/views/home', 404);
  await get('/api/users/%40invalid/views/home', 400);

  await pool.query("INSERT INTO memberships(club_id,person_id) VALUES('c2','p4')");
  const multi = await get('/api/users/p4/views/preferences');
  assert.deepEqual(multi.clubs.map((club) => club.id), ['c1', 'c2']);
  assert.ok(multi.cycles.some((cycle) => cycle.slots.some((slot) => slot.clubId === 'c2')));

  const before = await get('/api/users/p4/views/preferences');
  const connect = pool.connect.bind(pool);
  let interleaved = false;
  pool.connect = async (...args) => {
    const client = await connect(...args);
    const query = client.query.bind(client);
    client.query = async (...queryArgs) => {
      const result = await query(...queryArgs);
      if (!interleaved && queryArgs[0] === 'SELECT id,name,role,revision FROM people WHERE id=$1') {
        interleaved = true;
        client.query = query;
        await writer.query("UPDATE titles SET name='Changed concurrently',revision=revision+1 WHERE id='t1'");
      }
      return result;
    };
    return client;
  };
  let during;
  try { during = await get('/api/users/p4/views/preferences'); } finally { pool.connect = connect; }
  assert.equal(interleaved, true);
  assert.equal(during.titles.find((title) => title.id === 't1').name, before.titles.find((title) => title.id === 't1').name);
  assert.equal((await get('/api/users/p4/views/preferences')).titles.find((title) => title.id === 't1').name, 'Changed concurrently');
});
