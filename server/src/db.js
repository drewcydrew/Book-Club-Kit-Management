const { Pool } = require('pg');

let pool;

function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  try {
    const url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname || url.pathname === '/') throw new Error();
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
  }
  pool = new Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000 });
  pool.on('error', (error) => console.error('Idle database connection failed:', error.code || 'unknown'));
  return pool;
}

module.exports = { getPool };
