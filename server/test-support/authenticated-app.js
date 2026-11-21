const { HttpError } = require('../src/http');

const app = require('../src/app').createApp(async (token) => {
  if (token !== 'test-token') throw new HttpError(401, 'Invalid test token.');
  return { uid: 'test-user' };
});

function fetchAuthenticated(url, options = {}) {
  const headers = new Headers(options.headers);
  headers.set('Authorization', 'Bearer test-token');
  return globalThis.fetch(url, { ...options, headers });
}

module.exports = { app, fetchAuthenticated };
