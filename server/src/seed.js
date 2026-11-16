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
    const sharedDone = await client.query("SELECT 1 FROM schema_migrations WHERE name = 'seed:shared-demo-v1'");
    if (!sharedDone.rowCount) {
      for (const id of ['t1', 't2', 't3', 't4']) {
        if (!(await client.query('SELECT 1 FROM titles WHERE id=$1', [id])).rowCount) throw new Error(`Shared demo seed prerequisite missing: title ${id}`);
      }
      for (const id of ['c1', 'c2']) {
        if (!(await client.query('SELECT 1 FROM clubs WHERE id=$1', [id])).rowCount) throw new Error(`Shared demo seed prerequisite missing: club ${id}`);
      }
      const users = [
        ['p1','Alex (library admin)','admin'], ['p2','Morgan (staff)','staff'],
        ['p3','Casey (leader)','member'], ['p4','Robin (member)','member'],
        ['p5','Taylor (leader)','member'], ['p6','Jordan (member)','member'],
      ];
      for (const row of users) await client.query('INSERT INTO people(id,name,role) VALUES($1,$2,$3)', row);
      for (const [clubId, personId, leader] of [['c1','p3',true],['c1','p4',false],['c2','p5',true],['c2','p6',false]]) {
        await client.query('INSERT INTO memberships(club_id,person_id,leader) VALUES($1,$2,$3)', [clubId,personId,leader]);
      }
      await client.query("INSERT INTO membership_versions(club_id) VALUES('c1'),('c2')");
      await client.query("INSERT INTO cycles(id,name,deadline,starts_on,ends_on,status) VALUES('cycle1','Upcoming reading cycle',CURRENT_DATE+14,CURRENT_DATE+14,CURRENT_DATE+70,'collecting')");
      for (const [slot,club,days] of [['s1','c1',35],['s2','c2',35],['s3','c1',70],['s4','c2',70]]) {
        await client.query("INSERT INTO meeting_slots(id,cycle_id,club_id,month,meeting) VALUES($1,'cycle1',$2,to_char(CURRENT_DATE+$3::int,'YYYY-MM'),CURRENT_DATE+$3::int)", [slot,club,days]);
      }
      for (const [club,person,titles] of [['c1','p3',['t1','t2']],['c1','p4',['t1','t3']],['c2','p5',['t1','t2']],['c2','p6',['t2','t1','t3']]]) {
        await client.query("INSERT INTO ballots(cycle_id,club_id,person_id) VALUES('cycle1',$1,$2)", [club,person]);
        for (const [index,title] of titles.entries()) await client.query("INSERT INTO ballot_marks(cycle_id,club_id,person_id,title_id,mark,rank) VALUES('cycle1',$1,$2,$3,'selected',$4)", [club,person,title,index+1]);
      }
      await client.query("INSERT INTO club_history(club_id,title_id) VALUES('c1','t4')");
      await client.query("UPDATE lending_settings SET name='Harbour Library',branches=ARRAY['Central','West'] WHERE singleton=true AND revision=1 AND name='Library' AND branches=ARRAY[]::text[] AND loan_days=28 AND buffer_days=3");
      await client.query("INSERT INTO schema_migrations(name) VALUES('seed:shared-demo-v1')");
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
  })().catch((error) => { console.error('Seed failed:', error.message.startsWith('Shared demo seed prerequisite missing:') ? error.message : error.code === '23505' ? 'Conflicting demo ID or barcode; no seed changes were applied.' : error.code || (error.message.startsWith('DATABASE_URL') ? error.message : 'unknown')); process.exitCode = 1; });
}

module.exports = { seed };
