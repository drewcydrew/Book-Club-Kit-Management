const { applicationDefault, cert } = require('firebase-admin/app');
const { HttpError } = require('./http');

function parseObject(value, name) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new HttpError(503, `${name} must contain a valid JSON object.`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(503, `${name} must contain a valid JSON object.`);
  }
  return parsed;
}

function requiredString(value, name, allowWhitespace = false) {
  if (typeof value !== 'string' || !value.trim() || (!allowWhitespace && value !== value.trim())) {
    throw new HttpError(503, `${name} is missing or invalid.`);
  }
  return value;
}

function serviceField(account, snake, camel) {
  if (account[snake] !== undefined && account[camel] !== undefined && account[snake] !== account[camel]) {
    throw new HttpError(503, 'FIREBASE_SERVICE_ACCOUNT_JSON contains conflicting fields.');
  }
  return requiredString(account[snake] ?? account[camel], `FIREBASE_SERVICE_ACCOUNT_JSON ${snake}`, snake === 'private_key');
}

function firebaseOptions(env = process.env) {
  const projectIds = [];
  if (env.FIREBASE_PROJECT_ID !== undefined) {
    projectIds.push(requiredString(env.FIREBASE_PROJECT_ID, 'FIREBASE_PROJECT_ID'));
  }
  if (env.FIREBASE_PUBLIC_CONFIG_JSON !== undefined) {
    const config = parseObject(env.FIREBASE_PUBLIC_CONFIG_JSON, 'FIREBASE_PUBLIC_CONFIG_JSON');
    projectIds.push(requiredString(config.projectId, 'FIREBASE_PUBLIC_CONFIG_JSON projectId'));
  }

  let serviceAccount;
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON !== undefined) {
    const account = parseObject(env.FIREBASE_SERVICE_ACCOUNT_JSON, 'FIREBASE_SERVICE_ACCOUNT_JSON');
    serviceAccount = {
      projectId: serviceField(account, 'project_id', 'projectId'),
      clientEmail: serviceField(account, 'client_email', 'clientEmail'),
      privateKey: serviceField(account, 'private_key', 'privateKey'),
    };
    projectIds.push(serviceAccount.projectId);
  }

  if (!projectIds.length) throw new HttpError(503, 'Firebase authentication is not configured on the server.');
  if (projectIds.some((id) => id !== projectIds[0])) {
    throw new HttpError(503, 'Firebase project IDs in server configuration do not match.');
  }

  if (!serviceAccount) return { projectId: projectIds[0], credential: applicationDefault() };
  try {
    return { projectId: projectIds[0], credential: cert(serviceAccount) };
  } catch (error) {
    if (error.code !== 'app/invalid-credential') throw error;
    throw new HttpError(503, 'FIREBASE_SERVICE_ACCOUNT_JSON contains invalid credentials.');
  }
}

module.exports = { firebaseOptions };
