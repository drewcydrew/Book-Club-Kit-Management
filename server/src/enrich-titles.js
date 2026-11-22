const { setTimeout: sleep } = require('node:timers/promises');
const { getPool } = require('./db');
const { assertLegacyScriptSupported } = require('./legacy-script-guard');
const { normaliseIsbn } = require('./isbn');
const { lookupBookDetailed } = require('./isbndb');

const fields = [
  ['name', 'title'], ['author', 'author'], ['pages', 'pages'], ['genres', 'genres'],
  ['cover_url', 'coverUrl'], ['publisher', 'publisher'], ['synopsis', 'synopsis'],
  ['date_published', 'datePublished'], ['binding', 'binding'], ['language', 'language'],
];

function parseArgs(args) {
  let dryRun = false;
  let intervalMs = 1100;
  let intervalSet = false;
  for (const arg of args) {
    if (arg === '--dry-run' && !dryRun) dryRun = true;
    else if (arg.startsWith('--interval-ms=') && !intervalSet) {
      const value = arg.slice('--interval-ms='.length);
      if (!/^\d+$/.test(value) || Number(value) < 1000 || Number(value) > 3600000) {
        throw new Error('--interval-ms must be an integer from 1000 to 3600000.');
      }
      intervalMs = Number(value);
      intervalSet = true;
    } else throw new Error('Unknown or repeated argument.');
  }
  return { dryRun, intervalMs };
}

function proposedChanges(title, book) {
  const changes = {};
  for (const [column, key] of fields) {
    const incoming = book[key];
    if (incoming === null || incoming === undefined) continue;
    const current = title[column];
    const empty = column === 'pages' ? current === 0 : current === null || (typeof current === 'string' && !current.trim());
    if ((column === 'synopsis' || empty) && current !== incoming) {
      changes[column] = { before: current, after: incoming };
    }
  }
  return changes;
}

async function enrichTitles(pool, { dryRun = false, intervalMs = 1100, lookup = lookupBookDetailed, wait = sleep, log = console.log } = {}) {
  const summary = { titles: 0, lookups: 0, missingIsbn: 0, invalidIsbn: 0, notFound: 0, withoutSynopsis: 0, unchanged: 0, changed: 0, conflicts: 0, incomplete: false };
  const cache = new Map();
  try {
    const result = await pool.query(`SELECT id,revision,isbn,name,author,pages,genres,cover_url,publisher,synopsis,date_published,binding,language
      FROM titles ORDER BY id`);
    summary.titles = result.rowCount;
    for (const title of result.rows) {
      if (!title.isbn.trim()) {
        summary.missingIsbn++;
        log(`Skipped ${title.id}: no ISBN.`);
        continue;
      }
      const isbn = normaliseIsbn(title.isbn);
      if (!isbn) {
        summary.invalidIsbn++;
        log(`Skipped ${title.id}: invalid ISBN.`);
        continue;
      }
      let found = cache.get(isbn);
      if (!found) {
        if (summary.lookups) await wait(intervalMs);
        summary.lookups++;
        found = await lookup(isbn);
        if (found.status === 'error') {
          summary.incomplete = true;
          log(`Stopped at ${title.id}: ${found.reason}`);
          break;
        }
        cache.set(isbn, found);
      }
      if (found.status === 'not-found') {
        summary.notFound++;
        log(`Skipped ${title.id}: ISBNdb has no record.`);
        continue;
      }
      if (!found.book.synopsis) summary.withoutSynopsis++;
      const changes = proposedChanges(title, found.book);
      const columns = Object.keys(changes);
      if (!columns.length) { summary.unchanged++; continue; }
      if (!dryRun) {
        const setters = columns.map((column, index) => `${column}=$${index + 4}`).join(',');
        const updated = await pool.query(`UPDATE titles SET ${setters},revision=revision+1 WHERE id=$1 AND revision=$2 AND isbn=$3 RETURNING id`,
          [title.id, title.revision, title.isbn, ...columns.map((column) => changes[column].after)]);
        if (!updated.rowCount) {
          summary.conflicts++;
          summary.incomplete = true;
          log(`Conflict ${title.id}: title changed or was removed; refresh and rerun.`);
          continue;
        }
      }
      summary.changed++;
      log(`${dryRun ? 'Would update' : 'Updated'} ${title.id}: ${JSON.stringify(changes)}`);
    }
  } catch (error) {
    summary.incomplete = true;
    throw error;
  } finally {
    log(`${dryRun ? 'Dry run' : 'Enrichment'} summary: ${JSON.stringify(summary)}`);
  }
  return summary;
}

if (require.main === module) {
  (async () => {
    const options = parseArgs(process.argv.slice(2));
    if (!process.env.ISBNDB_API_KEY?.trim()) throw new Error('ISBNDB_API_KEY is required.');
    const pool = getPool();
    try {
      await assertLegacyScriptSupported(pool);
      const summary = await enrichTitles(pool, options);
      if (summary.incomplete) process.exitCode = 1;
    } finally { await pool.end(); }
  })().catch((error) => {
    const safeMessage = error.code === 'LIBRARY_SERVICES_UNSUPPORTED' || error.message === 'ISBNDB_API_KEY is required.' || error.message.startsWith('DATABASE_URL') ||
      error.message.startsWith('--interval-ms') || error.message === 'Unknown or repeated argument.'
      ? error.message : (error.code || 'unexpected error');
    console.error('Title enrichment failed:', safeMessage);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, proposedChanges, enrichTitles };
