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
const script = path.join(__dirname, '..', 'scripts', 'reconcile-club-meeting-rules.sql');

test('club meeting rules preview, safely apply and repeat without changing schedules', { skip: !enabled, timeout: 60000 }, async (t) => {
  const schema = `club_rules_${randomBytes(8).toString('hex')}`;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'club-rules-'));
  const admin = new Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
  t.after(async () => { await pool.end(); await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end(); await fs.rm(directory, { recursive: true, force: true }); });
  await migrate(pool);
  await pool.query(`
    INSERT INTO clubs(id,name,branch,size,cadence,pickup,address) VALUES
      ('duplicate-attwood','ATTWOOD BOOK LOVERS','Central',8,1,'pickup',''),
      ('outside','Outside Club','Central',8,1,'pickup','');
    UPDATE clubs SET meeting_weekday=2, meeting_occurrence=4 WHERE id='club-027';
    UPDATE clubs SET meeting_weekday=5, meeting_occurrence=4 WHERE id='club-009';
    INSERT INTO cycles(id,name,deadline,starts_on,ends_on,status)
      VALUES ('rules-cycle','Rules','2026-12-01','2027-01-01','2027-01-31','collecting');
    INSERT INTO titles(id,name,author,isbn,pages) VALUES ('rules-title','Title','Author','',0);
    INSERT INTO kits(id,title_id,branch,copies,extras) VALUES ('rules-kit','rules-title','Central',1,'');
    INSERT INTO meeting_slots(id,cycle_id,club_id,month,meeting)
      VALUES ('rules-slot','rules-cycle','club-002','2027-01','2027-01-22');
    INSERT INTO schedule_assignments(id,cycle_id,slot_id,club_id,kit_id,ready,meeting,due,locked)
      VALUES ('rules-assignment','rules-cycle','rules-slot','club-002','rules-kit','2027-01-01','2027-01-22','2027-01-29',true);
  `);
  const run = (input, file = script) => spawnSync('psql', ['-X', '-w', '-f', file], {
    env: { ...psqlEnvironment(url), PGOPTIONS: `-c search_path=${schema}` },
    input: `${input}\n`, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 30000,
  });
  const clubs = async () => (await pool.query('SELECT id,cadence,meeting_weekday,meeting_occurrence,revision FROM clubs ORDER BY id')).rows;
  const schedules = async () => ({
    slots: (await pool.query('SELECT * FROM meeting_slots ORDER BY id')).rows,
    assignments: (await pool.query('SELECT * FROM schedule_assignments ORDER BY id')).rows,
  });
  const before = await clubs();
  const scheduleBefore = await schedules();

  const preview = run('');
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /Preview rolled back/);
  assert.match(preview.stdout, /Attwood Book Lovers.*ambiguous/);
  assert.match(preview.stdout, /Page Turners.*alias: review.*occurrence retained/);
  assert.match(preview.stdout, /Beauties & The Beast.*weekday and occurrence retained/);
  assert.match(preview.stdout, /Pickup and return rules below are reported only/);
  assert.match(preview.stdout, /2027-01-01/);
  assert.match(preview.stdout, /\(43 rows\)/);
  assert.deepEqual(await clubs(), before);
  assert.deepEqual(await schedules(), scheduleBefore);

  await pool.query(`CREATE FUNCTION fail_club_rules() RETURNS trigger LANGUAGE plpgsql
    AS $$ BEGIN RAISE EXCEPTION 'intentional rollback'; END $$`);
  await pool.query('CREATE TRIGGER fail_club_rules BEFORE UPDATE ON clubs FOR EACH ROW EXECUTE FUNCTION fail_club_rules()');
  const failed = run('APPLY');
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /intentional rollback/);
  assert.deepEqual(await clubs(), before);
  await pool.query('DROP TRIGGER fail_club_rules ON clubs');
  await pool.query('DROP FUNCTION fail_club_rules()');

  const apply = run('APPLY');
  assert.equal(apply.status, 0, apply.stderr);
  assert.match(apply.stdout, /Changes committed/);
  const after = await clubs();
  const byId = (id) => after.find((club) => club.id === id);
  assert.deepEqual(byId('club-002'), { id: 'club-002', cadence: 1, meeting_weekday: 5, meeting_occurrence: -1, revision: 2 });
  assert.deepEqual(byId('club-027'), { id: 'club-027', cadence: 2, meeting_weekday: 4, meeting_occurrence: 4, revision: 2 });
  assert.deepEqual(byId('club-009'), { id: 'club-009', cadence: 2, meeting_weekday: 5, meeting_occurrence: 4, revision: 2 });
  assert.deepEqual(byId('club-004'), before.find((club) => club.id === 'club-004'));
  assert.deepEqual(byId('duplicate-attwood'), before.find((club) => club.id === 'duplicate-attwood'));
  assert.deepEqual(byId('outside'), before.find((club) => club.id === 'outside'));
  assert.deepEqual(await schedules(), scheduleBefore);

  const repeat = run('APPLY');
  assert.equal(repeat.status, 0, repeat.stderr);
  assert.match(repeat.stdout, /UPDATE 0/);
  assert.deepEqual(await clubs(), after);
  assert.deepEqual(await schedules(), scheduleBefore);

  const fixture = path.join(directory, 'collision.sql');
  const source = (await fs.readFile(script, 'utf8')).replace(/\r\n/g, '\n');
  assert.ok(source.includes('INSERT INTO club_aliases VALUES\n'));
  await fs.writeFile(fixture, source.replace('INSERT INTO club_aliases VALUES\n',
    "INSERT INTO club_aliases VALUES\n  ('Open Books', 'Night readers'),\n"));
  const collision = run('APPLY', fixture);
  assert.equal(collision.status, 0, collision.stderr);
  assert.match(collision.stdout, /Open Books.*multiple source clubs/);
  assert.match(collision.stdout, /Night Readers.*multiple source clubs/);
  assert.deepEqual(await clubs(), after);

  await pool.query("DELETE FROM schema_migrations WHERE name='014_club_meeting_rule.sql'");
  const missing = run('APPLY');
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /migrations 013 and 014 are required/);
  assert.deepEqual(await clubs(), after);
});
