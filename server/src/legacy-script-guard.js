async function assertLegacyScriptSupported(pool) {
  const result = await pool.query("SELECT 1 FROM schema_migrations WHERE name='018_library_services.sql'");
  if (result.rowCount) {
    const error = new Error('This maintenance command does not yet support library services and cannot be run safely.');
    error.code = 'LIBRARY_SERVICES_UNSUPPORTED';
    throw error;
  }
}

module.exports = { assertLegacyScriptSupported };
