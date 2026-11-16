const express = require('express');
const { HttpError } = require('../http');
const { normaliseIsbn } = require('../isbn');
const { lookupBook } = require('../isbndb');

const router = express.Router();
const cacheTtlMs = 10 * 60 * 1000;
const lookupCache = new Map();

// Fills in title details for an ISBN without writing anything; the client keeps whatever the user saves.
router.get('/isbn-lookup', async (req, res) => {
  const isbn = typeof req.query.isbn === 'string' ? normaliseIsbn(req.query.isbn) : null;
  if (!isbn) throw new HttpError(400, 'ISBN is invalid.');

  const cached = lookupCache.get(isbn);
  if (!cached || cached.expiresAt <= Date.now()) {
    const lookup = await lookupBook(isbn);
    if (!lookup) throw new HttpError(503, 'ISBN lookup is unavailable right now.');
    lookupCache.set(isbn, { book: lookup.book, expiresAt: Date.now() + cacheTtlMs });
    if (!lookup.book) throw new HttpError(404, 'No book found for this ISBN.');
    return res.json(lookup.book);
  }
  if (!cached.book) throw new HttpError(404, 'No book found for this ISBN.');
  res.json(cached.book);
});

module.exports = router;
