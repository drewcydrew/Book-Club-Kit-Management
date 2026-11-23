const { setTimeout: sleep } = require('node:timers/promises');
const { getPool } = require('./db');
const { normaliseIsbn } = require('./isbn');
const { lookupBookDetailed } = require('./isbndb');
const { parseArgs } = require('./enrich-titles');
const { inService } = require('./synopsis-transaction');

// Refreshes the synopsis of every title from ISBNdb. Titles without a usable ISBN or
// without an ISBNdb synopsis keep their stored text.
async function refreshSynopses(pool, { dryRun = false, intervalMs = 1100, lookup = lookupBookDetailed, wait = sleep, log = console.log } = {}) {
  const summary = { services: 0, titles: 0, lookups: 0, changed: 0, unchanged: 0, noIsbn: 0, notFound: 0, conflicts: 0, incomplete: false };
  const cache = new Map();
  try {
    const services = (await pool.query('SELECT id FROM library_services ORDER BY id')).rows;
    summary.services = services.length;
    for (const { id: serviceId } of services) {
      const titles = await inService(pool, serviceId, async (client) =>
        (await client.query('SELECT id,revision,isbn,synopsis FROM titles ORDER BY id')).rows);
      for (const title of titles) {
        summary.titles++;
        const isbn = normaliseIsbn(title.isbn);
        if (!isbn) {
          summary.noIsbn++;
          summary.unchanged++;
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
            return summary;
          }
          cache.set(isbn, found);
        }
        const value = found.status === 'found' ? found.book.synopsis : null;
        if (!value) {
          summary.notFound++;
          summary.unchanged++;
          continue;
        }
        if (value === title.synopsis) {
          summary.unchanged++;
          continue;
        }
        if (dryRun) {
          summary.changed++;
          log(`Would update ${title.id} (${serviceId}).`);
          continue;
        }
        const updated = await inService(pool, serviceId, (client) => client.query(
          'UPDATE titles SET synopsis=$1,revision=revision+1 WHERE id=$2 AND revision=$3 AND library_service_id=$4 RETURNING id',
          [value, title.id, title.revision, serviceId]));
        if (!updated.rowCount) {
          summary.conflicts++;
          summary.incomplete = true;
          log(`Conflict ${title.id}: title changed or was removed; rerun.`);
          continue;
        }
        summary.changed++;
        log(`Updated ${title.id} (${serviceId}).`);
      }
    }
  } catch (error) {
    summary.incomplete = true;
    throw error;
  } finally {
    log(`${dryRun ? 'Dry run' : 'Synopsis refresh'} summary: ${JSON.stringify(summary)}`);
  }
  return summary;
}

if (require.main === module) {
  (async () => {
    const options = parseArgs(process.argv.slice(2));
    if (!process.env.ISBNDB_API_KEY?.trim()) throw new Error('ISBNDB_API_KEY is required.');
    const pool = getPool();
    try {
      const summary = await refreshSynopses(pool, options);
      if (summary.incomplete) process.exitCode = 1;
    } finally { await pool.end(); }
  })().catch((error) => {
    const safeMessage = error.message === 'ISBNDB_API_KEY is required.' || error.message.startsWith('DATABASE_URL') ||
      error.message.startsWith('--interval-ms') || error.message === 'Unknown or repeated argument.'
      ? error.message : (error.code || 'unexpected error');
    console.error('Synopsis refresh failed:', safeMessage);
    process.exitCode = 1;
  });
}

module.exports = { refreshSynopses };
