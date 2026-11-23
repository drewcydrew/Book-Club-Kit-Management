const { setTimeout: sleep } = require('node:timers/promises');
const { getPool } = require('./db');
const { normaliseIsbn } = require('./isbn');
const { lookupBookDetailed } = require('./isbndb');
const { formatSynopsis } = require('./synopsis');
const { parseArgs } = require('./enrich-titles');
const { inService } = require('./synopsis-transaction');

// Matches tags other than <p>, <b>, and their closers, plus entities other than &amp;, &lt; and &gt;.
// Synopses already in the formatted form (see synopsis.js) do not match, so a rerun leaves them alone.
// The same pattern is used in SQL and in tests.
const markupPattern = '<(?!/?[pb]>)[^>]+>|&(?!(?:amp|lt|gt);)(#[0-9]+|#x[0-9a-f]+|[a-z]+);';

// Prefers the ISBNdb synopsis, which is already cleaned; otherwise cleans the stored text locally.
// Returns null when the stored value should stay as it is.
function replacementFor(title, book) {
  const fromIsbndb = Boolean(book?.synopsis);
  const value = fromIsbndb ? book.synopsis : formatSynopsis(title.synopsis, 4000);
  return value === title.synopsis ? null : { value, source: fromIsbndb ? 'isbndb' : 'local' };
}

async function cleanSynopses(pool, { dryRun = false, intervalMs = 1100, lookup = lookupBookDetailed, wait = sleep, log = console.log } = {}) {
  const summary = { services: 0, titles: 0, lookups: 0, changed: 0, fromIsbndb: 0, fromLocal: 0, unchanged: 0, conflicts: 0, incomplete: false };
  const cache = new Map();
  try {
    const services = (await pool.query('SELECT id FROM library_services ORDER BY id')).rows;
    summary.services = services.length;
    for (const { id: serviceId } of services) {
      const titles = await inService(pool, serviceId, async (client) =>
        (await client.query('SELECT id,revision,isbn,synopsis FROM titles WHERE synopsis ~* $1 ORDER BY id', [markupPattern])).rows);
      for (const title of titles) {
        summary.titles++;
        const isbn = normaliseIsbn(title.isbn);
        let book = null;
        if (isbn) {
          let found = cache.get(isbn);
          if (!found) {
            if (summary.lookups) await wait(intervalMs);
            summary.lookups++;
            found = await lookup(isbn);
            if (found.status === 'error') {
              summary.incomplete = true;
              log(`Stopped at ${title.id}: ${found.reason}`);
              return summary;
            }
            cache.set(isbn, found);
          }
          if (found.status === 'found') book = found.book;
        }
        const replacement = replacementFor(title, book);
        if (!replacement) { summary.unchanged++; continue; }
        if (dryRun) {
          summary.changed++;
          replacement.source === 'isbndb' ? summary.fromIsbndb++ : summary.fromLocal++;
          log(`Would update ${title.id} (${serviceId}) from ${replacement.source}.`);
          continue;
        }
        const updated = await inService(pool, serviceId, (client) => client.query(
          'UPDATE titles SET synopsis=$1,revision=revision+1 WHERE id=$2 AND revision=$3 AND library_service_id=$4 RETURNING id',
          [replacement.value, title.id, title.revision, serviceId]));
        if (!updated.rowCount) {
          summary.conflicts++;
          summary.incomplete = true;
          log(`Conflict ${title.id}: title changed or was removed; rerun.`);
          continue;
        }
        summary.changed++;
        replacement.source === 'isbndb' ? summary.fromIsbndb++ : summary.fromLocal++;
        log(`Updated ${title.id} (${serviceId}) from ${replacement.source}.`);
      }
    }
  } catch (error) {
    summary.incomplete = true;
    throw error;
  } finally {
    log(`${dryRun ? 'Dry run' : 'Synopsis cleanup'} summary: ${JSON.stringify(summary)}`);
  }
  return summary;
}

if (require.main === module) {
  (async () => {
    const options = parseArgs(process.argv.slice(2));
    if (!process.env.ISBNDB_API_KEY?.trim()) throw new Error('ISBNDB_API_KEY is required.');
    const pool = getPool();
    try {
      const summary = await cleanSynopses(pool, options);
      if (summary.incomplete) process.exitCode = 1;
    } finally { await pool.end(); }
  })().catch((error) => {
    const safeMessage = error.message === 'ISBNDB_API_KEY is required.' || error.message.startsWith('DATABASE_URL') ||
      error.message.startsWith('--interval-ms') || error.message === 'Unknown or repeated argument.'
      ? error.message : (error.code || 'unexpected error');
    console.error('Synopsis cleanup failed:', safeMessage);
    process.exitCode = 1;
  });
}

module.exports = { cleanSynopses, replacementFor };
