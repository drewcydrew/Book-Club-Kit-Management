const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanSynopses, replacementFor } = require('../src/clean-synopses');

function fakePool({ services = ['hume'], titles = [] }) {
  const updates = [];
  const statements = [];
  const client = {
    async query(sql, params = []) {
      statements.push(sql);
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
    statements,
    async query(sql) {
      if (/FROM library_services/.test(sql)) return { rows: services.map((id) => ({ id })) };
      throw new Error(`unexpected pool query: ${sql}`);
    },
    async connect() { return client; },
  };
}

const quiet = { log: () => {}, wait: async () => {}, intervalMs: 0 };

test('replacementFor leaves formatted synopses alone and formats older markup', () => {
  const formatted = { synopsis: '<p><b>NOW A</b></p><p>novel</p>' };
  assert.deepEqual(replacementFor(formatted, { synopsis: 'From ISBNdb.' }), { value: 'From ISBNdb.', source: 'isbndb' });
  assert.equal(replacementFor(formatted, null), null);
  assert.equal(replacementFor({ synopsis: '<p>Plain text.</p>' }, null), null);
  assert.deepEqual(replacementFor({ synopsis: '<div>Old <i>text</i></div>' }, null), { value: '<p>Old text</p>', source: 'local' });
});

test('cleanSynopses updates markup titles with revision and service checks', async () => {
  const pool = fakePool({
    titles: [{ id: 't1', revision: 3, isbn: '9780306406157', synopsis: '<p>Hi</p>' }],
  });
  const summary = await cleanSynopses(pool, {
    ...quiet,
    lookup: async () => ({ status: 'found', book: { synopsis: 'Hi there.' } }),
  });
  assert.equal(summary.changed, 1);
  assert.deepEqual(pool.updates[0].params, ['Hi there.', 't1', 3, 'hume']);
});

test('cleanSynopses stops and marks the run incomplete on an ISBNdb error', async () => {
  const pool = fakePool({
    titles: [
      { id: 't1', revision: 1, isbn: '9780306406157', synopsis: '<p>A</p>' },
      { id: 't2', revision: 1, isbn: '9780140449136', synopsis: '<p>B</p>' },
    ],
  });
  const summary = await cleanSynopses(pool, {
    ...quiet,
    lookup: async () => ({ status: 'error', reason: 'rate limited' }),
  });
  assert.equal(summary.incomplete, true);
  assert.equal(summary.changed, 0);
  assert.equal(pool.updates.length, 0);
});
