const express = require('express');
const { HttpError } = require('../http');
const { searchBooks } = require('../isbndb');

const router = express.Router();
const cacheTtlMs = 10 * 60 * 1000;
const maxTitleLength = 200;
const searchCache = new Map();

// Lists candidate ISBNs for a title without writing anything; the client looks up details for the chosen ISBN.
router.get('/isbn-search', async (req, res) => {
  const title = typeof req.query.title === 'string' ? req.query.title.trim() : '';
  if (!title || title.length > maxTitleLength) throw new HttpError(400, 'Title is invalid.');

  const key = title.toLowerCase();
  const cached = searchCache.get(key);
  let results = cached?.expiresAt > Date.now() ? cached.results : null;
  if (!results) {
    const search = await searchBooks(title);
    if (!search) throw new HttpError(503, 'ISBN search is unavailable right now.');
    results = search.results;
    searchCache.set(key, { results, expiresAt: Date.now() + cacheTtlMs });
  }
  if (!results.length) throw new HttpError(404, 'No books found for this title.');
  res.json({ results });
});

module.exports = router;
