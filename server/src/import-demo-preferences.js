const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { getPool } = require('./db');
const { parseTitleList } = require('./import-titles');

const DEFAULT_FILE = path.join(__dirname, '..', 'data', 'demo-preferences-2027.csv');
const TITLE_FILE = path.join(__dirname, '..', 'data', 'titles-import.tsv');
const CYCLE_ID = 'demo-preferences-cycle-2027';
const GATE = 'seed:demo-preferences-2027-v1';
const LOCK_ID = 180313024;

// Reviewed CSV aliases point to ISBNs in titles-import.tsv, not to an arbitrary fuzzy match.
const aliases = {
  'Before the swallows come back by Fiona Curnew': '9780995531499',
  'Daisy Jones and the Six by Jenkins Reid': '9781787462144',
  'Did I ever tell you this by Sam Neill': '9781922790859',
  'Dropping the mask by Noni Hazelhurst': '9781460759042',
  'Fourteen days by Margaret Attwood': '9781529926873',
  'Getting away with murder by Lynda La Plante': '9781804183854',
  'Heartache and birdsong et al by Sam Bloom': '9780733339790',
  'Homecoming by Kate Moreton': '9781761470974',
  'Honey, baby, mine by Laura Dern & Dianne Ladd': '9781538720363',
  'How to knit a human by Anna Jacobson': '9781761170041',
  'Inside out by Kathleen Folbigg & Tracey Chapman': '9781761346620',
  'Julie Chan is dead by Lian Zhang': '9781526681850',
  'Not now, not ever by Julia Gillard': '9781761343445',
  'Prisoner of the state by Lily Arthur': '9781923144910',
  'Secrets of the Huon Wren by Claire Van Ryn': '9781761049279',
  'Soft serve by George Kemp': '9780702269134',
  'Ten steps to Nanette by Hannah Gadsby': '9781761471384',
  'The calamity club by Kathy Stockland': '9780241796917',
  'The correspondent by Virginia Evans': '9781405971553',
  'The Doctor of Hiroshima by Michihiko Hachiya': '9781800961517',
  'The Jane Austen remedy by Ruth Wilson': '9781761069567',
  'The Kamagawa food detectives by Hisashi Kashiwai': '9781035009589',
  'The labyrinth by Amanda Lowrey': '9781922458469',
  'The last poem by Courtnet Peppernell': '9781761631887',
  'The last thing he told me by Laura Dave': '9781501171345',
  'The Paris library by Jane Skeslien Charles': '9781529335446',
  'The remarkable truths of Alfie Bain by Sarah Clutton': '9781761473760',
  'The things we never say by Elizabeth Strout': '9798217154746',
  'The woman in the library by Sulari Gentile': '9781761151392',
  'Things I cannot say by Geraldine Mellet -general fiction': '9781038953438',
  'This tender land by William Kent Krueger': '9781476749303',
  'Weyward by Emelia Hart': '9780008499129',
  'Whistler by Ann Patchatt': '9780063511637',
  'Women talking by Miriam Toewes': '9781635572582',
  'Yesteryear by Caro Claire Burke': '9780008742775',
};

const normal = (value) => value.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const clubKey = (value) => value.trim().replace(/\s+/g, ' ').toLowerCase();

function parseCsv(content) {
  const rows = [];
  let row = [], field = '', quoted = false, closed = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (quoted) {
      if (ch === '"' && content[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { quoted = false; closed = true; }
      else field += ch;
    } else if (ch === '"') {
      if (field || closed) throw new Error(`Invalid CSV quote at character ${i + 1}.`);
      quoted = true;
    } else if (ch === ',' || ch === '\n' || ch === '\r') {
      row.push(field); field = ''; closed = false;
      if (ch !== ',') {
        rows.push(row); row = [];
        if (ch === '\r' && content[i + 1] === '\n') i++;
      }
    } else {
      if (closed) throw new Error(`Unexpected character after CSV quote at character ${i + 1}.`);
      field += ch;
    }
  }
  if (quoted) throw new Error('Unclosed CSV quote.');
  if (field || row.length || closed) { row.push(field); rows.push(row); }
  return rows;
}

function parsePreferences(content, catalogue) {
  const rows = parseCsv(content.replace(/^\uFEFF/, ''));
  if (!rows.length || rows[0][0].trim() !== 'Title' || rows[0].length < 2) throw new Error('CSV must have a Title column and club columns.');
  const names = rows[0].slice(1).map((value) => value.trim());
  if (names.some((name) => !name) || new Set(names.map(clubKey)).size !== names.length) throw new Error('CSV club headers must be nonempty and unique.');
  const clubs = names.map((name) => ({ name, entries: [] }));
  const catalogueByIsbn = new Map(catalogue.map((title) => [title.isbn, title]));
  const titleMap = new Map();
  for (const [index, row] of rows.slice(1).entries()) {
    if (row.every((value) => !value.trim())) continue;
    if (row.length > names.length + 1 && row.slice(names.length + 1).some((value) => value.trim())) throw new Error(`Extra CSV values on row ${index + 2}.`);
    const raw = row[0].trim().replace(/\s+set [12]$/i, '');
    if (!raw) throw new Error(`Missing title on row ${index + 2}.`);
    const separator = raw.toLowerCase().lastIndexOf(' by ');
    const name = (separator < 0 ? raw : raw.slice(0, separator)).trim();
    const author = separator < 0 ? 'Unknown author' : raw.slice(separator + 4).trim();
    if (!name || !author) throw new Error(`Invalid title on row ${index + 2}: ${raw}`);
    const ranked = names.map((_, i) => (row[i + 1] || '').trim());
    if (!ranked.some(Boolean)) continue;
    const alias = aliases[raw];
    let matches = alias ? [catalogueByIsbn.get(alias)].filter(Boolean) : catalogue.filter((title) => normal(title.name) === normal(name) && normal(title.author) === normal(author));
    if (alias && !matches.length) throw new Error(`Missing catalog alias ISBN ${alias} for ${name}.`);
    if (matches.length > 1) throw new Error(`Ambiguous catalogue match for ${raw}.`);
    const title = matches[0] || { name, author, isbn: '' };
    const key = title.isbn ? `isbn:${title.isbn}` : `name:${normal(title.name)}:${normal(title.author)}`;
    titleMap.set(key, { ...title, sourceName: name, sourceAuthor: author });
    ranked.forEach((value, i) => {
      if (!value) return;
      if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`Invalid rank for ${names[i]} on row ${index + 2}: ${value}`);
      clubs[i].entries.push({ key, rank: Number(value), row: index + 2 });
    });
  }
  for (const club of clubs) {
    club.entries.sort((a, b) => a.rank - b.rank);
    if (new Set(club.entries.map((entry) => entry.rank)).size !== club.entries.length) throw new Error(`Duplicate rank for ${club.name}.`);
    if (new Set(club.entries.map((entry) => entry.key)).size !== club.entries.length) throw new Error(`Duplicate title for ${club.name}.`);
  }
  return { clubs, titles: [...titleMap].map(([key, title]) => ({ key, ...title })) };
}

async function importDemoPreferences(pool, input, { dryRun = false } = {}) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await c.query('SELECT pg_advisory_xact_lock($1)', [LOCK_ID]);
    if ((await c.query('SELECT 1 FROM schema_migrations WHERE name=$1', [GATE])).rowCount) {
      await c.query('ROLLBACK');
      return { skipped: true };
    }
    if ((await c.query('SELECT 1 FROM cycles WHERE id=$1', [CYCLE_ID])).rowCount) throw new Error(`Cycle ${CYCLE_ID} already exists without the import gate.`);

    const dbClubs = (await c.query('SELECT id,name FROM clubs ORDER BY id')).rows;
    const memberships = (await c.query("SELECT m.club_id,m.person_id,m.leader FROM memberships m JOIN people p ON p.id=m.person_id WHERE p.role='member' ORDER BY m.leader DESC,m.person_id")).rows;
    const dbTitles = (await c.query('SELECT id,name,author,isbn FROM titles ORDER BY id')).rows;
    const dbKits = (await c.query('SELECT id,title_id,status FROM kits ORDER BY id')).rows;
    const identifiers = new Set((await c.query('SELECT lower(identifier) AS identifier FROM kit_identifiers')).rows.map((row) => row.identifier));
    const history = (await c.query('SELECT club_id,title_id FROM club_history')).rows;
    const settings = (await c.query('SELECT branches FROM lending_settings WHERE singleton=true')).rows[0];
    const branch = settings?.branches[0];
    const report = { skipped: false, clubs: [], titles: [], kits: [], warnings: [], selections: 0 };

    const titles = new Map();
    for (const title of input.titles) {
      const candidates = dbTitles.filter((item) => (title.isbn && item.isbn === title.isbn) ||
        (normal(item.name) === normal(title.name) &&
          (title.author === 'Unknown author' || normal(item.author) === normal(title.author))) ||
        (normal(item.name) === normal(title.sourceName) &&
          (title.sourceAuthor === 'Unknown author' || normal(item.author) === normal(title.sourceAuthor))));
      if (candidates.length > 1) throw new Error(`Ambiguous database title: ${title.name} / ${title.author}.`);
      const existing = candidates[0];
      const item = { ...title, id: existing?.id || randomUUID(), create: !existing };
      titles.set(title.key, item);
      if (item.create) report.titles.push(`${item.name} / ${item.author}`);
    }
    if (new Set([...titles.values()].map((item) => item.id)).size !== titles.size) throw new Error('Multiple CSV titles map to one database title; review aliases.');

    const kits = [];
    for (const title of titles.values()) {
      const existing = dbKits.filter((kit) => kit.title_id === title.id);
      if (existing.length) {
        if (existing.every((kit) => ['out', 'inspection', 'unavailable'].includes(kit.status))) report.warnings.push(`No readily available kit for ${title.name}; review kit status.`);
        continue;
      }
      if (!branch) throw new Error('No library branch is configured in lending_settings; configure one before creating demo kits.');
      const barcode = `demo-2027-${title.id}`;
      if (identifiers.has(barcode.toLowerCase())) throw new Error(`Demo kit barcode already in use: ${barcode}`);
      identifiers.add(barcode.toLowerCase());
      kits.push({ id: randomUUID(), titleId: title.id, barcode });
      report.kits.push(title.name);
    }

    const clubs = input.clubs.map((club) => {
      const candidates = dbClubs.filter((item) => clubKey(item.name) === clubKey(club.name));
      if (candidates.length > 1) throw new Error(`Ambiguous database club: ${club.name}.`);
      const found = candidates[0];
      const id = found?.id || randomUUID();
      const members = memberships.filter((item) => item.club_id === id);
      const personId = members[0]?.person_id || randomUUID();
      if (members.length > 1) report.warnings.push(`${club.name} has ${members.length} members; using ${personId}.`);
      if (!found) report.clubs.push(club.name);
      const entries = club.entries.map((entry, index) => {
        if (entry.rank !== index + 1) report.warnings.push(`${club.name}: CSV rank ${entry.rank} becomes ${index + 1}.`);
        const title = titles.get(entry.key);
        if (history.some((item) => item.club_id === id && item.title_id === title.id)) report.warnings.push(`${club.name}: ${title.name} is in reading history and excluded from scheduling preferences.`);
        return title;
      });
      report.selections += entries.length;
      return { ...club, id, personId, create: !found, createPerson: !members.length, entries };
    });
    const preferredIds = [...titles.values()].map((item) => item.id);
    const otherAssignments = (await c.query(`SELECT a.cycle_id,a.meeting,k.title_id FROM schedule_assignments a JOIN kits k ON k.id=a.kit_id
      WHERE k.title_id=ANY($1::text[]) AND a.due >= '2026-12-01' AND a.ready <= '2028-01-31' ORDER BY a.meeting`, [preferredIds])).rows;
    if (otherAssignments.length) report.warnings.push(`${otherAssignments.length} existing assignments may affect 2027 preferred-kit availability; review the schedule.`);
    report.members = clubs.map((club) => ({ club: club.name, personId: club.personId, created: club.createPerson }));
    report.slots = clubs.length * 12;

    if (dryRun) { await c.query('ROLLBACK'); return report; }
    for (const club of clubs) {
      if (club.create) await c.query("INSERT INTO clubs(id,name,branch,size,cadence,pickup,address) VALUES($1,$2,'Central',10,1,'pickup','')", [club.id, club.name]);
      if (club.createPerson) {
        await c.query("INSERT INTO people(id,name,role) VALUES($1,$2,'member')", [club.personId, `Sample member (${club.name})`]);
        await c.query('INSERT INTO memberships(club_id,person_id,leader) VALUES($1,$2,false)', [club.id, club.personId]);
        await c.query('INSERT INTO membership_versions(club_id,revision) VALUES($1,1) ON CONFLICT(club_id) DO UPDATE SET revision=membership_versions.revision+1', [club.id]);
      }
    }
    for (const title of titles.values()) if (title.create) await c.query('INSERT INTO titles(id,name,author,isbn,pages) VALUES($1,$2,$3,$4,0)', [title.id, title.name, title.author, title.isbn]);
    for (const kit of kits) {
      await c.query('INSERT INTO kits(id,title_id,branch,copies,extras) VALUES($1,$2,$3,10,$4)', [kit.id, kit.titleId, branch, '']);
      await c.query("INSERT INTO kit_identifiers(kit_id,identifier,kind) VALUES($1,$2,'kit')", [kit.id, kit.barcode]);
    }
    await c.query("INSERT INTO cycles(id,name,deadline,starts_on,ends_on,status) VALUES($1,'Demo preferences 2027','2026-12-15','2027-01-01','2027-12-31','collecting')", [CYCLE_ID]);
    for (const club of clubs) {
      await c.query('INSERT INTO ballots(cycle_id,club_id,person_id) VALUES($1,$2,$3)', [CYCLE_ID, club.id, club.personId]);
      for (const [index, title] of club.entries.entries()) await c.query("INSERT INTO ballot_marks(cycle_id,club_id,person_id,title_id,mark,rank) VALUES($1,$2,$3,$4,'selected',$5)", [CYCLE_ID, club.id, club.personId, title.id, index + 1]);
      for (let month = 1; month <= 12; month++) await c.query('INSERT INTO meeting_slots(id,cycle_id,club_id,month,meeting) VALUES($1,$2,$3,$4,NULL)', [randomUUID(), CYCLE_ID, club.id, `2027-${String(month).padStart(2, '0')}`]);
    }
    await c.query('INSERT INTO schema_migrations(name) VALUES($1)', [GATE]);
    await c.query('COMMIT');
    return report;
  } catch (error) {
    await c.query('ROLLBACK');
    throw error;
  } finally { c.release(); }
}

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== '--dry-run')) throw new Error('Usage: npm run import-demo-preferences -- [--dry-run]');
    const dryRun = args.includes('--dry-run');
    const [{ rows: catalogue, invalid, duplicates }, content] = await Promise.all([
      fs.readFile(TITLE_FILE, 'utf8').then(parseTitleList), fs.readFile(DEFAULT_FILE, 'utf8'),
    ]);
    if (invalid.length || duplicates.length) throw new Error('Title reference list contains invalid or duplicate ISBNs.');
    const input = parsePreferences(content, catalogue);
    const pool = getPool();
    try {
      const report = await importDemoPreferences(pool, input, { dryRun });
      if (report.skipped) console.log('Demo preferences already imported; no changes made.');
      else {
        console.log(`${dryRun ? 'Would import' : 'Imported'} ${input.clubs.length} ballots, ${report.selections} selections and ${report.slots} slots into ${CYCLE_ID}.`);
        for (const [label, items] of [['New clubs', report.clubs], ['New titles', report.titles], ['New kits', report.kits], ['Warnings', report.warnings]]) {
          console.log(`${label}: ${items.length}`);
          for (const item of items) console.log(`  ${item}`);
        }
        for (const member of report.members) console.log(`  Ballot member: ${member.club} -> ${member.created ? 'new demo member' : member.personId}`);
      }
    } finally { await pool.end(); }
  })().catch((error) => { console.error('Demo preferences import failed:', error.message); process.exitCode = 1; });
}

module.exports = { parseCsv, parsePreferences, importDemoPreferences, CYCLE_ID, GATE };
