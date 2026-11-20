const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const test = require('node:test');
const { Pool } = require('pg');

const url = process.env.TEST_DATABASE_URL;
const enabled = Boolean(url && process.env.TEST_DATABASE_CONFIRM === 'isolated');

test('discussion notes are stored separately from title revisions', { skip: !enabled, timeout: 30000 }, async (t) => {
  const schema = `discussion_notes_${randomBytes(8).toString('hex')}`;
  const admin = new Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  process.env.DATABASE_URL = url;
  process.env.PGOPTIONS = `-c search_path=${schema}`;
  const pool = require('../src/db').getPool();
  let server;
  t.after(async () => { if (server) await new Promise((resolve) => server.close(resolve)); await pool.end(); await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end(); });
  await require('../src/migrate').migrate(pool);
  await require('../src/seed').seed(pool);
  server = require('../src/app').listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  async function req(route, method = 'GET', body) {
    const response = await fetch(base + route, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, json: response.status === 204 ? null : await response.json() };
  }

  const initial = await req('/api/titles/t1/discussion-notes');
  assert.equal(initial.status, 200);
  assert.deepEqual(initial.json, { notes: '', revision: 1 });

  const saved = await req('/api/titles/t1/discussion-notes', 'PUT', { notes: 'Ask about the ending.', revision: 1 });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.json, { notes: 'Ask about the ending.', revision: 2 });

  assert.equal((await req('/api/titles/t1/discussion-notes', 'PUT', { notes: 'Stale save', revision: 1 })).status, 409);
  assert.equal((await req('/api/titles/t1/discussion-notes', 'PUT', { notes: 'x'.repeat(4001), revision: 2 })).status, 400);
  assert.equal((await req('/api/titles/t1/discussion-notes', 'PUT', { revision: 2 })).status, 400);
  assert.equal((await req('/api/titles/missing/discussion-notes')).status, 404);
  assert.equal((await req('/api/titles/missing/discussion-notes', 'PUT', { notes: 'Nope', revision: 1 })).status, 404);

  const after = await req('/api/titles/t1/discussion-notes');
  assert.deepEqual(after.json, { notes: 'Ask about the ending.', revision: 2 });
  const title = (await req('/api/titles/t1')).json;
  assert.equal(title.revision, 1);
  assert.equal('discussionNotes' in title, false);
});
