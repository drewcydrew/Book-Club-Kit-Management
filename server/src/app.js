const express = require('express');
const { errorHandler } = require('./http');
const { authenticate, provisionPerson } = require('./auth');

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
  response.set('Access-Control-Allow-Headers', 'Content-Type, If-Match, Authorization');
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
