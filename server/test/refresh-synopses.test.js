const test = require('node:test');
const assert = require('node:assert/strict');
const { refreshSynopses } = require('../src/refresh-synopses');

function fakePool({ titles = [] }) {
  const updates = [];
  const client = {
    async query(sql, params = []) {
      if (/FROM titles/.test(sql)) return { rows: titles };
      if (/^UPDATE titles/.test(sql)) {
        updates.push({ params });
        return { rowCount: 1, rows: [{ id: params[1] }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  return {
    updates,
    async query(sql) {
      if (/FROM library_services/.test(sql)) return { rows: [{ id: 'hume' }] };
      throw new Error(`unexpected pool query: ${sql}`);
    },
    async connect() { return client; },
  };
}

const quiet = { log: () => {}, wait: async () => {}, intervalMs: 0 };

test('refreshSynopses writes differing ISBNdb synopses and counts unchanged titles', async () => {
  const pool = fakePool({
    titles: [
      { id: 't1', revision: 2, isbn: '9780306406157', synopsis: 'Old text.' },
      { id: 't2', revision: 5, isbn: '9780306406157', synopsis: '<p>Same</p>' },
    ],
  });
  const summary = await refreshSynopses(pool, {
    ...quiet,
    lookup: async () => ({ status: 'found', book: { synopsis: '<p>Same</p>' } }),
  });
  assert.equal(summary.changed, 1);
  assert.equal(summary.unchanged, 1);
  assert.equal(summary.lookups, 1);
  assert.deepEqual(pool.updates.map((u) => u.params), [['<p>Same</p>', 't1', 2, 'hume']]);
});

test('refreshSynopses keeps stored text for missing ISBNs and ISBNdb misses', async () => {
  const pool = fakePool({
    titles: [
      { id: 't1', revision: 1, isbn: null, synopsis: 'Keep me.' },
      { id: 't2', revision: 1, isbn: '9780306406157', synopsis: 'Keep me too.' },
    ],
  });
  const summary = await refreshSynopses(pool, {
    ...quiet,
    lookup: async () => ({ status: 'not-found' }),
  });
  assert.equal(summary.noIsbn, 1);
  assert.equal(summary.notFound, 1);
  assert.equal(summary.unchanged, 2);
  assert.equal(pool.updates.length, 0);
});

test('refreshSynopses dry run reports changes without writing', async () => {
  const pool = fakePool({
    titles: [{ id: 't1', revision: 1, isbn: '9780306406157', synopsis: 'Old.' }],
  });
  const summary = await refreshSynopses(pool, {
    ...quiet,
    dryRun: true,
    lookup: async () => ({ status: 'found', book: { synopsis: '<p>New</p>' } }),
  });
  assert.equal(summary.changed, 1);
  assert.equal(pool.updates.length, 0);
});

test('refreshSynopses stops and marks the run incomplete on an ISBNdb error', async () => {
  const pool = fakePool({
    titles: [
      { id: 't1', revision: 1, isbn: '9780306406157', synopsis: 'A' },
      { id: 't2', revision: 1, isbn: '9780140449136', synopsis: 'B' },
    ],
  });
  const summary = await refreshSynopses(pool, {
    ...quiet,
    lookup: async () => ({ status: 'error', reason: 'rate limited' }),
  });
  assert.equal(summary.incomplete, true);
  assert.equal(summary.changed, 0);
  assert.equal(pool.updates.length, 0);
});
