const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { Pool } = require('pg');
const { migrate } = require('../src/migrate');
const { parseTitleList } = require('../src/import-titles');
const { parseCsv, parsePreferences, importDemoPreferences } = require('../src/import-demo-preferences');
const { psqlEnvironment } = require('../src/reconcile-demo-preferences');

const url = process.env.TEST_DATABASE_URL;
const enabled = Boolean(url && process.env.TEST_DATABASE_CONFIRM === 'isolated');
const script = path.join(__dirname, '..', 'scripts', 'reconcile-demo-preferences-2027.sql');
const runner = path.join(__dirname, '..', 'src', 'reconcile-demo-preferences.js');
const cycle = 'demo-preferences-cycle-2027';

test('reconciliation derives psql connection settings from DATABASE_URL', () => {
  const env = psqlEnvironment('postgresql://test%40user:p%40ss%2Fword@[::1]:5433/demo%2Ddb?sslmode=verify-full&channel_binding=require&options=-c+search_path%3Ddemo', {
    DATABASE_URL: 'should-not-be-forwarded', PGHOSTADDR: '127.0.0.2', PGSERVICE: 'wrong', PGUSER: 'wrong', PGPASSWORD: 'wrong',
  });
  assert.equal(env.PGHOST, '::1');
  assert.equal(env.PGPORT, '5433');
  assert.equal(env.PGDATABASE, 'demo-db');
  assert.equal(env.PGUSER, 'test@user');
  assert.equal(env.PGPASSWORD, 'p@ss/word');
  assert.equal(env.PGSSLMODE, 'verify-full');
  assert.equal(env.PGCHANNELBINDING, 'require');
  assert.equal(env.PGOPTIONS, '-c search_path=demo');
  for (const key of ['DATABASE_URL', 'PGHOSTADDR', 'PGSERVICE']) assert.equal(Object.hasOwn(env, key), false);
  assert.throws(() => psqlEnvironment(''), /DATABASE_URL is required/);
  assert.throws(() => psqlEnvironment('https://example.com/db'), /valid PostgreSQL/);
  assert.throws(() => psqlEnvironment('postgresql://host/db?unknown=value'), /Unsupported DATABASE_URL connection parameter/);
  assert.throws(() => psqlEnvironment('postgresql://host/db?sslmode=require&sslmode=disable'), /Duplicate DATABASE_URL connection parameter/);
  assert.throws(() => psqlEnvironment('postgresql://user:secret%00@host/db'), /invalid null byte/);
});

function runPsql(schema, directory, inputScript, input) {
  const connection = new URL(url);
  return spawnSync('psql', ['-X', '-w', '-f', inputScript], {
    cwd: directory,
    env: {
      ...process.env,
      PGHOST: connection.hostname, PGPORT: connection.port || '5432',
      PGUSER: decodeURIComponent(connection.username), PGPASSWORD: decodeURIComponent(connection.password),
      PGDATABASE: decodeURIComponent(connection.pathname.slice(1)),
      PGSSLMODE: connection.searchParams.get('sslmode') || 'prefer',
      PGCONNECT_TIMEOUT: '5', PGOPTIONS: `-c search_path=${schema}`,
    },
    input: `${input}\n`, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 60000,
  });
}

test('2027 reconciliation previews, applies and safely repeats partial rankings', { skip: !enabled, timeout: 120000 }, async (t) => {
  const schema = `reconcile_${randomBytes(8).toString('hex')}`;
  const admin = new Pool({ connectionString: url });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'reconcile-2027-'));
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
  t.after(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
    await fs.rm(directory, { recursive: true, force: true });
  });
  await migrate(pool);
  await pool.query(`
    INSERT INTO clubs(id,name,branch,size,cadence,pickup,address) VALUES
      ('target','Alpha Example Club','Central',10,'','pickup',''),
      ('empty','Empty Example Club','Central',10,'','pickup',''),
      ('collision','Collision Example Club','Central',10,'','pickup',''),
      ('fuzzy','Fuzzy Example Club','Central',10,'','pickup','');
    INSERT INTO people(id,name,role) VALUES
      ('a','Member A','member'),('b','Member B','member'),('c','Member C','member'),('d','Member D','member');
    INSERT INTO memberships(club_id,person_id) VALUES
      ('target','a'),('target','b'),('collision','c'),('fuzzy','d');
    INSERT INTO cycles(id,name,deadline,starts_on,ends_on,status) VALUES
      ('demo-preferences-cycle-2027','Demo preferences 2027','2026-12-15','2027-01-01','2027-12-31','collecting'),
      ('other','Other cycle','2026-12-15','2027-01-01','2027-12-31','collecting');
    INSERT INTO ballots(cycle_id,club_id,person_id) VALUES
      ('demo-preferences-cycle-2027','target','a'),('demo-preferences-cycle-2027','target','b'),
      ('demo-preferences-cycle-2027','collision','c'),('demo-preferences-cycle-2027','fuzzy','d'),('other','target','a');
    INSERT INTO titles(id,name,author,isbn,pages) VALUES
      ('one','Target One','Author A','',0),('two','Target Two','Author B','',0),
      ('keep1','Keep One','Someone','',0),('keep2','Keep Two','Someone','',0),
      ('wont','Other book','Someone','',0),('tie1','Twin','Same','',0),('tie2','Twin','Same','',0),
      ('by','A Title','Authors (edited by Someone, Editor)','',0),
      ('three','Target Three','Author C','',0);
    INSERT INTO ballot_marks(cycle_id,club_id,person_id,title_id,mark,rank) VALUES
      ('demo-preferences-cycle-2027','target','a','keep1','selected',1),
      ('demo-preferences-cycle-2027','target','a','keep2','selected',2),
      ('demo-preferences-cycle-2027','target','a','one','selected',3),
      ('demo-preferences-cycle-2027','target','a','two','read',NULL),
      ('demo-preferences-cycle-2027','target','a','wont','wont',NULL),
      ('demo-preferences-cycle-2027','target','b','keep2','selected',1),
      ('demo-preferences-cycle-2027','target','b','one','read',NULL),
      ('demo-preferences-cycle-2027','collision','c','wont','read',NULL),
      ('other','target','a','wont','read',NULL);
    INSERT INTO finalized_groups(cycle_id,club_id) VALUES
      ('demo-preferences-cycle-2027','target'),('demo-preferences-cycle-2027','collision');
    INSERT INTO finalized_rankings(cycle_id,club_id,title_id,rank) VALUES
      ('demo-preferences-cycle-2027','target','keep1',1),
      ('demo-preferences-cycle-2027','collision','wont',1);
    INSERT INTO club_history(club_id,title_id) VALUES ('target','two');
    INSERT INTO kits(id,title_id,branch,copies,extras) VALUES ('kit','two','Central',1,'');
    INSERT INTO meeting_slots(id,cycle_id,club_id,month,meeting)
      VALUES ('slot','demo-preferences-cycle-2027','target','2027-01','2027-01-15');
    INSERT INTO schedule_assignments(id,cycle_id,slot_id,club_id,kit_id,ready,meeting,due,locked)
      VALUES ('assignment','demo-preferences-cycle-2027','slot','target','kit','2027-01-01','2027-01-15','2027-01-29',false);
  `);
  const fixtureScript = path.join(directory, 'fixture.sql');
  const source = (await fs.readFile(script, 'utf8')).replace(/\r\n/g, '\n');
  const insertCommand = 'INSERT INTO source_rows (club, title, required_rank) VALUES\n';
  const dataStart = source.indexOf(insertCommand);
  assert.notEqual(dataStart, -1, 'Expected embedded ranking inserts');
  const dataEnd = source.indexOf('\n-- End embedded rankings.\n', dataStart + insertCommand.length);
  assert.notEqual(dataEnd, -1, 'Expected the end of the embedded rankings');
  const header = 'Club,Title,Required rank\n';
  const csv = '\uFEFF' + header + [
    'Alpha Example Club,Target One by Author A,2',
    'Alpha Example Club,Target Two by Author B,4',
    'Alpha Example Club,Twin by Same,5',
    'Empty Example Club,Target One by Author A,1',
    'Empty Example Club,"A Title by Authors (edited by Someone, Editor)",2',
    'Collision Example Club,Target One by Author A,1',
    'Collision Example Club,Target On by Author A,2',
    'Fuzzie Example Club,Target Thre by Author C,2',
    'Zzzzzzzzzzzzzzz,Target One by Author A,1',
  ].join('\n') + '\n';
  const run = async (input, content = csv) => {
    let inputScript = script;
    if (content !== null) {
      const literal = (value) => `E'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
      const values = parseCsv(content).map((row) => `  (${row.map(literal).join(', ')})`).join(',\n');
      const fixture = source.slice(0, dataStart + insertCommand.length)
        + `${values};\n`
        + source.slice(dataEnd + 1);
      await fs.writeFile(fixtureScript, fixture);
      inputScript = fixtureScript;
    }
    return runPsql(schema, directory, inputScript, input);
  };
  const marks = async () => (await pool.query(
    'SELECT cycle_id,club_id,person_id,title_id,mark,rank FROM ballot_marks ORDER BY cycle_id,club_id,person_id,title_id',
  )).rows;
  const original = await marks();
  const embeddedPreview = await run('', null);
  assert.equal(embeddedPreview.status, 0, embeddedPreview.stderr);
  assert.match(embeddedPreview.stdout, /INSERT 0 224/);
  assert.match(embeddedPreview.stdout, /Preview rolled back/);
  assert.match(embeddedPreview.stdout, /\b223\s*\|/);
  assert.deepEqual(await marks(), original);

  const preview = await run('');
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /Preview rolled back/);
  assert.match(preview.stdout, /tied match/);
  assert.match(preview.stdout, /weak or no match/);
  assert.match(preview.stdout, /multiple source rows map to the same database title/);
  assert.match(preview.stdout, /Empty Example Club/);
  assert.match(preview.stdout, /A Title by Authors \(edited by Someone, Editor\).*exact/);
  assert.match(preview.stdout, /Fuzzie Example Club.*fuzzy/);
  assert.match(preview.stdout, /Target Thre by Author C.*fuzzy/);
  assert.deepEqual(await marks(), original);

  await pool.query(`CREATE FUNCTION fail_reconciliation() RETURNS trigger LANGUAGE plpgsql
    AS $$ BEGIN RAISE EXCEPTION 'intentional rollback test'; END $$`);
  await pool.query('CREATE TRIGGER fail_reconciliation BEFORE INSERT ON ballot_marks FOR EACH ROW EXECUTE FUNCTION fail_reconciliation()');
  const failed = await run('APPLY');
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /intentional rollback test/);
  assert.deepEqual(await marks(), original);
  assert.equal((await pool.query('SELECT revision FROM cycles WHERE id=$1', [cycle])).rows[0].revision, 1);
  await pool.query('DROP TRIGGER fail_reconciliation ON ballot_marks');
  await pool.query('DROP FUNCTION fail_reconciliation()');

  const applied = await run('APPLY');
  assert.equal(applied.status, 0, applied.stderr);
  assert.match(applied.stdout, /Changes committed/);
  const stored = await marks();
  const ballot = (person) => stored.filter((row) => row.cycle_id === cycle && row.club_id === 'target' && row.person_id === person)
    .sort((a, b) => a.rank - b.rank).map(({ title_id, mark, rank }) => [title_id, mark, rank]);
  assert.deepEqual(ballot('a'), [['keep1', 'selected', 1], ['one', 'selected', 2], ['keep2', 'selected', 3], ['two', 'selected', 4]]);
  assert.deepEqual(ballot('b'), [['keep2', 'selected', 1], ['one', 'selected', 2], ['two', 'selected', 3]]);
  assert.deepEqual(stored.filter((row) => row.cycle_id === cycle && row.club_id === 'fuzzy')
    .map(({ title_id, mark, rank }) => [title_id, mark, rank]), [['three', 'selected', 1]]);
  assert.deepEqual(stored.filter((row) => row.club_id === 'collision' || row.cycle_id === 'other'),
    original.filter((row) => row.club_id === 'collision' || row.cycle_id === 'other'));
  assert.deepEqual((await pool.query('SELECT person_id,revision FROM ballots WHERE cycle_id=$1 ORDER BY person_id', [cycle])).rows,
    [{ person_id: 'a', revision: 2 }, { person_id: 'b', revision: 2 }, { person_id: 'c', revision: 1 }, { person_id: 'd', revision: 2 }]);
  assert.equal((await pool.query('SELECT revision FROM cycles WHERE id=$1', [cycle])).rows[0].revision, 2);
  assert.deepEqual((await pool.query('SELECT club_id FROM finalized_groups ORDER BY club_id')).rows, [{ club_id: 'collision' }]);
  assert.deepEqual((await pool.query('SELECT club_id FROM finalized_rankings ORDER BY club_id')).rows, [{ club_id: 'collision' }]);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM schedule_assignments')).rows[0].n, 1);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM club_history')).rows[0].n, 1);

  const repeat = await run('APPLY');
  assert.equal(repeat.status, 0, repeat.stderr);
  assert.deepEqual(await marks(), stored);
  assert.equal((await pool.query('SELECT revision FROM cycles WHERE id=$1', [cycle])).rows[0].revision, 2);

  const invalid = await run('APPLY', `${header}Alpha Example Club,Target One by Author A,1\nAlpha Example Club,Target Two by Author B,1\n`);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /duplicate club\/title or club\/rank/);
  assert.deepEqual(await marks(), stored);
  const badHeader = await run('APPLY', 'Wrong,Title,Required rank\nAlpha Example Club,Target One by Author A,1\n');
  assert.notEqual(badHeader.status, 0);
  assert.match(badHeader.stderr, /Expected CSV header/);
  assert.deepEqual(await marks(), stored);
});

test('embedded source reconciles the imported demo without any CSV file', { skip: !enabled, timeout: 120000 }, async (t) => {
  const schema = `embedded_${randomBytes(8).toString('hex')}`;
  const admin = new Pool({ connectionString: url });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'embedded-2027-'));
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
  t.after(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
    await fs.rm(directory, { recursive: true, force: true });
  });
  await migrate(pool);
  await pool.query("UPDATE lending_settings SET branches=ARRAY['Central'] WHERE singleton=true");
  const data = path.join(__dirname, '..', 'data');
  const catalogue = parseTitleList(await fs.readFile(path.join(data, 'titles-import.tsv'), 'utf8'));
  const input = parsePreferences(await fs.readFile(path.join(data, 'demo-preferences-2027.csv'), 'utf8'), catalogue.rows);
  await importDemoPreferences(pool, input);
  const original = (await pool.query(`
    SELECT m.cycle_id,m.club_id,m.person_id,m.title_id
    FROM ballot_marks m JOIN clubs c ON c.id=m.club_id
    WHERE m.cycle_id=$1 AND c.name='Aqua Bookclub' AND m.rank=2
  `, [cycle])).rows[0];
  assert.ok(original);
  await pool.query(`UPDATE ballot_marks SET mark='wont',rank=NULL
    WHERE cycle_id=$1 AND club_id=$2 AND person_id=$3 AND title_id=$4`,
  [original.cycle_id, original.club_id, original.person_id, original.title_id]);
  const connection = new URL(url);
  connection.searchParams.set('options', `-c search_path=${schema}`);
  const run = (input) => spawnSync(process.execPath, [runner], {
    cwd: directory,
    env: {
      ...process.env, DATABASE_URL: connection.toString(), PGHOST: 'incorrect',
      PGHOSTADDR: '127.0.0.2', PGPORT: '1', PGUSER: 'incorrect', PGPASSWORD: 'incorrect',
      PGSERVICE: 'incorrect', PGOPTIONS: '-c search_path=incorrect',
    },
    input: `${input}\n`, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 60000,
  });
  const preview = run('');
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /223\s*\|\s*223\s*\|\s*20\s*\|\s*1\s*\|\s*1/);
  assert.match(preview.stdout, /Preview rolled back/);
  const applied = run('APPLY');
  assert.equal(applied.status, 0, applied.stderr);
  assert.match(applied.stdout, /Changes committed/);
  const result = await pool.query(`SELECT mark,rank FROM ballot_marks
    WHERE cycle_id=$1 AND club_id=$2 AND person_id=$3 AND title_id=$4`,
  [original.cycle_id, original.club_id, original.person_id, original.title_id]);
  assert.deepEqual(result.rows, [{ mark: 'selected', rank: 2 }]);
  assert.deepEqual(await fs.readdir(directory), []);
});
