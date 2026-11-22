const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');

const databaseUrl = process.env.TEST_LIBRARY_DATABASE_URL;
const enabled = Boolean(databaseUrl && process.env.TEST_DATABASE_CONFIRM === 'isolated');

test('library services isolate records and reject cross-service references', { skip: !enabled }, async (t) => {
  process.env.DATABASE_URL = databaseUrl;
  const { getPool, withLibraryService, withTransaction } = require('../src/db');
  const pool = getPool();
  const app = require('../src/app').createApp(async () => ({ uid: 'library-test-admin' }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const services = [];
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    for (const service of services) {
      await withLibraryService(service.id, async () => {
        await pool.query('DELETE FROM ballot_marks WHERE library_service_id=$1', [service.id]);
        await pool.query('DELETE FROM ballots WHERE library_service_id=$1', [service.id]);
        await pool.query('DELETE FROM membership_versions WHERE library_service_id=$1', [service.id]);
        await pool.query('DELETE FROM memberships WHERE library_service_id=$1', [service.id]);
        await pool.query('DELETE FROM meeting_slots WHERE library_service_id=$1', [service.id]);
        await pool.query('DELETE FROM cycles WHERE library_service_id=$1', [service.id]);
        await pool.query('DELETE FROM clubs WHERE library_service_id=$1', [service.id]);
        await pool.query('DELETE FROM firebase_identities WHERE uid=$1', ['library-test-admin']);
        await pool.query('DELETE FROM people WHERE library_service_id=$1', [service.id]);
        await pool.query('DELETE FROM kits WHERE library_service_id=$1', [service.id]);
        await pool.query('DELETE FROM titles WHERE library_service_id=$1', [service.id]);
        await pool.query('DELETE FROM lending_settings WHERE library_service_id=$1', [service.id]);
      });
      await pool.query('DELETE FROM library_services WHERE id=$1', [service.id]);
    }
    await pool.end();
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, { method = 'GET', body, service, auth = true } = {}) => fetch(base + path, {
    method,
    headers: {
      ...(auth ? { Authorization: 'Bearer test-token' } : {}),
      ...(service ? { 'X-Library-Service-Id': service } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal((await request('/titles')).status, 400);
  assert.equal((await request('/titles', { service: 'missing-service' })).status, 404);
  assert.equal((await request('/library-services', { method: 'POST', auth: false, body: { name: 'No', branch: 'No' } })).status, 401);
  for (const name of ['First', 'Second']) {
    const response = await request('/library-services', { method: 'POST', body: { name, branch: 'Main' } });
    assert.equal(response.status, 201);
    services.push(await response.json());
  }
  const [first, second] = services;
  for (const service of services) {
    const settings = await withLibraryService(service.id, () => pool.query('SELECT name FROM lending_settings'));
    assert.deepEqual(settings.rows.map((row) => row.name), [service.name]);
  }
  assert.equal((await pool.query('SELECT 1 FROM lending_settings')).rowCount, 0);
  await assert.rejects(withLibraryService(first.id, () => withTransaction(async (client) => {
    await client.query("INSERT INTO titles(id,name,author,isbn,pages) VALUES('rolled-back-title','Rolled back','Author','',1)");
    throw new Error('rollback check');
  })), /rollback check/);
  assert.equal((await withLibraryService(first.id, () => pool.query("SELECT 1 FROM titles WHERE id='rolled-back-title'"))).rowCount, 0);
  assert.equal((await request('/session', { service: first.id })).status, 200);
  assert.equal((await request('/session', { service: second.id })).status, 200);
  const titleResponse = await request('/titles', { method: 'POST', service: first.id, body: {
    name: 'Fictional title', author: 'Fictional author', isbn: '', pages: 1,
    genres: '', notes: '', largePrint: false, audio: false, labelIds: [],
  } });
  assert.equal(titleResponse.status, 201);
  const title = await titleResponse.json();
  assert.equal((await request(`/titles/${title.id}`, { service: second.id })).status, 404);
  assert.deepEqual(await (await request('/titles', { service: second.id })).json(), []);
  const simultaneous = await Promise.all(Array.from({ length: 10 }, (_, index) =>
    request('/titles', { service: index % 2 ? second.id : first.id }).then((response) => response.json())));
  assert.ok(simultaneous.every((titles, index) => index % 2 ? titles.length === 0 : titles.length === 1 && titles[0].id === title.id));
  await assert.rejects(withLibraryService(second.id, () => pool.query(
    'INSERT INTO kits(id,title_id,branch,copies,extras) VALUES($1,$2,$3,1,$4)',
    ['cross-service-test', title.id, 'Main', ''],
  )), (error) => error.code === '23503');
  const secondTitleResponse = await request('/titles', { method: 'POST', service: second.id, body: {
    name: 'Fictional title', author: 'Fictional author', isbn: '', pages: 1,
    genres: '', notes: '', largePrint: false, audio: false, labelIds: [],
  } });
  assert.equal(secondTitleResponse.status, 201);
  const secondTitle = await secondTitleResponse.json();
  let firstKit;
  for (const [service, titleId] of [[first.id, title.id], [second.id, secondTitle.id]]) {
    const kit = await request('/kits', { method: 'POST', service, body: {
      titleId, branch: 'Main', copies: 1, extras: '', barcode: 'same-barcode', components: [],
    } });
    assert.equal(kit.status, 201);
    if (service === first.id) firstKit = await kit.json();
  }
  const updatedKit = await request(`/kits/${firstKit.id}`, { method: 'PUT', service: first.id, body: {
    titleId: title.id, branch: 'Main', copies: 1, extras: 'Updated', barcode: 'same-barcode',
    components: [], revision: firstKit.revision,
  } });
  assert.equal(updatedKit.status, 200);
  assert.equal((await updatedKit.json()).extras, 'Updated');
  assert.equal((await request('/users', { service: first.id, auth: false })).status, 200);
  const memberResponse = await request('/users', { method: 'POST', service: first.id, body: { name: 'Fictional member', role: 'member' } });
  assert.equal(memberResponse.status, 201);
  const member = await memberResponse.json();
  const preferences = await request(`/users/${member.id}/views/preferences`, { service: first.id, auth: false });
  assert.equal(preferences.status, 200);
  assert.equal((await preferences.json()).library.name, first.name);
  const clubResponse = await request('/clubs', { method: 'POST', service: first.id, body: {
    name: 'Fictional club', branch: 'Main', size: 5, cadence: 1, cadenceOffset: 0,
    meetingWeekday: 1, meetingOccurrence: 1, pickup: 'pickup', address: '',
  } });
  assert.equal(clubResponse.status, 201);
  const club = await clubResponse.json();
  assert.equal((await request(`/users/${member.id}/clubs/${club.id}`, {
    method: 'PUT', service: first.id, auth: false, body: { revision: 0 },
  })).status, 200);
  const cycleResponse = await request('/cycles', { method: 'POST', service: first.id, body: {
    name: 'Fictional cycle', deadline: '2099-01-01', startsOn: '2099-02-01',
    endsOn: '2099-02-28', status: 'collecting', slots: [],
  } });
  assert.equal(cycleResponse.status, 201);
  const cycle = await cycleResponse.json();
  assert.deepEqual((await (await request('/cycles', { service: first.id })).json()).map((item) => item.id), [cycle.id]);
  assert.deepEqual(await (await request('/cycles', { service: second.id })).json(), []);
  assert.equal((await request(`/cycles/${cycle.id}`, { service: second.id })).status, 404);
  const ballot = await request(`/cycles/${cycle.id}/clubs/${club.id}/ballots/${member.id}`, {
    method: 'PUT', service: first.id, auth: false, body: { revision: 0, marks: { [title.id]: 'selected' }, ranking: [title.id] },
  });
  assert.equal(ballot.status, 200);
  assert.deepEqual((await ballot.json()).ranking, [title.id]);
  assert.equal((await request(`/users/${member.id}/views/preferences`, { service: second.id, auth: false })).status, 403);
});
