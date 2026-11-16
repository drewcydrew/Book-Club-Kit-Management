const express = require('express');
const { HttpError } = require('../http');
const { normaliseIsbn } = require('../isbn');

const router = express.Router();
const lookupTimeoutMs = 5000;
const cacheTtlMs = 10 * 60 * 1000;
const previewCache = new Map();

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

// Previews a cover for an ISBN without writing anything; the client stores the chosen URL with the title on save.
router.get('/covers', async (req, res) => {
  const isbn = typeof req.query.isbn === 'string' ? normaliseIsbn(req.query.isbn) : null;
  if (!isbn) throw new HttpError(400, 'ISBN is invalid.');

  const cached = previewCache.get(isbn);
  if (cached && cached.expiresAt > Date.now()) return res.json({ imageUrl: cached.imageUrl });

  const lookup = await lookupCover(isbn);
  if (!lookup) return res.json({ imageUrl: null });
  previewCache.set(isbn, { imageUrl: lookup.imageUrl, expiresAt: Date.now() + cacheTtlMs });
  res.json({ imageUrl: lookup.imageUrl });
});

module.exports = router;
