const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

class SwitchingPool extends EventEmitter {
  constructor() {
    super();
    this.next = 0;
    this.backends = [{ session: 'stale-first' }, { session: 'stale-second' }];
  }

  async connect() {
    const pool = this;
    let active;
    return {
      async query(sql, values) {
        if (sql.startsWith('BEGIN')) {
          active = { session: pool.backends[pool.next++ % pool.backends.length].session, local: undefined };
          return {};
        }
        if (sql === 'COMMIT' || sql === 'ROLLBACK') {
          active = undefined;
          return {};
        }
        const backend = active || pool.backends[pool.next++ % pool.backends.length];
        if (sql.startsWith('SELECT set_config')) {
          if (sql.includes(', true)')) backend.local = values[0];
          else backend.session = values[0];
          return {};
        }
        if (sql.startsWith('SELECT pg_advisory_xact_lock')) return { rows: [] };
        if (sql === 'SELECT 1 FROM library_services WHERE id=$1') return { rowCount: 1, rows: [{}] };
        if (sql === 'FAIL') throw new Error('test failure');
        return { rows: [{ scope: backend.local === undefined ? backend.session : backend.local }] };
      },
      release() {},
    };
  }

  async end() {}
}

const pg = require('pg');
const originalPool = pg.Pool;
pg.Pool = SwitchingPool;
const { getPool, withLibraryService, withTransaction } = require('../src/db');
pg.Pool = originalPool;

test('service context stays local to each transaction with backend switching', async (t) => {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgresql://test@localhost/test';
  const pool = getPool();
  t.after(async () => {
    await pool.end();
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  });

  const scope = async () => (await pool.query('SCOPE')).rows[0].scope;
  assert.equal(await withLibraryService('first', scope), 'first');
  assert.equal(await withLibraryService('second', scope), 'second');
  assert.equal(await scope(), '');
  const parallel = await Promise.all(Array.from({ length: 10 }, (_, index) =>
    withLibraryService(index % 2 ? 'second' : 'first', scope)));
  assert.deepEqual(parallel, Array.from({ length: 10 }, (_, index) => index % 2 ? 'second' : 'first'));

  await assert.rejects(withLibraryService('first', () => withTransaction(async (client) => {
    assert.equal((await client.query('SCOPE')).rows[0].scope, 'first');
    await client.query('FAIL');
  })), /test failure/);
  assert.equal(await withLibraryService('second', scope), 'second');
  assert.equal(await scope(), '');
});
