const express = require('express');
const { randomUUID } = require('node:crypto');
const { getPool } = require('../db');
const { HttpError, object, text, integer, revision, checkUpdated } = require('../http');
const { kitSelect: select } = require('./shared-selects');
const { labelIds: parseLabels, currentLabels, sameLabels, setLabels } = require('./title-labels');
const { transaction } = require('./workflow-util');

const router = express.Router();

function validate(body) {
  const b = object(body);
  const copies = integer(b.copies, 'copies', 1);
  if (!Array.isArray(b.components) || b.components.length > copies) throw new HttpError(400, 'components is invalid.');
  const barcode = text(b.barcode, 'barcode', true, 200);
  const components = b.components.map((value) => text(value, 'component barcode', true, 200));
  if (new Set([barcode, ...components].map((value) => value.toLowerCase())).size !== components.length + 1) throw new HttpError(409, 'Kit and copy barcodes must be unique.');
  const labelIds = parseLabels(b.labelIds);
  return { titleId: text(b.titleId, 'titleId', true, 200), branch: text(b.branch, 'branch', true, 200), copies, extras: text(b.extras, 'extras'), barcode, components, labelIds };
}

async function identifiers(client, id, kit) {
  await client.query("INSERT INTO kit_identifiers(kit_id,identifier,kind) VALUES($1,$2,'kit')", [id, kit.barcode]);
  for (const component of kit.components) await client.query("INSERT INTO kit_identifiers(kit_id,identifier,kind) VALUES($1,$2,'copy')", [id, component]);
}

router.get('/', async (_req, res) => {
  const result = await getPool().query(`${select} ORDER BY k.id`);
  res.json(result.rows);
});
router.get('/:id', async (req, res) => {
  const result = await getPool().query(`${select} WHERE k.id=$1`, [req.params.id]);
  if (!result.rowCount) throw new HttpError(404, 'Record not found.');
  res.json(result.rows[0]);
});
router.post('/', async (req, res) => {
  const kit = validate(req.body);
  const id = randomUUID();
  const result = await transaction(async (client) => {
    const title = await client.query('SELECT 1 FROM titles WHERE id=$1', [kit.titleId]);
    if (!title.rowCount) throw new HttpError(404, 'Title not found.');
    await client.query('INSERT INTO kits(id,title_id,branch,copies,extras) VALUES($1,$2,$3,$4,$5)', [id, kit.titleId, kit.branch, kit.copies, kit.extras]);
    await identifiers(client, id, kit);
    if (kit.labelIds !== undefined) {
      const current = await currentLabels(client, kit.titleId);
      await setLabels(client, kit.titleId, [...new Set([...current, ...kit.labelIds])], { skipKitId: id });
    }
    return (await client.query(`${select} WHERE k.id=$1`, [id])).rows[0];
  });
  res.status(201).json(result);
});
router.put('/:id', async (req, res) => {
  const kit = validate(req.body);
  const expected = revision(req.body.revision);
  const result = await transaction(async (client) => {
    const existing = await client.query('SELECT title_id,revision FROM kits WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!existing.rowCount || existing.rows[0].revision !== expected) await checkUpdated(client, 'kits', req.params.id);
    const oldTitleId = existing.rows[0].title_id;
    if (oldTitleId !== kit.titleId && kit.labelIds !== undefined &&
        !sameLabels(await currentLabels(client, oldTitleId), kit.labelIds)) {
      throw new HttpError(409, 'Move the kit first, then edit its title tags.');
    }
    const usage = await client.query('SELECT 1 FROM schedule_assignments WHERE kit_id=$1 LIMIT 1', [req.params.id]);
    if (usage.rowCount) {
      if (oldTitleId !== kit.titleId) throw new HttpError(409, 'Cannot change the title of a scheduled kit.');
    }
    const title = await client.query('SELECT 1 FROM titles WHERE id=$1', [kit.titleId]);
    if (!title.rowCount) throw new HttpError(404, 'Title not found.');
    const updated = await client.query('UPDATE kits SET title_id=$3,branch=$4,copies=$5,extras=$6,revision=revision+1 WHERE id=$1 AND revision=$2 RETURNING id',
      [req.params.id, expected, kit.titleId, kit.branch, kit.copies, kit.extras]);
    if (!updated.rowCount) await checkUpdated(client, 'kits', req.params.id);
    await client.query('DELETE FROM kit_identifiers WHERE kit_id=$1', [req.params.id]);
    await identifiers(client, req.params.id, kit);
    if (oldTitleId === kit.titleId) await setLabels(client, kit.titleId, kit.labelIds, { skipKitId: req.params.id });
    return (await client.query(`${select} WHERE k.id=$1`, [req.params.id])).rows[0];
  });
  res.json(result);
});
router.delete('/:id', async (req, res) => {
  const expected = revision(req.header('If-Match'));
  await transaction(async (client) => {
    const result = await client.query('DELETE FROM kits WHERE id=$1 AND revision=$2 RETURNING id', [req.params.id, expected]);
    if (!result.rowCount) await checkUpdated(client, 'kits', req.params.id);
  });
  res.status(204).end();
});

module.exports = router;
