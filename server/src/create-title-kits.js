const { randomUUID } = require('node:crypto');
const { getPool } = require('./db');
const { assertLegacyScriptSupported } = require('./legacy-script-guard');

const KIT_LOCK = 180313022;
const COPIES = 10;

// Plans one kit per title that has no kit. Kit barcodes are the title name and must be unique
// (case-insensitively) across every kit and copy identifier, so conflicts are reported before anything is written.
async function planKits(client) {
  const settings = await client.query('SELECT branches FROM lending_settings WHERE singleton=true');
  const branch = settings.rows[0]?.branches[0];
  if (!branch) throw new Error('No library branch is configured in lending_settings.');
  const titles = await client.query(`SELECT t.id, t.name FROM titles t
    WHERE NOT EXISTS (SELECT 1 FROM kits k WHERE k.title_id = t.id) ORDER BY t.name, t.id`);
  const taken = await client.query('SELECT lower(identifier) AS identifier FROM kit_identifiers');
  const used = new Set(taken.rows.map((row) => row.identifier));
  const plans = [];
  const conflicts = [];
  for (const title of titles.rows) {
    const barcode = title.name.trim();
    const key = barcode.toLowerCase();
    if (used.has(key)) conflicts.push({ titleId: title.id, barcode });
    else { used.add(key); plans.push({ titleId: title.id, barcode }); }
  }
  return { branch, plans, conflicts };
}

// Creates the kits in one transaction. Returns the number that would be (or was) created.
async function createTitleKits(pool, { dryRun = false } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [KIT_LOCK]);
    const { branch, plans, conflicts } = await planKits(client);
    if (conflicts.length) {
      const error = new Error(`Kit barcodes already in use: ${conflicts.map((item) => item.barcode).join('; ')}`);
      error.code = 'BARCODE_CONFLICT';
      throw error;
    }
    if (dryRun) {
      await client.query('ROLLBACK');
      return { created: plans.length, branch, barcodes: plans.map((plan) => plan.barcode) };
    }
    for (const plan of plans) {
      const id = randomUUID();
      await client.query('INSERT INTO kits(id,title_id,branch,copies,extras) VALUES($1,$2,$3,$4,$5)', [id, plan.titleId, branch, COPIES, '']);
      await client.query("INSERT INTO kit_identifiers(kit_id,identifier,kind) VALUES($1,$2,'kit')", [id, plan.barcode]);
    }
    await client.query('COMMIT');
    return { created: plans.length, branch, barcodes: plans.map((plan) => plan.barcode) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  (async () => {
    const dryRun = process.argv.includes('--dry-run');
    const pool = getPool();
    try {
      await assertLegacyScriptSupported(pool);
      const { created, branch, barcodes } = await createTitleKits(pool, { dryRun });
      console.log(`${dryRun ? 'Would create' : 'Created'} ${created} kits of ${COPIES} copies at branch "${branch}".`);
      for (const barcode of barcodes) console.log(`  ${barcode}`);
    } finally {
      await pool.end();
    }
  })().catch((error) => {
    console.error('Kit creation failed:', error.code === 'LIBRARY_SERVICES_UNSUPPORTED' || error.code === 'BARCODE_CONFLICT' || error.message.startsWith('No library branch') ? error.message : (error.code || 'unknown'));
    process.exitCode = 1;
  });
}

module.exports = { createTitleKits };
