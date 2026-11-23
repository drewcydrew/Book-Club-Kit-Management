const fs = require('node:fs/promises');
const path = require('node:path');
const { getPool } = require('./db');
const { inventory, compareInventory } = require('./schema-inventory');
const expected = require('./schema-repair-expected.json');

const migrations = [
  '001_shared.sql', '002_shared_workflows.sql', '003_title_covers.sql',
  '004_title_cover_url.sql', '005_import_clubs.sql', '006_title_isbndb_details.sql',
  '007_cycle_months.sql', '008_kit_labels.sql', '009_title_labels.sql',
];
const last = migrations[migrations.length - 1];
// Data-only migrations that do not change the schema this repair verifies.
const dataMigrations = ['010_demo_preferences_2027_aligned.sql', '011_demo_preferences_2028.sql', '012_demo_cycles_2027_2028.sql'];
const cadenceMigration = '013_club_cadence.sql';
const meetingRuleMigration = '014_club_meeting_rule.sql';
const cadenceOffsetMigration = '015_club_cadence_offset.sql';
const discussionNotesMigration = '016_title_discussion_notes.sql';
const firebaseMigration = '017_firebase_identities.sql';
const pickupRuleMigration = '020_club_pickup_rule.sql';
const pickupAtPreviousMeetingMigration = '021_club_pickup_at_previous_meeting.sql';

async function inspect(client, schema) {
  const actual = await inventory(client, schema);
  if (!actual.schema_migrations) {
    return { issues: ['Missing table schema_migrations.'], state: 'blocked' };
  }
  const ledger = (await client.query('SELECT name FROM schema_migrations ORDER BY name')).rows.map((row) => row.name);
  if (ledger.includes('018_library_services.sql')) {
    return { issues: ['Schema repair does not yet support library-service databases; no changes were made.'], state: 'blocked' };
  }
  const expectedSchema = structuredClone(expected);
  if (ledger.includes(cadenceMigration)) {
    expectedSchema.clubs.columns.cadence = { type: 'double precision', not_null: true, default_value: '1' };
    expectedSchema.clubs.constraints.clubs_cadence_check = { definition: 'CHECK ((cadence = ANY (ARRAY[(1)::double precision, (1.5)::double precision])))' };
  }
  if (ledger.includes(meetingRuleMigration)) {
    expectedSchema.clubs.columns.meeting_weekday = { type: 'integer', not_null: true, default_value: '1' };
    expectedSchema.clubs.columns.meeting_occurrence = { type: 'integer', not_null: true, default_value: '1' };
    expectedSchema.clubs.constraints.clubs_meeting_weekday_check = { definition: 'CHECK (((meeting_weekday >= 0) AND (meeting_weekday <= 6)))' };
    expectedSchema.clubs.constraints.clubs_meeting_occurrence_check = { definition: "CHECK ((meeting_occurrence = ANY (ARRAY[1, 2, 3, 4, '-1'::integer])))" };
  }
  if (ledger.includes(pickupRuleMigration)) {
    expectedSchema.clubs.columns.pickup_weekday = { type: 'integer', not_null: true };
    expectedSchema.clubs.columns.pickup_occurrence = { type: 'integer', not_null: true };
    expectedSchema.clubs.constraints.clubs_pickup_weekday_check = { definition: 'CHECK (((pickup_weekday >= 0) AND (pickup_weekday <= 6)))' };
    expectedSchema.clubs.constraints.clubs_pickup_occurrence_check = { definition: "CHECK ((pickup_occurrence = ANY (ARRAY[1, 2, 3, 4, '-1'::integer])))" };
  }
  if (ledger.includes(pickupAtPreviousMeetingMigration)) {
    expectedSchema.clubs.columns.pickup_at_previous_meeting = { type: 'boolean', not_null: true, default_value: 'false' };
    expectedSchema.clubs.constraints.clubs_pickup_at_previous_meeting_check = { definition: 'CHECK ((NOT pickup_at_previous_meeting OR (cadence = (1.5)::double precision)))' };
  }
  if (ledger.includes(cadenceOffsetMigration)) {
    expectedSchema.clubs.columns.cadence_offset = { type: 'integer', not_null: true, default_value: '0' };
    expectedSchema.clubs.constraints.clubs_cadence_offset_check = { definition: 'CHECK (((cadence_offset >= 0) AND (cadence_offset <= 2)))' };
  }
  if (ledger.includes(discussionNotesMigration)) {
    expectedSchema.titles.columns.discussion_notes = { type: 'text', not_null: true, default_value: "''::text" };
    expectedSchema.titles.columns.discussion_notes_revision = { type: 'integer', not_null: true, default_value: '1' };
    expectedSchema.titles.constraints.titles_discussion_notes_check = { definition: 'CHECK ((length(discussion_notes) <= 4000))' };
    expectedSchema.titles.constraints.titles_discussion_notes_revision_check = { definition: 'CHECK ((discussion_notes_revision > 0))' };
  } else {
    delete expectedSchema.titles.columns.discussion_notes;
    delete expectedSchema.titles.columns.discussion_notes_revision;
    delete expectedSchema.titles.constraints.titles_discussion_notes_check;
    delete expectedSchema.titles.constraints.titles_discussion_notes_revision_check;
  }
  if (ledger.includes(firebaseMigration)) {
    expectedSchema.firebase_identities = {
      properties: { row_security: false, force_row_security: false },
      columns: {
        person_id: { type: 'text', not_null: true, default_value: null },
        uid: { type: 'text', not_null: true, default_value: null },
      },
      constraints: {
        firebase_identities_person_id_fkey: { definition: 'FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE RESTRICT' },
        firebase_identities_person_id_key: { definition: 'UNIQUE (person_id)' },
        firebase_identities_pkey: { definition: 'PRIMARY KEY (uid)' },
      },
      indexes: {
        firebase_identities_person_id_key: { definition: 'CREATE UNIQUE INDEX firebase_identities_person_id_key ON firebase_identities USING btree (person_id)', valid: true, ready: true },
        firebase_identities_pkey: { definition: 'CREATE UNIQUE INDEX firebase_identities_pkey ON firebase_identities USING btree (uid)', valid: true, ready: true },
      },
      triggers: {},
    };
  }
  const issues = compareInventory(expectedSchema, actual, ['title_label_assignments', 'kit_label_assignments']);
  if (issues.some((item) => item.includes('schema_migrations'))) return { issues, state: 'blocked' };
  for (const name of migrations.slice(0, -1)) {
    if (!ledger.includes(name)) issues.push(`Migration ${name} is not recorded; inspect its effects before proceeding.`);
  }
  for (const name of ledger) {
    if (!name.startsWith('seed:') && !migrations.includes(name) && !dataMigrations.includes(name) && ![cadenceMigration, meetingRuleMigration, cadenceOffsetMigration, discussionNotesMigration, firebaseMigration, pickupRuleMigration, pickupAtPreviousMeetingMigration].includes(name)) issues.push(`Unknown migration ${name}; this repair cannot verify a newer or different schema.`);
  }
  const applied = ledger.includes(last);
  const titleExists = !!actual.title_label_assignments;
  const legacyExists = !!actual.kit_label_assignments;
  if (applied && !titleExists) issues.push('Migration 009 is recorded but title assignments are missing. Restore or investigate; their contents cannot be inferred safely.');
  if (!applied && titleExists) issues.push('Title assignments exist but migration 009 is not recorded. Their history is ambiguous.');
  if (!applied && !legacyExists) issues.push('Legacy kit assignments are missing. Their contents cannot be reconstructed safely.');
  if (titleExists) issues.push(...compareInventory({ title_label_assignments: expected.title_label_assignments }, actual));
  if (!applied && legacyExists) issues.push(...compareInventory({ kit_label_assignments: expected.kit_label_assignments }, actual));
  if (applied && legacyExists) {
    for (const [name, constraint] of Object.entries(actual.kit_label_assignments.constraints)) {
      if (constraint.definition.startsWith('FOREIGN KEY')) {
        issues.push(`Legacy foreign key kit_label_assignments.${name} can interfere with current operations; investigate the migration history.`);
      }
    }
  }
  if (!applied) {
    for (const [name, constraint] of Object.entries(actual.kit_label_assignments?.constraints ?? {})) {
      if (!expected.kit_label_assignments.constraints[name] && constraint.definition.startsWith('FOREIGN KEY')) {
        issues.push(`Unexpected foreign key kit_label_assignments.${name} may interfere with future deletions.`);
      }
    }
    for (const table of ['titles', 'kits']) {
      for (const [name, trigger] of Object.entries(actual[table]?.triggers ?? {})) {
        if (!expected[table].triggers[name] && trigger.enabled !== 'D') {
          issues.push(`Unexpected enabled trigger ${table}.${name} may alter data during repair.`);
        }
      }
    }
  }
  if (issues.length) return { issues, state: 'blocked' };
  if (applied) return { issues, state: 'current' };
  const counts = (await client.query(`
    SELECT (SELECT count(*)::int FROM kit_label_assignments) AS legacy_assignments,
      (SELECT count(*)::int FROM (SELECT DISTINCT k.title_id,a.label_id FROM kit_label_assignments a JOIN kits k ON k.id=a.kit_id) pairs) AS title_assignments,
      (SELECT count(*)::int FROM kit_label_assignments a LEFT JOIN kits k ON k.id=a.kit_id
        LEFT JOIN titles t ON t.id=k.title_id LEFT JOIN kit_labels l ON l.id=a.label_id
        WHERE k.id IS NULL OR t.id IS NULL OR l.id IS NULL) AS orphaned_assignments,
      (SELECT count(*)::int FROM titles WHERE revision=2147483647 AND id IN
        (SELECT k.title_id FROM kit_label_assignments a JOIN kits k ON k.id=a.kit_id)) AS full_title_revisions,
      (SELECT count(*)::int FROM kits WHERE revision=2147483647 AND title_id IN
        (SELECT k.title_id FROM kit_label_assignments a JOIN kits k ON k.id=a.kit_id)) AS full_kit_revisions`)).rows[0];
  if (counts.full_title_revisions || counts.full_kit_revisions) {
    issues.push('A title or kit revision would overflow; no changes can be applied safely.');
    return { issues, state: 'blocked' };
  }
  if (counts.orphaned_assignments) {
    issues.push(`${counts.orphaned_assignments} kit label assignments reference missing records; no changes can be applied safely.`);
    return { issues, state: 'blocked' };
  }
  return { issues, state: 'repairable', counts };
}

async function repairSchema(pool, apply = false) {
  const client = await pool.connect();
  try {
    await client.query(apply ? 'BEGIN' : 'BEGIN READ ONLY');
    if (apply) await client.query('SELECT pg_advisory_xact_lock(180313021)');
    const identity = (await client.query('SELECT current_database() AS database, current_schema() AS schema')).rows[0];
    if (!identity.schema || ['pg_catalog', 'information_schema'].includes(identity.schema)) throw new Error('No safe application schema is selected.');
    const quoted = `"${identity.schema.replace(/"/g, '""')}"`;
    await client.query(`SET LOCAL search_path TO ${quoted}, pg_catalog`);
    let report = await inspect(client, identity.schema);
    if (apply && report.state === 'repairable') {
      const tables = Object.keys(expected).filter((name) => name !== 'title_label_assignments')
        .map((name) => `"${name.replace(/"/g, '""')}"`).join(', ');
      await client.query(`LOCK TABLE ${tables} IN SHARE ROW EXCLUSIVE MODE`);
      report = await inspect(client, identity.schema);
      if (report.state === 'repairable') {
        const sql = await fs.readFile(path.join(__dirname, '..', 'repair', '009_preserve_kit_labels.sql'), 'utf8');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [last]);
        const final = await inspect(client, identity.schema);
        if (final.state !== 'current') throw new Error(`Post-repair verification failed: ${final.issues.join(' ')}`);
        const mismatch = await client.query(`
          SELECT count(*)::int AS n FROM (
            (SELECT DISTINCT k.title_id,a.label_id FROM kit_label_assignments a JOIN kits k ON k.id=a.kit_id
             EXCEPT SELECT title_id,label_id FROM title_label_assignments)
            UNION ALL
            (SELECT title_id,label_id FROM title_label_assignments
             EXCEPT SELECT DISTINCT k.title_id,a.label_id FROM kit_label_assignments a JOIN kits k ON k.id=a.kit_id)
          ) differences`);
        if (mismatch.rows[0].n) throw new Error('Post-repair label verification failed.');
        await client.query('COMMIT');
        return { ...identity, ...report, state: 'repaired' };
      }
    }
    await client.query('ROLLBACK');
    return { ...identity, ...report };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args[0] && !['--check', '--apply'].includes(args[0]))) {
      throw new Error('Usage: npm run repair-schema -- [--check|--apply]');
    }
    const pool = getPool();
    try {
      const report = await repairSchema(pool, args[0] === '--apply');
      console.log(`Database: ${report.database}; schema: ${report.schema}`);
      console.log(`Status: ${report.state}`);
      if (report.counts) console.log(`Legacy assignments: ${report.counts.legacy_assignments}; distinct title assignments: ${report.counts.title_assignments}.`);
      for (const issue of report.issues) console.error(`- ${issue}`);
      if (report.state === 'blocked') process.exitCode = 1;
    } finally { await pool.end(); }
  })().catch((error) => { console.error(`Schema repair failed: ${error.message}`); process.exitCode = 1; });
}

module.exports = { repairSchema };
