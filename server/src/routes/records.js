const express = require('express');
const { randomUUID } = require('node:crypto');
const { getPool } = require('../db');
const { HttpError, revision, checkUpdated } = require('../http');

function records({ table, columns, select, validate, remove }) {
  const router = express.Router();
  router.get('/', async (_req, res) => {
    const result = await getPool().query(`SELECT ${select} FROM ${table} ORDER BY id`);
    res.json(result.rows);
  });
  router.get('/:id', async (req, res) => {
    const result = await getPool().query(`SELECT ${select} FROM ${table} WHERE id = $1`, [req.params.id]);
    if (!result.rowCount) throw new HttpError(404, 'Record not found.');
    res.json(result.rows[0]);
  });
  router.post('/', async (req, res) => {
    const values = validate(req.body);
    const placeholders = values.map((_, index) => `$${index + 2}`).join(',');
    const result = await getPool().query(`INSERT INTO ${table} (id,${columns.join(',')}) VALUES ($1,${placeholders}) RETURNING ${select}`, [randomUUID(), ...values]);
    res.status(201).json(result.rows[0]);
  });
  router.put('/:id', async (req, res) => {
    const values = validate(req.body);
    const expected = revision(req.body.revision);
    const setters = columns.map((column, index) => `${column}=$${index + 3}`).join(',');
    const result = await getPool().query(`UPDATE ${table} SET ${setters},revision=revision+1 WHERE id=$1 AND revision=$2 RETURNING ${select}`, [req.params.id, expected, ...values]);
    if (!result.rowCount) await checkUpdated(getPool(), table, req.params.id);
    res.json(result.rows[0]);
  });
  router.delete('/:id', remove || (async (req, res) => {
    const expected = revision(req.header('If-Match'));
    const result = await getPool().query(`DELETE FROM ${table} WHERE id=$1 AND revision=$2 RETURNING id`, [req.params.id, expected]);
    if (!result.rowCount) await checkUpdated(getPool(), table, req.params.id);
    res.status(204).end();
  }));
  return router;
}

module.exports = { records };
