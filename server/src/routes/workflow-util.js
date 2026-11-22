const { withTransaction } = require('../db');
const { HttpError, text, integer } = require('../http');

function id(v, field = 'id') {
  const value = text(v, field, true, 200);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value)) throw new HttpError(400, `${field} is invalid.`);
  return value;
}
function date(v, field) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || v < '1900-01-01' || v > '9990-12-31' || Number.isNaN(Date.parse(`${v}T00:00:00Z`)) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) throw new HttpError(400, `${field} is invalid.`);
  return v;
}
function list(v, field, max = 500) {
  if (!Array.isArray(v) || v.length > max) throw new HttpError(400, `${field} is invalid.`);
  return v;
}
function unique(values, field) {
  if (new Set(values).size !== values.length) throw new HttpError(400, `${field} contains duplicates.`);
  return values;
}
function expected(v, allowZero = false) { return integer(v, 'revision', allowZero ? 0 : 1); }
async function transaction(fn) {
  return withTransaction(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(180313022)');
    return fn(c);
  });
}
async function one(c, sql, args, label = 'Record') {
  const r = await c.query(sql, args);
  if (!r.rowCount) throw new HttpError(404, `${label} not found.`);
  return r.rows[0];
}
function stale(actual, wanted) {
  if (actual !== wanted) throw new HttpError(409, 'Record changed; refresh and try again.');
}
module.exports = { id, date, list, unique, expected, transaction, one, stale };
