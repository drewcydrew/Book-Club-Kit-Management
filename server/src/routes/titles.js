const { records } = require('./records');
const { getPool } = require('../db');
const { object, text, integer, boolean, HttpError, revision, checkUpdated } = require('../http');
const { titleColumns } = require('./shared-selects');

function coverUrl(value) {
  if (value === null || value === undefined || value === '') return null;
  const url = text(value, 'coverUrl', false, 2000);
  if (!/^https:\/\//.test(url)) throw new HttpError(400, 'coverUrl is invalid.');
  return url;
}

// Temporary development rule: deleting a title also removes its kits, their club links,
// circulation history and schedule assignments. Ballots, rankings and club history still block deletion.
async function removeTitle(req, res) {
  const expected = revision(req.header('If-Match'));
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(180313022)');
    const existing = await client.query('SELECT revision FROM titles WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!existing.rowCount) throw new HttpError(404, 'Record not found.');
    if (existing.rows[0].revision !== expected) await checkUpdated(client, 'titles', req.params.id);
    const blocked = await client.query(`SELECT 1 FROM ballot_marks WHERE title_id=$1
      UNION ALL SELECT 1 FROM finalized_rankings WHERE title_id=$1
      UNION ALL SELECT 1 FROM club_history WHERE title_id=$1 LIMIT 1`, [req.params.id]);
    if (blocked.rowCount) throw new HttpError(409, 'This title is used in ballots, finalized rankings or club history and cannot be deleted.');
    const kitIds = 'SELECT id FROM kits WHERE title_id=$1';
    await client.query(`DELETE FROM schedule_assignments WHERE kit_id IN (${kitIds})`, [req.params.id]);
    await client.query(`DELETE FROM club_kits WHERE kit_id IN (${kitIds})`, [req.params.id]);
    // circulation_events is append-only; the trigger is re-enabled before commit.
    await client.query('ALTER TABLE circulation_events DISABLE TRIGGER circulation_events_append_only');
    await client.query(`DELETE FROM circulation_events WHERE kit_id IN (${kitIds})`, [req.params.id]);
    await client.query('ALTER TABLE circulation_events ENABLE TRIGGER circulation_events_append_only');
    await client.query('DELETE FROM kits WHERE title_id=$1', [req.params.id]);
    await client.query('DELETE FROM titles WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');
    res.status(204).end();
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

module.exports = records({
  table: 'titles',
  columns: ['name', 'author', 'isbn', 'pages', 'genres', 'notes', 'large_print', 'audio', 'cover_url'],
  select: titleColumns,
  remove: removeTitle,
  validate(value) {
    const b = object(value);
    return [text(b.name, 'name', true, 200), text(b.author, 'author', true, 200), text(b.isbn, 'isbn', false, 40),
      integer(b.pages, 'pages', 0), text(b.genres, 'genres'), text(b.notes, 'notes'), boolean(b.largePrint, 'largePrint'), boolean(b.audio, 'audio'), coverUrl(b.coverUrl)];
  },
});
