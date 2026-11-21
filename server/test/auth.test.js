const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');
const express = require('express');
const { authenticate, isPublicRoute, requireDemoMember } = require('../src/auth');
const { HttpError, errorHandler } = require('../src/http');

test('only explicit member and public routes bypass authentication', () => {
  for (const [method, path] of [
    ['GET', '/users'], ['GET', '/users/p3/views/preferences'], ['GET', '/club-schedules/c1'],
    ['PUT', '/users/p3/clubs/c1'], ['PUT', '/cycles/c1/clubs/c2/ballots/p3'],
    ['PUT', '/cycles/c1/clubs/c2/ranking'],
  ]) assert.equal(isPublicRoute(method, path), true, `${method} ${path}`);
  for (const [method, path] of [
    ['GET', '/session'], ['GET', '/shared'], ['GET', '/users/p1/views/admin'],
    ['GET', '/titles'], ['POST', '/titles'], ['PUT', '/settings'],
    ['PUT', '/clubs/c1/memberships/p3'], ['PUT', '/cycles/c1/schedule'],
    ['DELETE', '/users/p1'], ['POST', '/clubs/c1/deletion-preview'],
    ['PATCH', '/users/p3/clubs/c1'], ['GET', '/users/p3/views/preferences/extra'],
  ]) assert.equal(isPublicRoute(method, path), false, `${method} ${path}`);
});

test('authentication rejects missing, malformed and rejected tokens and passes verified identity', async (t) => {
  const app = express();
  app.use('/api', authenticate(async (token) => {
    if (token !== 'valid') throw new HttpError(401, 'Invalid session.');
    return { uid: 'verified-uid' };
  }));
  app.get('/api/private', (req, res) => res.json(req.auth));
  app.get('/api/users', (req, res) => res.json({ anonymous: !req.auth }));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/api/private`)).status, 401);
  assert.equal((await fetch(`${base}/api/private`, { headers: { Authorization: 'Basic valid' } })).status, 401);
  assert.equal((await fetch(`${base}/api/private`, { headers: { Authorization: 'Bearer expired' } })).status, 401);
  assert.deepEqual(await (await fetch(`${base}/api/private`, { headers: { Authorization: 'Bearer valid' } })).json(), { uid: 'verified-uid' });
  assert.deepEqual(await (await fetch(`${base}/api/users`)).json(), { anonymous: true });
  assert.equal((await fetch(`${base}/api/users`, { headers: { Authorization: 'Bearer expired' } })).status, 401);
});

test('anonymous demo actions cannot target a staff or admin person', async () => {
  const member = { query: async () => ({ rowCount: 1 }) };
  const nonMember = { query: async () => ({ rowCount: 0 }) };
  await requireDemoMember('member', member);
  await assert.rejects(requireDemoMember('admin', nonMember), (error) => error.status === 403);
});

test('Firebase verification fails closed without configuration and rejects malformed tokens', async (t) => {
  const previous = process.env.FIREBASE_PROJECT_ID;
  delete process.env.FIREBASE_PROJECT_ID;
  const app = require('../src/app');
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    if (previous === undefined) delete process.env.FIREBASE_PROJECT_ID; else process.env.FIREBASE_PROJECT_ID = previous;
    await new Promise((resolve) => server.close(resolve));
  });
  const url = `http://127.0.0.1:${server.address().port}/api/session`;
  const options = { headers: { Authorization: 'Bearer not-a-token' } };
  assert.equal((await fetch(url, options)).status, 503);
  process.env.FIREBASE_PROJECT_ID = 'test-project';
  assert.equal((await fetch(url, options)).status, 401);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const wrongProject = `${encode({ alg: 'RS256', kid: 'test' })}.${encode({ aud: 'other-project', iss: 'https://securetoken.google.com/other-project', sub: 'user' })}.c2ln`;
  assert.equal((await fetch(url, { headers: { Authorization: `Bearer ${wrongProject}` } })).status, 401);
});
