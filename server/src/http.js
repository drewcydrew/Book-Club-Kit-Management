class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'A JSON object is required.');
  return value;
}

function text(value, field, required = false, max = 2000) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new HttpError(400, `${field} is invalid.`);
  return required ? value.trim() : value;
}

function integer(value, field, minimum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > 2147483647) throw new HttpError(400, `${field} is invalid.`);
  return value;
}

function boolean(value, field) {
  if (typeof value !== 'boolean') throw new HttpError(400, `${field} is invalid.`);
  return value;
}

function revision(value) {
  if (typeof value === 'string' && /^\d+$/.test(value)) value = Number(value);
  return integer(value, 'revision', 1);
}

async function checkUpdated(client, table, id) {
  const found = await client.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id]);
  throw new HttpError(found.rowCount ? 409 : 404, found.rowCount ? 'Record changed; refresh and try again.' : 'Record not found.');
}

function errorHandler(error, _request, response, _next) {
  if (error instanceof HttpError) return response.status(error.status).json({ error: error.message });
  if (error.type === 'entity.parse.failed') return response.status(400).json({ error: 'Invalid JSON body.' });
  if (error.type === 'entity.too.large') return response.status(413).json({ error: 'Request body is too large.' });
  if (['23505', '23503'].includes(error.code)) return response.status(409).json({ error: 'Record conflicts with an existing record or reference.' });
  if (['23514', '23502', '22P02'].includes(error.code)) return response.status(400).json({ error: 'Record contains invalid values.' });
  console.error('Request failed:', error.code || 'unknown');
  const status = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', '57P01', '08006', '08001'].includes(error.code) ? 503 : 500;
  return response.status(status).json({ error: status === 503 ? 'Database unavailable.' : 'Unable to process request.' });
}

module.exports = { HttpError, object, text, integer, boolean, revision, checkUpdated, errorHandler };
