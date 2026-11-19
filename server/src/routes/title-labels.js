const { HttpError, text } = require('../http');

function labelIds(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 1000) throw new HttpError(400, 'labelIds is invalid.');
  const ids = value.map((id) => text(id, 'label ID', true, 200));
  if (new Set(ids).size !== ids.length) throw new HttpError(400, 'Duplicate labels are not allowed.');
  return ids;
}

async function currentLabels(client, titleId) {
  return (await client.query('SELECT label_id FROM title_label_assignments WHERE title_id=$1 ORDER BY label_id', [titleId])).rows.map((row) => row.label_id);
}

function sameLabels(a, b) {
  return a.length === b.length && a.every((id) => b.includes(id));
}

async function setLabels(client, titleId, ids, { titleUpdated = false, skipKitId = null } = {}) {
  if (ids === undefined) return false;
  const found = await client.query('SELECT id FROM kit_labels WHERE id=ANY($1::text[])', [ids]);
  if (found.rowCount !== ids.length) throw new HttpError(409, 'A selected label is no longer available. Refresh and retry.');
  const current = await currentLabels(client, titleId);
  if (sameLabels(current, ids)) return false;
  await client.query('DELETE FROM title_label_assignments WHERE title_id=$1', [titleId]);
  await client.query('INSERT INTO title_label_assignments(title_id,label_id) SELECT $1,unnest($2::text[])', [titleId, ids]);
  if (!titleUpdated) await client.query('UPDATE titles SET revision=revision+1 WHERE id=$1', [titleId]);
  await client.query('UPDATE kits SET revision=revision+1 WHERE title_id=$1 AND ($2::text IS NULL OR id<>$2)', [titleId, skipKitId]);
  return true;
}

module.exports = { labelIds, currentLabels, sameLabels, setLabels };
