const { spawnSync } = require('node:child_process');
const path = require('node:path');

const parameters = {
  host: 'PGHOST',
  hostaddr: 'PGHOSTADDR',
  port: 'PGPORT',
  dbname: 'PGDATABASE',
  user: 'PGUSER',
  password: 'PGPASSWORD',
  passfile: 'PGPASSFILE',
  options: 'PGOPTIONS',
  application_name: 'PGAPPNAME',
  connect_timeout: 'PGCONNECT_TIMEOUT',
  client_encoding: 'PGCLIENTENCODING',
  channel_binding: 'PGCHANNELBINDING',
  require_auth: 'PGREQUIREAUTH',
  sslmode: 'PGSSLMODE',
  sslnegotiation: 'PGSSLNEGOTIATION',
  requiressl: 'PGREQUIRESSL',
  sslcompression: 'PGSSLCOMPRESSION',
  sslcert: 'PGSSLCERT',
  sslkey: 'PGSSLKEY',
  sslcertmode: 'PGSSLCERTMODE',
  sslrootcert: 'PGSSLROOTCERT',
  sslcrl: 'PGSSLCRL',
  sslcrldir: 'PGSSLCRLDIR',
  sslsni: 'PGSSLSNI',
  ssl_min_protocol_version: 'PGSSLMINPROTOCOLVERSION',
  ssl_max_protocol_version: 'PGSSLMAXPROTOCOLVERSION',
  requirepeer: 'PGREQUIREPEER',
  gssencmode: 'PGGSSENCMODE',
  krbsrvname: 'PGKRBSRVNAME',
  gsslib: 'PGGSSLIB',
  gssdelegation: 'PGGSSDELEGATION',
  target_session_attrs: 'PGTARGETSESSIONATTRS',
  load_balance_hosts: 'PGLOADBALANCEHOSTS',
};

function psqlEnvironment(connectionString, environment = process.env) {
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  let url;
  try {
    url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname || url.pathname === '/' || url.hash) {
      throw new Error();
    }
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
  }
  const env = { ...environment };
  for (const key of ['DATABASE_URL', 'PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE', 'PGUSER', 'PGPASSWORD']) delete env[key];
  try {
    env.PGHOST = url.hostname.replace(/^\[|\]$/g, '');
    env.PGPORT = url.port || '5432';
    env.PGDATABASE = decodeURIComponent(url.pathname.slice(1));
    if (url.username) env.PGUSER = decodeURIComponent(url.username);
    if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);
  } catch {
    throw new Error('DATABASE_URL contains invalid percent encoding.');
  }
  const seen = new Set();
  for (const [key, value] of url.searchParams) {
    if (!Object.hasOwn(parameters, key)) throw new Error(`Unsupported DATABASE_URL connection parameter: ${key}.`);
    if (seen.has(key)) throw new Error(`Duplicate DATABASE_URL connection parameter: ${key}.`);
    seen.add(key);
    env[parameters[key]] = value;
  }
  for (const variable of new Set(Object.values(parameters))) {
    if (env[variable]?.includes('\0')) throw new Error('DATABASE_URL contains an invalid null byte.');
  }
  return env;
}

if (require.main === module) {
  try {
    const env = psqlEnvironment(process.env.DATABASE_URL);
    const script = path.join(__dirname, '..', 'scripts', 'reconcile-demo-preferences-2027.sql');
    const result = spawnSync('psql', ['-X', '-w', '-f', script], { env, stdio: 'inherit' });
    if (result.error) throw new Error(`Unable to run psql: ${result.error.message}`);
    if (result.signal) throw new Error(`psql terminated by signal ${result.signal}.`);
    process.exitCode = result.status;
  } catch (error) {
    console.error(`Preference reconciliation failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { psqlEnvironment };
