const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { Pool } = require('pg');
const { migrate } = require('../src/migrate');
const { psqlEnvironment } = require('../src/reconcile-demo-preferences');

const url = process.env.TEST_DATABASE_URL;
const enabled = Boolean(url && process.env.TEST_DATABASE_CONFIRM === 'isolated');
const script = path.join(__dirname, '..', 'scripts', 'align-hume-club-rules.sql');

test('hume club rules preview, apply only Hume pickups and repeat safely', { skip: !enabled, timeout: 60000 }, async (t) => {
  const schema = `hume_rules_${randomBytes(8).toString('hex')}`;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hume-rules-'));
  const admin = new Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool = new Pool({ connectionString: url, options: `-c search_path=${schema} -c app.library_service_id=hume` });
  t.after(async () => { await pool.end(); await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end(); await fs.rm(directory, { recursive: true, force: true }); });
  await migrate(pool);
  await pool.query(`
    UPDATE clubs SET name = 'Seed ' || id;
    INSERT INTO clubs(id,name,branch,size,cadence,pickup,address,meeting_weekday,meeting_occurrence,pickup_weekday,pickup_occurrence) VALUES
      ('h-aqua','Aqua Book Club','Central',8,1,'pickup','',3,2,2,1),
      ('h-bites','Books & Bites','Central',8,1,'pickup','',6,1,3,2),
      ('h-fiction','Fiction Addiction','Central',8,1,'pickup','',4,2,4,4),
      ('h-untouched','Unlisted Club','Central',8,1,'pickup','',1,1,1,1);
    INSERT INTO library_services(id,name) VALUES ('other','Other');
    INSERT INTO clubs(id,name,branch,size,cadence,pickup,address,library_service_id,meeting_weekday,meeting_occurrence,pickup_weekday,pickup_occurrence)
      VALUES ('other-aqua','Aqua Book Club','Central',8,1,'pickup','','other',3,2,2,1);
  `);
  const run = (input, file = script) => spawnSync('psql', ['-X', '-w', '-f', file], {
    env: { ...psqlEnvironment(url), PGOPTIONS: `-c search_path=${schema}` },
    input: `${input}\n`, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 30000,
  });
  const clubs = async () => (await pool.query('SELECT id,library_service_id,cadence,meeting_weekday,meeting_occurrence,pickup_weekday,pickup_occurrence,revision FROM clubs ORDER BY id')).rows;
  const before = await clubs();

  const preview = run('');
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /Preview rolled back/);
  assert.match(preview.stdout, /Books & Bites.*alias: review/);
  assert.match(preview.stdout, /Fiction Addiction.*exact/);
  assert.deepEqual(await clubs(), before);

  const apply = run('APPLY');
  assert.equal(apply.status, 0, apply.stderr);
  assert.match(apply.stdout, /Changes committed/);
  const after = await clubs();
  const byId = (id) => after.find((club) => club.id === id);
  assert.deepEqual(byId('h-aqua'), { id: 'h-aqua', library_service_id: 'hume', cadence: 1, meeting_weekday: 3, meeting_occurrence: 3, pickup_weekday: 1, pickup_occurrence: 3, revision: 2 });
  assert.deepEqual(byId('h-bites'), { id: 'h-bites', library_service_id: 'hume', cadence: 1, meeting_weekday: 6, meeting_occurrence: 1, pickup_weekday: 1, pickup_occurrence: -1, revision: 2 });
  assert.deepEqual(byId('h-fiction'), { id: 'h-fiction', library_service_id: 'hume', cadence: 1.5, meeting_weekday: 4, meeting_occurrence: 2, pickup_weekday: 4, pickup_occurrence: 4, revision: 2 });
  assert.deepEqual(byId('h-untouched'), before.find((club) => club.id === 'h-untouched'));
  assert.deepEqual(byId('other-aqua'), before.find((club) => club.id === 'other-aqua'));

  const repeat = run('APPLY');
  assert.equal(repeat.status, 0, repeat.stderr);
  assert.match(repeat.stdout, /UPDATE 0/);
  assert.deepEqual(await clubs(), after);

  await pool.query("DELETE FROM schema_migrations WHERE name='020_club_pickup_rule.sql'");
  const missing = run('APPLY');
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /migrations 018 and 020 are required/);
  assert.deepEqual(await clubs(), after);
});
