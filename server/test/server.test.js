const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
const path = require('node:path');
const test = require('node:test');
const app = require('../src/app');

const entry = path.join(__dirname, '..', 'src', 'server.js');
const testUrl = 'postgresql://test:test@127.0.0.1:5432/test';

test('health endpoint returns its JSON status and unknown routes return 404', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  const health = await fetch(`${url}/health`);
  assert.equal(health.status, 200);
  assert.match(health.headers.get('content-type'), /^application\/json/);
  assert.deepEqual(await health.json(), { status: 'ok' });
  assert.equal((await fetch(`${url}/missing`)).status, 404);
});

test('CORS permits only configured browser origins', async (t) => {
  const previous = process.env.ALLOWED_ORIGINS;
  process.env.ALLOWED_ORIGINS = 'https://example.test';
  const server = app.listen(0, '127.0.0.1');
  t.after(async () => {
    if (previous === undefined) delete process.env.ALLOWED_ORIGINS; else process.env.ALLOWED_ORIGINS = previous;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/titles`;
  const allowed = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'https://example.test' } });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://example.test');
  assert.match(allowed.headers.get('access-control-allow-headers'), /Authorization/i);
  const denied = await fetch(url, { headers: { Origin: 'https://other.test' } });
  assert.equal(denied.status, 403);
  assert.deepEqual(await denied.json(), { error: 'Origin not allowed.' });
});

test('unavailable database returns a sanitized error', async (t) => {
  const blocker = net.createServer();
  blocker.listen(0, '127.0.0.1');
  await once(blocker, 'listening');
  const port = blocker.address().port;
  await new Promise((resolve, reject) => blocker.close((error) => error ? reject(error) : resolve()));
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = `postgresql://test:secret@127.0.0.1:${port}/test`;
  const server = app.listen(0, '127.0.0.1');
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await require('../src/db').getPool().end();
    if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous;
  });
  await once(server, 'listening');
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/users`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Database unavailable.' });
});

test('entry point listens on the configured port', { timeout: 10000 }, async (t) => {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));

  const child = spawn(process.execPath, [entry], {
    env: { ...process.env, DATABASE_URL: testUrl, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await once(child, 'exit');
    }
  });
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Server exited before listening (${code}): ${stderr}`)));
    child.stdout.once('data', resolve);
  });
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('entry point rejects invalid port configuration', () => {
  for (const port of ['', '0', '65536', 'not-a-port']) {
    const result = spawnSync(process.execPath, [entry], {
      env: { ...process.env, DATABASE_URL: testUrl, PORT: port },
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /PORT must be an integer between 1 and 65535/);
  }
});

test('entry point reports port binding failures', async (t) => {
  const blocker = net.createServer();
  blocker.listen(0, '0.0.0.0');
  t.after(() => new Promise((resolve, reject) => blocker.close((error) => error ? reject(error) : resolve())));
  await once(blocker, 'listening');
  const result = spawnSync(process.execPath, [entry], {
    env: { ...process.env, DATABASE_URL: testUrl, PORT: String(blocker.address().port) },
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Server failed to start:.*EADDRINUSE/);
});
