const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const test = require('node:test');
const { Pool } = require('pg');
const { app, fetchAuthenticated: fetch } = require('../test-support/authenticated-app');
const url = process.env.TEST_DATABASE_URL;
const enabled = Boolean(url && process.env.TEST_DATABASE_CONFIRM === 'isolated');

test('shared snapshot keeps catalog, club revision and history consistent across concurrent writes', { skip: !enabled, timeout: 30000 }, async (t) => {
  const schema = `snapshot_${randomBytes(8).toString('hex')}`;
  const admin = new Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  process.env.DATABASE_URL = url;
  process.env.PGOPTIONS = `-c search_path=${schema}`;
  const pool = require('../src/db').getPool();
  const writer = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end(); await writer.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end();
  });
  await require('../src/migrate').migrate(pool);
  await require('../src/seed').seed(pool);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  async function get(path) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    return response.json();
  }
  const before = await get('/api/shared');
  for (const [field, route] of [['titles','/api/titles'],['kits','/api/kits'],['clubs','/api/clubs'],['links','/api/club-kits']]) {
    assert.deepEqual(before[field], await get(route));
  }

  const connect = pool.connect.bind(pool);
  let interleaved = false;
  pool.connect = async (...args) => {
    const client = await connect(...args);
    const query = client.query.bind(client);
    client.query = async (...queryArgs) => {
      const result = await query(...queryArgs);
      if (!interleaved && queryArgs[0] === 'SELECT id,name,role,revision FROM people ORDER BY id') {
        interleaved = true;
        client.query = query;
        const w = await writer.connect();
        try {
          await w.query('BEGIN');
          await w.query("UPDATE clubs SET name='Updated club',revision=revision+1 WHERE id='c1'");
          await w.query("DELETE FROM club_history WHERE club_id='c1'");
          await w.query("INSERT INTO club_history(club_id,title_id) VALUES('c1','t1')");
          await w.query("UPDATE titles SET name='Updated title',revision=revision+1 WHERE id='t1'");
          await w.query("UPDATE kits SET status='reserved',revision=revision+1 WHERE id='k1'");
          await w.query("INSERT INTO club_kits(club_id,kit_id) VALUES('c1','k1')");
          await w.query('COMMIT');
        } catch (error) { await w.query('ROLLBACK'); throw error; }
        finally { w.release(); }
      }
      return result;
    };
    return client;
  };
  let during;
  try { during = await get('/api/shared'); }
  finally { pool.connect = connect; }
  assert.equal(interleaved, true);
  for (const field of ['titles','kits','clubs','links','history']) assert.deepEqual(during[field], before[field]);
  const after = await get('/api/shared');
  assert.equal(after.clubs.find((club) => club.id === 'c1').revision, before.clubs.find((club) => club.id === 'c1').revision + 1);
  assert.deepEqual(after.history.find((item) => item.clubId === 'c1').titles, ['t1']);
  assert.equal(after.titles.find((title) => title.id === 't1').name, 'Updated title');
  assert.equal(after.kits.find((kit) => kit.id === 'k1').status, 'reserved');
  assert.deepEqual(after.links, [{ clubId: 'c1', kitId: 'k1' }]);
  for (const [field, route] of [['titles','/api/titles'],['kits','/api/kits'],['clubs','/api/clubs'],['links','/api/club-kits']]) {
    assert.deepEqual(after[field], await get(route));
  }
  const stale = await fetch(`${base}/api/clubs/c1/history`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision: during.clubs.find((club) => club.id === 'c1').revision, titles: ['t4'] }),
  });
  assert.equal(stale.status, 409);
  assert.deepEqual((await get('/api/shared')).history.find((item) => item.clubId === 'c1').titles, ['t1']);
});
