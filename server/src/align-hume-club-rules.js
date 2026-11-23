const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { psqlEnvironment } = require('./reconcile-demo-preferences');

if (require.main === module) {
  try {
    if (process.argv.length > 2) throw new Error('Usage: npm run align-hume-club-rules');
    const env = psqlEnvironment(process.env.DATABASE_URL);
    const script = path.join(__dirname, '..', 'scripts', 'align-hume-club-rules.sql');
    const result = spawnSync('psql', ['-X', '-w', '-f', script], { env, stdio: 'inherit' });
    if (result.error) throw new Error(`Unable to run psql: ${result.error.message}`);
    if (result.signal) throw new Error(`psql terminated by signal ${result.signal}.`);
    process.exitCode = result.status;
  } catch (error) {
    console.error(`Hume club rule alignment failed: ${error.message}`);
    process.exitCode = 1;
  }
}
