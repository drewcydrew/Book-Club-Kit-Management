const { Pool } = require('pg');
const { AsyncLocalStorage } = require('node:async_hooks');
const { HttpError } = require('./http');

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
  pool = {
    connect: () => rawPool.connect(),
    async query(...args) {
      return withTransaction((client) => client.query(...args));
    },
    end: () => rawPool.end(),
  };
  return pool;
}

async function withTransaction(callback, { readOnly = false, exclusiveService = false, allowMissingService = false } = {}) {
  const serviceId = libraryContext.getStore() || '';
  const client = await getPool().connect();
  let started = false;
  let discard = false;
  try {
    await client.query(readOnly && serviceId ? 'BEGIN READ ONLY' :
      readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
    started = true;
    await client.query("SELECT set_config('app.library_service_id', $1, true)", [serviceId]);
    if (serviceId) {
      // Scoped reads take the exclusive lock so READ COMMITTED sees deletion before
      // checking existence, while multi-query views remain stable against writers.
      await client.query(`SELECT pg_advisory_xact_lock${exclusiveService || readOnly ? '' : '_shared'}(180313023, hashtext($1))`, [serviceId]);
      if (!allowMissingService && !(await client.query('SELECT 1 FROM library_services WHERE id=$1', [serviceId])).rowCount) {
        throw new HttpError(404, 'Library service not found.');
      }
    }
    const result = await callback(client);
    await client.query('COMMIT');
    started = false;
    return result;
  } catch (error) {
    if (started) {
      try { await client.query('ROLLBACK'); }
      catch (rollbackError) {
        discard = true;
        console.error('Database rollback failed:', rollbackError.code || 'unknown');
      }
    } else {
      discard = true;
    }
    throw error;
  } finally {
    client.release(discard);
  }
}

module.exports = { getPool, withLibraryService, withTransaction };
