const { getPool } = require('./db');

const titles = [
  ['t1', 'The Lantern Garden', 'Mara Fields', '9780000000001', 312, 'Fiction', '', true, true],
  ['t2', 'A Map of Small Things', 'Ari Vale', '9780000000002', 260, 'Mystery', '', false, true],
  ['t3', 'River of Seasons', 'Sam Rowan', '9780000000003', 288, 'Nature, Fiction', '', true, false],
  ['t4', 'The Clockmaker’s Table', 'Jo Ellis', '9780000000004', 341, 'Historical', '', false, false],
];
const kits = [
  ['k1', 't1', 'Central', 10, 'Discussion guide', 'KIT-101'],
  ['k2', 't1', 'West', 10, 'Tote', 'KIT-102'],
  ['k3', 't2', 'Central', 8, '', 'KIT-103'],
  ['k4', 't3', 'West', 12, '', 'KIT-104'],
  ['k5', 't4', 'Central', 10, '', 'KIT-105'],
];
const clubs = [
  ['c1', 'Harbour Readers', 'Central', 8, 'Monthly', 'pickup', ''],
  ['c2', 'Westside Stories', 'West', 10, 'Monthly', 'delivery', 'Fictional West Community Centre'],
];

async function seed(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(180313021)');
    const done = await client.query("SELECT 1 FROM schema_migrations WHERE name = 'seed:demo-v1'");
    if (!done.rowCount) {
      for (const title of titles) await client.query('INSERT INTO titles(id,name,author,isbn,pages,genres,notes,large_print,audio) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', title);
      for (const [id, titleId, branch, copies, extras, barcode] of kits) {
        await client.query('INSERT INTO kits(id,title_id,branch,copies,extras) VALUES($1,$2,$3,$4,$5)', [id, titleId, branch, copies, extras]);
        await client.query("INSERT INTO kit_identifiers(kit_id,identifier,kind) VALUES($1,$2,'kit')", [id, barcode]);
      }
      for (const club of clubs) await client.query('INSERT INTO clubs(id,name,branch,size,cadence,pickup,address) VALUES($1,$2,$3,$4,$5,$6,$7)', club);
      await client.query("INSERT INTO schema_migrations(name) VALUES('seed:demo-v1')");
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
    try { await seed(pool); console.log('Demo seed complete.'); }
    finally { await pool.end(); }
  })().catch((error) => { console.error('Seed failed:', error.code || (error.message.startsWith('DATABASE_URL') ? error.message : 'unknown')); process.exitCode = 1; });
}

module.exports = { seed };
