const express = require('express');
const { errorHandler } = require('./http');

const app = express();

app.use((request, response, next) => {
  const origin = request.get('Origin');
  if (!origin) return next();
  response.vary('Origin');
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return response.status(403).json({ error: 'Origin not allowed.' });
  response.set('Access-Control-Allow-Origin', origin);
  response.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.set('Access-Control-Allow-Headers', 'Content-Type, If-Match');
  if (request.method === 'OPTIONS') return response.status(204).end();
  return next();
});
app.use(express.json({ limit: '64kb' }));

app.get('/health', (_request, response) => {
  response.status(200).json({ status: 'ok' });
});

app.use('/api/titles', require('./routes/titles'));
app.use('/api/kits', require('./routes/kits'));
app.use('/api/clubs', require('./routes/clubs'));
app.use('/api', require('./routes/club-kits'));
app.use('/api', require('./routes/users'));
app.use('/api', require('./routes/cycles').router);
app.use('/api', require('./routes/ballots').router);
app.use('/api', require('./routes/schedules'));
app.use('/api', require('./routes/settings-history'));
app.use('/api', require('./routes/circulation'));
app.use('/api', require('./routes/shared'));
app.use(errorHandler);

module.exports = app;
