const { Pool } = require('pg');
const { AsyncLocalStorage } = require('node:async_hooks');

let pool;
const libraryContext = new AsyncLocalStorage();

function withLibraryService(id, callback) {
  return libraryContext.run(id, callback);
}

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
  const rawPool = new Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000 });
  rawPool.on('error', (error) => console.error('Idle database connection failed:', error.code || 'unknown'));
  async function connect() {
    const client = await rawPool.connect();
    try {
      await client.query("SELECT set_config('app.library_service_id', $1, false)", [libraryContext.getStore() || '']);
      return client;
    } catch (error) {
      client.release(true);
      throw error;
    }
  }
  pool = {
    connect,
    async query(...args) {
      const client = await connect();
      try { return await client.query(...args); }
      finally { client.release(); }
    },
    end: () => rawPool.end(),
  };
  return pool;
}

module.exports = { getPool, withLibraryService };
