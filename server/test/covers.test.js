const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');
const { normaliseIsbn } = require('../src/isbn');

test('ISBN lookup accepts valid ISBN-13 and ISBN-10 values and rejects bad checksums', () => {
  assert.equal(normaliseIsbn('978-0-306-40615-7'), '9780306406157');
  assert.equal(normaliseIsbn('0-306-40615-2'), '9780306406157');
  assert.equal(normaliseIsbn('0306406152'), '9780306406157');
  assert.equal(normaliseIsbn('080442957X'), '9780804429573');
  assert.equal(normaliseIsbn('9780306406158'), null);
  assert.equal(normaliseIsbn('0306406153'), null);
  assert.equal(normaliseIsbn(''), null);
});

async function withCoverServer(fetchStub, run, path = '/api/covers') {
  const app = require('../src/app');
  const realFetch = globalThis.fetch;
  const originalKey = process.env.ISBNDB_API_KEY;
  globalThis.fetch = (url, options) => (String(url).startsWith('http://127.0.0.1') ? realFetch(url, options) : fetchStub(url, options));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await run(`http://127.0.0.1:${server.address().port}${path}`);
  } finally {
    server.close();
    globalThis.fetch = realFetch;
    if (originalKey === undefined) delete process.env.ISBNDB_API_KEY; else process.env.ISBNDB_API_KEY = originalKey;
  }
}

test('cover preview rejects invalid ISBNs and caches ISBNdb answers', async () => {
  const calls = [];
  process.env.ISBNDB_API_KEY = 'test-key';
  const stub = async (url, options) => {
    calls.push({ url, auth: options.headers.Authorization });
    return Response.json({ book: { image: 'https://covers.example/9780306406157.jpg' } });
  };
  await withCoverServer(stub, async (base) => {
    assert.equal((await fetch(`${base}?isbn=123`)).status, 400);
    assert.equal((await fetch(`${base}`)).status, 400);
    const first = await fetch(`${base}?isbn=0-306-40615-2`);
    assert.deepEqual(await first.json(), { imageUrl: 'https://covers.example/9780306406157.jpg' });
    await fetch(`${base}?isbn=9780306406157`);
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api2.isbndb.com/book/9780306406157');
  assert.equal(calls[0].auth, 'test-key');
});

test('ISBN lookup maps ISBNdb fields to title details and caches the answer', async () => {
  const calls = [];
  process.env.ISBNDB_API_KEY = 'test-key';
  const stub = async (url) => {
    calls.push(url);
    return Response.json({ book: { title: ' The Lantern Garden ', authors: ['Mara Fields', 'Co Author'], pages: 312, subjects: ['Fiction', 'Mystery'], image: 'https://covers.example/a.jpg', publisher: 'Penguin Books', synopsis: 'A quiet garden.', date_published: '2015-09-08', binding: 'Paperback', language: 'eng' } });
  };
  await withCoverServer(stub, async (base) => {
    assert.equal((await fetch(`${base}?isbn=abc`)).status, 400);
    const first = await fetch(`${base}?isbn=0-306-40615-2`);
    assert.deepEqual(await first.json(), {
      title: 'The Lantern Garden',
      author: 'Mara Fields, Co Author',
      pages: 312,
      genres: 'Fiction, Mystery',
      coverUrl: 'https://covers.example/a.jpg',
      publisher: 'Penguin Books',
      synopsis: 'A quiet garden.',
      datePublished: '2015-09-08',
      binding: 'Paperback',
      language: 'eng',
    });
    await fetch(`${base}?isbn=9780306406157`);
  }, '/api/isbn-lookup');
  assert.equal(calls.length, 1);
});

test('cover preview returns no image without calling ISBNdb when no API key is set', async () => {
  let called = false;
  delete process.env.ISBNDB_API_KEY;
  await withCoverServer(async () => { called = true; return Response.json({}); }, async (base) => {
    assert.deepEqual(await (await fetch(`${base}?isbn=080442957X`)).json(), { imageUrl: null });
  });
  assert.equal(called, false);
});
