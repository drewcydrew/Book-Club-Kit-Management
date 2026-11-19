const express = require('express');
const { createHash, randomUUID } = require('node:crypto');
const { HttpError, object, text, revision } = require('../http');
const { transaction, one, stale } = require('./workflow-util');

const router = express.Router();

function labelInput(value) {
  const body = object(value);
  if (!['genre', 'vibe'].includes(body.category)) throw new HttpError(400, 'Label category is invalid.');
  return { category: body.category, name: text(body.name, 'label name', true, 100) };
}

async function deletionSnapshot(client, labelId, expected) {
  const label = await one(client, 'SELECT id,category,name,revision FROM kit_labels WHERE id=$1 FOR UPDATE', [labelId], 'Label');
  stale(label.revision, expected);
  const titles = (await client.query(`SELECT t.id,t.revision FROM titles t JOIN title_label_assignments a ON a.title_id=t.id
    WHERE a.label_id=$1 ORDER BY t.id FOR UPDATE OF t`, [labelId])).rows;
  const kits = (await client.query(`SELECT k.id,k.revision FROM kits k JOIN title_label_assignments a ON a.title_id=k.title_id
    WHERE a.label_id=$1 ORDER BY k.id FOR UPDATE OF k`, [labelId])).rows;
  const token = createHash('sha256').update(JSON.stringify({ label, titles, kits })).digest('hex');
  return { label, titleCount: titles.length, kitCount: kits.length, token };
}

router.post('/', async (req, res) => {
  const label = labelInput(req.body);
  const result = await transaction((client) => client.query(
    'INSERT INTO kit_labels(id,category,name) VALUES($1,$2,$3) RETURNING id,category,name,revision',
    [randomUUID(), label.category, label.name]));
  res.status(201).json(result.rows[0]);
});

router.put('/:id', async (req, res) => {
  const input = labelInput(req.body);
  const expected = revision(req.body.revision);
  const label = await transaction(async (client) => {
    const current = await one(client, 'SELECT id,category,revision FROM kit_labels WHERE id=$1 FOR UPDATE', [req.params.id], 'Label');
    stale(current.revision, expected);
    if (current.category !== input.category) throw new HttpError(400, 'A label cannot change category.');
    return (await client.query('UPDATE kit_labels SET name=$2,revision=revision+1 WHERE id=$1 RETURNING id,category,name,revision',
      [req.params.id, input.name])).rows[0];
  });
  res.json(label);
});

router.post('/:id/deletion-preview', async (req, res) => {
  const expected = revision(object(req.body).revision);
  res.json(await transaction((client) => deletionSnapshot(client, req.params.id, expected)));
});

router.delete('/:id', async (req, res) => {
  const expected = revision(req.header('If-Match'));
  const body = object(req.body);
  if (body.acknowledge !== true || typeof body.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token)) {
    throw new HttpError(400, 'Review and confirm the label deletion preview first.');
  }
  await transaction(async (client) => {
    const preview = await deletionSnapshot(client, req.params.id, expected);
    if (preview.token !== body.token) throw new HttpError(409, 'Label assignments changed. Refresh and review a new preview.');
    await client.query('UPDATE kits SET revision=revision+1 WHERE title_id IN (SELECT title_id FROM title_label_assignments WHERE label_id=$1)', [req.params.id]);
    await client.query('UPDATE titles SET revision=revision+1 WHERE id IN (SELECT title_id FROM title_label_assignments WHERE label_id=$1)', [req.params.id]);
    await client.query('DELETE FROM title_label_assignments WHERE label_id=$1', [req.params.id]);
    await client.query('DELETE FROM kit_labels WHERE id=$1', [req.params.id]);
  });
  res.status(204).end();
});

module.exports = router;
