const express = require('express');
const { HttpError } = require('../http');
const { normaliseIsbn } = require('../isbn');
const { lookupBook } = require('../isbndb');

const router = express.Router();
const cacheTtlMs = 10 * 60 * 1000;
const previewCache = new Map();

// Previews a cover for an ISBN without writing anything; the client stores the chosen URL with the title on save.
router.get('/covers', async (req, res) => {
  const isbn = typeof req.query.isbn === 'string' ? normaliseIsbn(req.query.isbn) : null;
  if (!isbn) throw new HttpError(400, 'ISBN is invalid.');

  const cached = previewCache.get(isbn);
  if (cached && cached.expiresAt > Date.now()) return res.json({ imageUrl: cached.imageUrl });

  const lookup = await lookupBook(isbn);
  if (!lookup) return res.json({ imageUrl: null });
  const imageUrl = lookup.book?.coverUrl ?? null;
  previewCache.set(isbn, { imageUrl, expiresAt: Date.now() + cacheTtlMs });
  res.json({ imageUrl });
});

module.exports = router;
