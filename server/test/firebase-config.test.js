const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const { once } = require('node:events');
const test = require('node:test');
const express = require('express');
const { applicationDefault, deleteApp, getApps } = require('firebase-admin/app');
const { firebaseOptions } = require('../src/firebase-config');
const { authenticate } = require('../src/auth');
const { errorHandler } = require('../src/http');

const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
const account = { project_id: 'demo-book-club-auth', client_email: 'test@example.test', private_key: privateKey };
const accountJson = JSON.stringify(account);
const publicJson = JSON.stringify({ projectId: account.project_id, apiKey: 'public-test-key', measurementId: 'ignored' });

test('Firebase JSON configuration initializes service credentials and derives the project ID', () => {
  const options = firebaseOptions({
    FIREBASE_PUBLIC_CONFIG_JSON: publicJson,
    FIREBASE_SERVICE_ACCOUNT_JSON: accountJson,
    FIREBASE_PROJECT_ID: account.project_id,
  });
  assert.equal(options.projectId, account.project_id);
  assert.equal(options.credential.projectId, account.project_id);
  assert.equal(options.credential.clientEmail, account.client_email);
  assert.equal(firebaseOptions({ FIREBASE_SERVICE_ACCOUNT_JSON: accountJson }).projectId, account.project_id);
  const camel = JSON.stringify({ projectId: account.project_id, clientEmail: account.client_email, privateKey });
  assert.equal(firebaseOptions({ FIREBASE_SERVICE_ACCOUNT_JSON: camel }).projectId, account.project_id);
});

test('Firebase configuration preserves ADC when service-account JSON is absent', () => {
  const explicit = firebaseOptions({ FIREBASE_PROJECT_ID: account.project_id });
  assert.equal(explicit.projectId, account.project_id);
  assert.equal(explicit.credential, applicationDefault());
  const publicConfig = firebaseOptions({ FIREBASE_PUBLIC_CONFIG_JSON: publicJson });
  assert.equal(publicConfig.projectId, account.project_id);
  assert.equal(publicConfig.credential, applicationDefault());
});

test('invalid or conflicting Firebase configuration fails closed without disclosing secrets', () => {
  const secret = 'DO-NOT-DISCLOSE-PRIVATE-KEY';
  const invalidCases = [
    {},
    { FIREBASE_PROJECT_ID: account.project_id, FIREBASE_PUBLIC_CONFIG_JSON: '{' },
    { FIREBASE_PUBLIC_CONFIG_JSON: '[]' },
    { FIREBASE_PUBLIC_CONFIG_JSON: '{}' },
    { FIREBASE_PROJECT_ID: account.project_id, FIREBASE_SERVICE_ACCOUNT_JSON: '' },
    { FIREBASE_PROJECT_ID: account.project_id, FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ ...account, private_key: secret }) },
    { FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: account.project_id }) },
    { FIREBASE_PUBLIC_CONFIG_JSON: JSON.stringify({ projectId: 'other-project' }), FIREBASE_SERVICE_ACCOUNT_JSON: accountJson },
    { FIREBASE_PROJECT_ID: 'other-project', FIREBASE_SERVICE_ACCOUNT_JSON: accountJson },
    { FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ ...account, projectId: 'other-project' }) },
  ];
  for (const env of invalidCases) {
    assert.throws(() => firebaseOptions(env), (error) => {
      assert.equal(error.status, 503);
      assert.ok(!error.message.includes(secret));
      assert.ok(!error.message.includes(privateKey));
      assert.ok(!error.message.includes(accountJson));
      return true;
    });
  }
});

test('bad supplied service credentials return 503 rather than silently using ADC', async (t) => {
  const names = ['FIREBASE_PROJECT_ID', 'FIREBASE_PUBLIC_CONFIG_JSON', 'FIREBASE_SERVICE_ACCOUNT_JSON'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  process.env.FIREBASE_PROJECT_ID = account.project_id;
  const secret = 'PRIVATE-KEY-SENTINEL';
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({ ...account, private_key: secret });
  const app = express();
  app.use(authenticate());
  app.get('/private', (_req, res) => res.sendStatus(200));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
    }
    const firebaseApp = getApps().find((item) => item.name === 'book-club-auth');
    if (firebaseApp) await deleteApp(firebaseApp);
  });
  const url = `http://127.0.0.1:${server.address().port}/private`;
  const options = { headers: { Authorization: 'Bearer not-a-token' } };
  const failure = await fetch(url, options);
  assert.equal(failure.status, 503);
  assert.equal((await failure.json()).error, 'FIREBASE_SERVICE_ACCOUNT_JSON contains invalid credentials.');
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = accountJson;
  assert.equal((await fetch(url, options)).status, 401);
});

test('Firebase emulator verifies a signed-in user using service-account JSON', {
  skip: !process.env.TEST_FIREBASE_AUTH_EMULATOR_HOST,
}, async (t) => {
  const host = process.env.TEST_FIREBASE_AUTH_EMULATOR_HOST;
  assert.match(host, /^127\.0\.0\.1:\d+$/);
  const names = ['FIREBASE_PROJECT_ID', 'FIREBASE_PUBLIC_CONFIG_JSON', 'FIREBASE_SERVICE_ACCOUNT_JSON', 'FIREBASE_AUTH_EMULATOR_HOST'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  delete process.env.FIREBASE_PROJECT_ID;
  process.env.FIREBASE_PUBLIC_CONFIG_JSON = publicJson;
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = accountJson;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = host;
  const app = express();
  app.use(authenticate());
  app.get('/private', (req, res) => res.json({ uid: req.auth.uid }));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    const firebaseApp = getApps().find((item) => item.name === 'book-club-auth');
    if (firebaseApp) await deleteApp(firebaseApp);
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
    }
  });
  const signup = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `test-${Date.now()}@example.test`, password: 'fictional-test-password', returnSecureToken: true }),
  });
  assert.equal(signup.status, 200);
  const { idToken, localId } = await signup.json();
  const url = `http://127.0.0.1:${server.address().port}/private`;
  assert.equal((await fetch(url)).status, 401);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { uid: localId });
});
