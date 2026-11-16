const express = require('express');
const { getPool } = require('../db');
const { HttpError } = require('../http');
const { normaliseIsbn } = require('../isbn');

const router = express.Router();
const lookupTimeoutMs = 5000;

// Returns { imageUrl } when ISBNdb answered, or null when the lookup should be retried later.
async function lookupCover(isbn) {
  const apiKey = process.env.ISBNDB_API_KEY;
  if (!apiKey) return null;
  let response;
  try {
    response = await fetch(`https://api2.isbndb.com/book/${isbn}`, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(lookupTimeoutMs),
    });
  } catch {
    console.error('ISBNdb cover lookup failed: network error.');
    return null;
  }
  if (response.status === 404) return { imageUrl: null };
  if (!response.ok) {
    console.error(`ISBNdb cover lookup failed: HTTP ${response.status}.`);
    return null;
  }
  let body;
  try { body = await response.json(); } catch { return null; }
  const image = body?.book?.image;
  return { imageUrl: typeof image === 'string' && /^https:\/\/.{1,1980}$/.test(image) ? image : null };
}

router.get('/titles/:titleId/cover', async (req, res) => {
  const pool = getPool();
  const title = await pool.query('SELECT isbn FROM titles WHERE id=$1', [req.params.titleId]);
  if (!title.rowCount) throw new HttpError(404, 'Title not found.');
  const isbn = normaliseIsbn(title.rows[0].isbn);
  if (!isbn) return res.json({ imageUrl: null });

  const cached = await pool.query('SELECT image_url AS "imageUrl" FROM title_covers WHERE title_id=$1 AND isbn=$2', [req.params.titleId, isbn]);
  if (cached.rowCount) return res.json({ imageUrl: cached.rows[0].imageUrl });

  const lookup = await lookupCover(isbn);
  if (!lookup) return res.json({ imageUrl: null });
  await pool.query(`INSERT INTO title_covers(title_id,isbn,image_url) VALUES($1,$2,$3)
    ON CONFLICT (title_id) DO UPDATE SET isbn=EXCLUDED.isbn, image_url=EXCLUDED.image_url, fetched_at=now()`,
  [req.params.titleId, isbn, lookup.imageUrl]);
  res.json({ imageUrl: lookup.imageUrl });
});

module.exports = router;
