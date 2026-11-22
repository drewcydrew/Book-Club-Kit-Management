const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const { Pool } = require('pg');
const { parseArgs, proposedChanges, enrichTitles } = require('../src/enrich-titles');
const { lookupBookDetailed } = require('../src/isbndb');

const databaseUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl && process.env.TEST_DATABASE_CONFIRM === 'isolated');

test('enrichment arguments and field rules protect existing data', () => {
  assert.deepEqual(parseArgs(['--dry-run', '--interval-ms=2000']), { dryRun: true, intervalMs: 2000 });
  for (const args of [['--interval-ms=0'], ['--interval-ms=abc'], ['--dry-run', '--dry-run'], ['--unknown']]) {
    assert.throws(() => parseArgs(args));
  }
  const current = { name: 'Local name', author: 'Local author', pages: 0, genres: 'Local genre',
    cover_url: null, publisher: '  ', synopsis: 'Old description', date_published: null, binding: null, language: null };
  const book = { title: 'Remote name', author: 'Remote author', pages: 123, genres: 'Remote genre',
    coverUrl: null, publisher: 'Publisher', synopsis: 'New description', datePublished: null, binding: null, language: null };
  assert.deepEqual(proposedChanges(current, book), {
    pages: { before: 0, after: 123 }, publisher: { before: '  ', after: 'Publisher' },
    synopsis: { before: 'Old description', after: 'New description' },
  });
  assert.equal(proposedChanges(current, { ...book, synopsis: null }).synopsis, undefined);
});

test('detailed ISBNdb lookup distinguishes missing books and service errors', async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.ISBNDB_API_KEY;
  process.env.ISBNDB_API_KEY = 'test-key';
  try {
    for (const [response, expected] of [
      [new Response('', { status: 404 }), 'not-found'],
      [new Response('', { status: 429 }), 'error'],
      [new Response('not json'), 'error'],
      [Response.json({ book: null }), 'error'],
    ]) {
      globalThis.fetch = async () => response;
      assert.equal((await lookupBookDetailed('9780306406157')).status, expected);
    }
    globalThis.fetch = async () => { throw new Error('private network detail'); };
    const failed = await lookupBookDetailed('9780306406157');
    assert.equal(failed.status, 'error');
    assert.doesNotMatch(failed.reason, /private|test-key/);
    globalThis.fetch = async () => Response.json({ book: { synopsis: '  Description  ', pages: 120, subjects: ['Fiction'] } });
    const found = await lookupBookDetailed('9780306406157');
    assert.equal(found.status, 'found');
    assert.equal(found.book.synopsis, 'Description');
    assert.equal(found.book.genres, 'Fiction');
    globalThis.fetch = async () => Response.json({ book: { synopsis: '<p><b>Now a</b> novel &amp; more.</p><p>Second&nbsp;paragraph &#8217;s end</p>' } });
    assert.equal((await lookupBookDetailed('9780306406157')).book.synopsis, 'Now a novel & more. Second paragraph \u2019s end');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.ISBNDB_API_KEY; else process.env.ISBNDB_API_KEY = oldKey;
  }
});

test('enrichment previews, persists, resumes and rejects concurrent changes', { skip: !enabled, timeout: 30000 }, async (t) => {
  const schema = `enrich_${randomBytes(8).toString('hex')}`;
  const admin = new Pool({ connectionString: databaseUrl });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
  t.after(async () => { await pool.end(); await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end(); });
  await require('../src/migrate').migrate(pool);
  await pool.query(`INSERT INTO titles(id,name,author,isbn,pages,genres,notes,synopsis)
    VALUES ('a','Local A','Writer','0-306-40615-2',0,'Keep genre','Keep note','Old'),
           ('b','Local B','Writer','9780306406157',42,'','',''),
           ('c','Missing','Writer','9780804429573',0,'','',''),
           ('d','Invalid','Writer','bad',0,'','',''),
           ('e','No ISBN','Writer','',0,'','','')`);
  const book = { title: 'Remote title', author: 'Remote author', pages: 123, genres: 'New genre', coverUrl: 'https://example.test/cover.jpg',
    publisher: 'Publisher', synopsis: 'New description', datePublished: '2020', binding: 'Paperback', language: 'eng' };
  const logs = [];
  let calls = [];
  const lookup = async (isbn) => { calls.push(isbn); return isbn === '9780804429573' ? { status: 'not-found' } : { status: 'found', book }; };
  const options = { lookup, wait: async () => {}, log: (message) => logs.push(message) };
  const before = (await pool.query('SELECT * FROM titles ORDER BY id')).rows;
  const preview = await enrichTitles(pool, { ...options, dryRun: true });
  assert.equal(preview.changed, 2);
  assert.deepEqual(calls, ['9780306406157', '9780804429573']);
  assert.equal(preview.notFound, 1);
  assert.equal(preview.invalidIsbn, 1);
  assert.equal(preview.missingIsbn, 1);
  assert.ok(logs.some((line) => line.includes('"before":"Old","after":"New description"')));
  assert.deepEqual((await pool.query('SELECT * FROM titles ORDER BY id')).rows, before);
  calls = [];
  const applied = await enrichTitles(pool, options);
  assert.equal(applied.changed, 2);
  const a = (await pool.query("SELECT * FROM titles WHERE id='a'")).rows[0];
  assert.equal(a.name, 'Local A');
  assert.equal(a.author, 'Writer');
  assert.equal(a.genres, 'Keep genre');
  assert.equal(a.notes, 'Keep note');
  assert.equal(a.pages, 123);
  assert.equal(a.synopsis, 'New description');
  assert.equal(a.revision, 2);
  assert.equal((await enrichTitles(pool, options)).changed, 0);
  assert.equal((await pool.query("SELECT revision FROM titles WHERE id='a'")).rows[0].revision, 2);

  let raced = false;
  const raceLookup = async () => {
    if (!raced) { raced = true; await pool.query("UPDATE titles SET notes='Concurrent',revision=revision+1 WHERE id='a'"); }
    return { status: 'found', book: { ...book, synopsis: 'Updated synopsis' } };
  };
  const conflict = await enrichTitles(pool, { ...options, lookup: raceLookup });
  assert.equal(conflict.conflicts, 1);
  assert.equal(conflict.incomplete, true);
  assert.equal((await pool.query("SELECT synopsis FROM titles WHERE id='a'")).rows[0].synopsis, 'New description');

  raced = false;
  const isbnRace = async () => {
    if (!raced) { raced = true; await pool.query("UPDATE titles SET isbn='9780804429573' WHERE id='a'"); }
    return { status: 'found', book: { ...book, synopsis: 'Another synopsis' } };
  };
  const isbnConflict = await enrichTitles(pool, { ...options, lookup: isbnRace });
  assert.equal(isbnConflict.conflicts, 1);
  assert.equal((await pool.query("SELECT synopsis FROM titles WHERE id='a'")).rows[0].synopsis, 'New description');
  await pool.query("UPDATE titles SET isbn='0-306-40615-2',revision=revision+1 WHERE id='a'");

  const stopped = await enrichTitles(pool, { ...options, lookup: async (isbn) => isbn === '9780804429573'
    ? { status: 'error', reason: 'ISBNdb returned HTTP 429.' }
    : { status: 'found', book: { ...book, synopsis: 'Latest' } } });
  assert.equal(stopped.incomplete, true);
  assert.equal(stopped.changed, 2);
  assert.equal((await pool.query("SELECT synopsis FROM titles WHERE id='a'")).rows[0].synopsis, 'Latest');
  const noSynopsis = await enrichTitles(pool, { ...options, lookup: async () => ({ status: 'found', book: { ...book, synopsis: null } }) });
  assert.ok(noSynopsis.withoutSynopsis > 0);
  assert.equal((await pool.query("SELECT synopsis FROM titles WHERE id='a'")).rows[0].synopsis, 'Latest');

  const launcher = `globalThis.fetch = async (url) => String(url).endsWith('9780804429573')
    ? new Response('', { status: process.env.MOCK_RATE_LIMIT ? 429 : 404 }) : Response.json({ book: { synopsis: 'CLI synopsis' } });
    require('node:module').runMain();`;
  const runCli = (rateLimit, ...args) => spawnSync(process.execPath, ['-e', launcher, path.join(__dirname, '..', 'src', 'enrich-titles.js'), '--interval-ms=1000', ...args], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: databaseUrl, PGOPTIONS: `-c search_path=${schema}`, ISBNDB_API_KEY: 'test-key', MOCK_RATE_LIMIT: rateLimit ? '1' : '' },
    encoding: 'utf8',
  });
  const cliPreview = runCli(false, '--dry-run');
  assert.equal(cliPreview.status, 0, cliPreview.stderr);
  assert.match(cliPreview.stdout, /Would update a/);
  assert.equal((await pool.query("SELECT synopsis FROM titles WHERE id='a'")).rows[0].synopsis, 'Latest');
  const cliApply = runCli(false);
  assert.equal(cliApply.status, 0, cliApply.stderr);
  assert.equal((await pool.query("SELECT synopsis FROM titles WHERE id='a'")).rows[0].synopsis, 'CLI synopsis');
  const cliRateLimited = runCli(true);
  assert.equal(cliRateLimited.status, 1);
  assert.match(cliRateLimited.stdout, /HTTP 429/);
  assert.match(cliRateLimited.stdout, /"incomplete":true/);
});
