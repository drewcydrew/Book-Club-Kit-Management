const { applicationDefault, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { randomUUID } = require('node:crypto');
const { getPool } = require('./db');
const { HttpError } = require('./http');
const { transaction } = require('./routes/workflow-util');

async function verifyToken(token) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new HttpError(503, 'Firebase authentication is not configured on the server.');
  try {
    const app = getApps().find((item) => item.name === 'book-club-auth') ||
      initializeApp({ credential: applicationDefault(), projectId }, 'book-club-auth');
    return await getAuth(app).verifyIdToken(token, true);
  } catch (error) {
    if (['auth/argument-error', 'auth/id-token-expired', 'auth/id-token-revoked',
      'auth/invalid-id-token', 'auth/user-disabled', 'auth/user-not-found'].includes(error.code)) {
      throw new HttpError(401, 'Your session is invalid or expired. Sign in again.');
    }
    console.error('Firebase verification failed:', error.code || 'unknown');
    throw new HttpError(503, 'Unable to verify your session. Try again later.');
  }
}

function isPublicRoute(method, path) {
  if (method === 'GET') return [
    /^\/users$/i,
    /^\/users\/[^/]+\/views\/(?:home|preferences|schedule)$/i,
    /^\/users\/[^/]+\/enrolment$/i,
    /^\/users\/[^/]+\/clubs\/[^/]+\/cycles\/[^/]+\/review$/i,
    /^\/club-schedules(?:\/[^/]+)?$/i,
    /^\/covers$/i,
    /^\/titles\/[^/]+\/discussion-notes$/i,
  ].some((pattern) => pattern.test(path));
  if (method === 'PUT' || method === 'DELETE') {
    if (/^\/users\/[^/]+\/clubs\/[^/]+$/i.test(path)) return true;
    if (method === 'PUT' && /^\/cycles\/[^/]+\/clubs\/[^/]+\/ballots\/[^/]+$/i.test(path)) return true;
    if (method === 'PUT' && /^\/cycles\/[^/]+\/clubs\/[^/]+\/ranking$/i.test(path)) return true;
  }
  return false;
}

function authenticate(verify = verifyToken) {
  return async (req, _res, next) => {
    const header = req.get('Authorization');
    if (header) {
      const match = /^Bearer ([^\s]+)$/i.exec(header);
      if (!match) throw new HttpError(401, 'A valid bearer token is required.');
      req.auth = await verify(match[1]);
    } else if (!isPublicRoute(req.method, req.path.replace(/\/+$/, '') || '/')) {
      throw new HttpError(401, 'Sign in to perform this action.');
    }
    next();
  };
}

async function requireDemoMember(personId, client = getPool()) {
  const result = await client.query("SELECT 1 FROM people WHERE id=$1 AND role='member'", [personId]);
  if (!result.rowCount) throw new HttpError(403, 'This demo action requires a member.');
}

async function provisionPerson(uid) {
  return transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [uid]);
    const existing = await client.query(`SELECT p.id,p.name,p.role,p.revision,true AS "firebaseManaged"
      FROM firebase_identities f JOIN people p ON p.id=f.person_id WHERE f.uid=$1`, [uid]);
    if (existing.rowCount) return existing.rows[0];
    const personId = randomUUID();
    const result = await client.query(`INSERT INTO people(id,name,role) VALUES($1,'Firebase administrator','admin')
      RETURNING id,name,role,revision,true AS "firebaseManaged"`, [personId]);
    await client.query('INSERT INTO firebase_identities(uid,person_id) VALUES($1,$2)', [uid, personId]);
    return result.rows[0];
  });
}

module.exports = { authenticate, isPublicRoute, provisionPerson, requireDemoMember };
