const fs = require('node:fs/promises');
const path = require('node:path');
const { getPool } = require('./db');

async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(180313021)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const files = (await fs.readdir(path.join(__dirname, '..', 'migrations'))).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
    for (const name of files) {
      const applied = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
      if (applied.rowCount) continue;
      const sql = await fs.readFile(path.join(__dirname, '..', 'migrations', name), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  (async () => {
    const pool = getPool();
    try { await migrate(pool); console.log('Migrations complete.'); }
    finally { await pool.end(); }
  })().catch((error) => { console.error('Migration failed:', error.code === 'P0001' && error.message.startsWith('Unrecognized club cadence values:') ? error.message : error.code || (error.message.startsWith('DATABASE_URL') ? error.message : 'unknown')); process.exitCode = 1; });
}

module.exports = { migrate };
