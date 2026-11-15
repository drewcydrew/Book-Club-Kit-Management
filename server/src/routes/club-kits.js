const express = require('express');
const { getPool } = require('../db');
const { HttpError } = require('../http');

const router = express.Router();

router.get('/club-kits', async (_req, res) => {
  const result = await getPool().query('SELECT club_id AS "clubId",kit_id AS "kitId" FROM club_kits ORDER BY club_id,kit_id');
  res.json(result.rows);
});
router.get('/clubs/:clubId/kits', async (req, res) => {
  const club = await getPool().query('SELECT 1 FROM clubs WHERE id=$1', [req.params.clubId]);
  if (!club.rowCount) throw new HttpError(404, 'Club not found.');
  const result = await getPool().query('SELECT club_id AS "clubId",kit_id AS "kitId" FROM club_kits WHERE club_id=$1 ORDER BY kit_id', [req.params.clubId]);
  res.json(result.rows);
});
router.put('/clubs/:clubId/kits/:kitId', async (req, res) => {
  const pool = getPool();
  const refs = await pool.query('SELECT EXISTS(SELECT 1 FROM clubs WHERE id=$1) AS club, EXISTS(SELECT 1 FROM kits WHERE id=$2) AS kit', [req.params.clubId, req.params.kitId]);
  if (!refs.rows[0].club || !refs.rows[0].kit) throw new HttpError(404, 'Club or kit not found.');
  await pool.query('INSERT INTO club_kits(club_id,kit_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [req.params.clubId, req.params.kitId]);
  res.status(204).end();
});
router.delete('/clubs/:clubId/kits/:kitId', async (req, res) => {
  await getPool().query('DELETE FROM club_kits WHERE club_id=$1 AND kit_id=$2', [req.params.clubId, req.params.kitId]);
  res.status(204).end();
});

module.exports = router;
