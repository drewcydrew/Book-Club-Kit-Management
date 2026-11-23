// Runs callback inside a transaction scoped to one library service, so row-level security applies.
// The shared advisory lock matches the write lock taken by withTransaction in db.js.
async function inService(pool, serviceId, callback) {
  const client = await pool.connect();
  let failed = false;
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.library_service_id', $1, true)", [serviceId]);
    await client.query('SELECT pg_advisory_xact_lock_shared(180313023, hashtext($1))', [serviceId]);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    failed = true;
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release(failed);
  }
}

module.exports = { inService };
