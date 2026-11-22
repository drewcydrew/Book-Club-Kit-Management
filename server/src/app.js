const express = require('express');
const { errorHandler } = require('./http');
const { authenticate, provisionPerson } = require('./auth');
const { getPool, withLibraryService, withTransaction } = require('./db');
const { HttpError, object, text } = require('./http');
const { randomUUID } = require('node:crypto');

function createApp(verifyToken) {
const app = express();

app.use((request, response, next) => {
  const origin = request.get('Origin');
  if (!origin) return next();
  response.vary('Origin');
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return response.status(403).json({ error: 'Origin not allowed.' });
  response.set('Access-Control-Allow-Origin', origin);
  response.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.set('Access-Control-Allow-Headers', 'Content-Type, If-Match, Authorization, X-Library-Service-Id');
  if (request.method === 'OPTIONS') return response.status(204).end();
  return next();
});
app.put('/api/cycles/:cycleId/schedule', express.json({ limit: '2mb' }));
app.post('/api/cycles/:cycleId/schedule/validate', express.json({ limit: '2mb' }));
app.use(express.json({ limit: '64kb' }));

app.get('/health', (_request, response) => {
  response.status(200).json({ status: 'ok' });
});

app.use('/api', authenticate(verifyToken));
app.use('/api', async (_request, _response, next) => {
  const result = await getPool().query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user');
  if (!result.rowCount || result.rows[0].rolsuper || result.rows[0].rolbypassrls) {
    throw new HttpError(503, 'The API database role must not bypass row-level security.');
  }
  next();
});
app.get('/api/library-services', async (_request, response) => {
  const result = await getPool().query('SELECT id,name FROM library_services ORDER BY lower(name),id');
  response.json(result.rows);
});
app.post('/api/library-services', async (request, response) => {
  const body = object(request.body);
  const name = text(body.name, 'name', true, 200);
  const branch = text(body.branch, 'branch', true, 200);
  const serviceId = randomUUID();
  const service = await withLibraryService(serviceId, () =>
    withTransaction(async (client) => {
      const created = await client.query('INSERT INTO library_services(id,name,created_by) VALUES($1,$2,$3) RETURNING id,name',
        [serviceId, name, request.auth.uid]);
      await client.query('INSERT INTO lending_settings(name,branches,loan_days,buffer_days) VALUES($1,$2,28,3)', [name, [branch]]);
      return created.rows[0];
    }));
  response.status(201).json(service);
});
app.use('/api', async (request, _response, next) => {
  if (request.method === 'GET' && request.path === '/covers') return next();
  const serviceId = request.get('X-Library-Service-Id');
  if (!serviceId || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/.test(serviceId)) {
    throw new HttpError(400, 'Select a library service.');
  }
  const found = await getPool().query('SELECT 1 FROM library_services WHERE id=$1', [serviceId]);
  if (!found.rowCount) throw new HttpError(404, 'Library service not found.');
  withLibraryService(serviceId, next);
});
app.get('/api/session', async (request, response) => {
  response.json(await provisionPerson(request.auth.uid));
});

app.use('/api/titles', require('./routes/titles'));
app.use('/api/kits', require('./routes/kits'));
app.use('/api/kit-labels', require('./routes/kit-labels'));
app.use('/api/clubs', require('./routes/clubs'));
app.use('/api', require('./routes/club-kits'));
app.use('/api', require('./routes/covers'));
app.use('/api', require('./routes/isbn-lookup'));
app.use('/api', require('./routes/isbn-search'));
app.use('/api', require('./routes/users'));
app.use('/api', require('./routes/scoped'));
app.use('/api', require('./routes/cycles').router);
app.use('/api', require('./routes/ballots').router);
app.use('/api', require('./routes/schedules'));
app.use('/api', require('./routes/settings-history'));
app.use('/api', require('./routes/circulation'));
app.use('/api', require('./routes/shared'));
app.use(errorHandler);

return app;
}

const app = createApp();
app.createApp = createApp;
module.exports = app;
