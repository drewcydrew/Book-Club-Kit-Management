const lookupTimeoutMs = 5000;

function cleanText(value, max) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function cleanList(value, max) {
  if (!Array.isArray(value)) return null;
  const items = [];
  let length = 0;
  for (const item of value) {
    const clean = cleanText(item, max);
    if (!clean) continue;
    length += (items.length ? 2 : 0) + clean.length;
    if (length > max) break;
    items.push(clean);
  }
  return items.length ? items.join(', ') : null;
}

function cleanPages(value) {
  return Number.isSafeInteger(value) && value > 0 && value <= 100000 ? value : null;
}

function cleanCover(value) {
  return typeof value === 'string' && /^https:\/\/.{1,1980}$/.test(value) ? value : null;
}

// Returns { book } for a known ISBN, { book: null } when ISBNdb has no record, or null when ISBNdb is unavailable.
async function lookupBook(isbn) {
  const apiKey = process.env.ISBNDB_API_KEY;
  if (!apiKey) return null;
  let response;
  try {
    response = await fetch(`https://api2.isbndb.com/book/${isbn}`, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(lookupTimeoutMs),
    });
  } catch {
    console.error('ISBNdb lookup failed: network error.');
    return null;
  }
  if (response.status === 404) return { book: null };
  if (!response.ok) {
    console.error(`ISBNdb lookup failed: HTTP ${response.status}.`);
    return null;
  }
  let body;
  try { body = await response.json(); } catch { return null; }
  const data = body?.book;
  if (!data || typeof data !== 'object') return { book: null };
  return {
    book: {
      title: cleanText(data.title, 200),
      author: cleanList(data.authors, 200),
      pages: cleanPages(data.pages),
      genres: cleanList(data.subjects, 2000),
      coverUrl: cleanCover(data.image),
      publisher: cleanText(data.publisher, 200),
      synopsis: cleanText(data.synopsis, 4000),
      datePublished: cleanText(data.date_published, 40),
      binding: cleanText(data.binding, 100),
      language: cleanText(data.language, 40),
    },
  };
}

// Returns { results } of candidate ISBNs for a title, or null when ISBNdb is unavailable.
async function searchBooks(title) {
  const apiKey = process.env.ISBNDB_API_KEY;
  if (!apiKey) return null;
  let response;
  try {
    response = await fetch(`https://api2.isbndb.com/books/${encodeURIComponent(title)}?pageSize=10&column=title`, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(lookupTimeoutMs),
    });
  } catch {
    console.error('ISBNdb search failed: network error.');
    return null;
  }
  if (response.status === 404) return { results: [] };
  if (!response.ok) {
    console.error(`ISBNdb search failed: HTTP ${response.status}.`);
    return null;
  }
  let body;
  try { body = await response.json(); } catch { return null; }
  const books = Array.isArray(body?.books) ? body.books : [];
  const results = [];
  const seen = new Set();
  for (const item of books) {
    const isbn = cleanText(item?.isbn13, 13);
    if (!isbn || !/^\d{13}$/.test(isbn) || seen.has(isbn)) continue;
    seen.add(isbn);
    results.push({
      isbn,
      title: cleanText(item.title, 200),
      author: cleanList(item.authors, 200),
      datePublished: cleanText(item.date_published, 40),
    });
  }
  return { results };
}

module.exports = { lookupBook, searchBooks };
