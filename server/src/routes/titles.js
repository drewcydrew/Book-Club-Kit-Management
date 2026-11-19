const express = require('express');
const { randomUUID } = require('node:crypto');
const { getPool } = require('../db');
const { object, text, integer, boolean, HttpError, revision, checkUpdated } = require('../http');
const { titleColumns } = require('./shared-selects');
const { transaction } = require('./workflow-util');
const { labelIds, setLabels } = require('./title-labels');

const router = express.Router();
const columns = ['name', 'author', 'isbn', 'pages', 'genres', 'notes', 'large_print', 'audio', 'cover_url', 'publisher', 'synopsis', 'date_published', 'binding', 'language'];

function coverUrl(value) {
  if (value === null || value === undefined || value === '') return null;
  const url = text(value, 'coverUrl', false, 2000);
  if (!/^https:\/\//.test(url)) throw new HttpError(400, 'coverUrl is invalid.');
  return url;
}

// ISBNdb-derived details are optional; empty or missing values are stored as NULL.
function optionalText(value, field, max) {
  if (value === null || value === undefined || value === '') return null;
  return text(value, field, false, max);
}

// Temporary development rule: deleting a title also removes its kits, their club links,
// circulation history, schedule assignments, ballot marks, finalized rankings and club history.
async function removeTitle(req, res) {
  const expected = revision(req.header('If-Match'));
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(180313022)');
    const existing = await client.query('SELECT revision FROM titles WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!existing.rowCount) throw new HttpError(404, 'Record not found.');
    if (existing.rows[0].revision !== expected) await checkUpdated(client, 'titles', req.params.id);
    await client.query('DELETE FROM ballot_marks WHERE title_id=$1', [req.params.id]);
    await client.query('DELETE FROM finalized_rankings WHERE title_id=$1', [req.params.id]);
    await client.query('DELETE FROM club_history WHERE title_id=$1', [req.params.id]);
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

function validate(value) {
  const b = object(value);
  return [text(b.name, 'name', true, 200), text(b.author, 'author', true, 200), text(b.isbn, 'isbn', false, 40),
    integer(b.pages, 'pages', 0), text(b.genres, 'genres'), text(b.notes, 'notes'), boolean(b.largePrint, 'largePrint'), boolean(b.audio, 'audio'), coverUrl(b.coverUrl),
    optionalText(b.publisher, 'publisher', 200), optionalText(b.synopsis, 'synopsis', 4000), optionalText(b.datePublished, 'datePublished', 40),
    optionalText(b.binding, 'binding', 100), optionalText(b.language, 'language', 40)];
}

router.get('/', async (_req, res) => {
  res.json((await getPool().query(`SELECT ${titleColumns} FROM titles ORDER BY id`)).rows);
});
router.get('/:id', async (req, res) => {
  const result = await getPool().query(`SELECT ${titleColumns} FROM titles WHERE id=$1`, [req.params.id]);
  if (!result.rowCount) throw new HttpError(404, 'Record not found.');
  res.json(result.rows[0]);
});
router.post('/', async (req, res) => {
  const values = validate(req.body);
  const ids = labelIds(req.body.labelIds);
  const id = randomUUID();
  const title = await transaction(async (client) => {
    const placeholders = values.map((_, index) => `$${index + 2}`).join(',');
    await client.query(`INSERT INTO titles (id,${columns.join(',')}) VALUES ($1,${placeholders})`, [id, ...values]);
    await setLabels(client, id, ids, { titleUpdated: true });
    return (await client.query(`SELECT ${titleColumns} FROM titles WHERE id=$1`, [id])).rows[0];
  });
  res.status(201).json(title);
});
router.put('/:id', async (req, res) => {
  const values = validate(req.body);
  const ids = labelIds(req.body.labelIds);
  const expected = revision(req.body.revision);
  const title = await transaction(async (client) => {
    const setters = columns.map((column, index) => `${column}=$${index + 3}`).join(',');
    const updated = await client.query(`UPDATE titles SET ${setters},revision=revision+1 WHERE id=$1 AND revision=$2 RETURNING id`, [req.params.id, expected, ...values]);
    if (!updated.rowCount) await checkUpdated(client, 'titles', req.params.id);
    await setLabels(client, req.params.id, ids, { titleUpdated: true });
    return (await client.query(`SELECT ${titleColumns} FROM titles WHERE id=$1`, [req.params.id])).rows[0];
  });
  res.json(title);
});
router.delete('/:id', removeTitle);

module.exports = router;
