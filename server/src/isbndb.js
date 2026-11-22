const lookupTimeoutMs = 5000;

function cleanText(value, max) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

const htmlEntities = new Map([['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"], ['nbsp', ' ']]);

function decodeHtmlEntity(match, code) {
  if (code[0] === '#') {
    const point = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isSafeInteger(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
  }
  return htmlEntities.get(code.toLowerCase()) ?? match;
}

// Synopses can arrive as HTML; this keeps the readable text and drops the markup.
function cleanDescription(value, max) {
  if (typeof value !== 'string') return null;
  const text = value
    .replace(/<\/?(p|div|br|li|h[1-6]|tr|blockquote)\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, decodeHtmlEntity)
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.slice(0, max) : null;
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

// The detailed result lets batch jobs distinguish a missing book from an unusable response.
async function lookupBookDetailed(isbn) {
  const apiKey = process.env.ISBNDB_API_KEY;
  if (!apiKey) return { status: 'error', reason: 'ISBNDB_API_KEY is required.' };
  let response;
  try {
    response = await fetch(`https://api2.isbndb.com/book/${isbn}`, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(lookupTimeoutMs),
    });
  } catch {
    return { status: 'error', reason: 'ISBNdb network error or timeout.' };
  }
  if (response.status === 404) return { status: 'not-found' };
  if (!response.ok) {
    return { status: 'error', reason: `ISBNdb returned HTTP ${response.status}.` };
  }
  let body;
  try { body = await response.json(); } catch { return { status: 'error', reason: 'ISBNdb returned invalid JSON.' }; }
  const data = body?.book;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { status: 'error', reason: 'ISBNdb returned an invalid book record.', missingBook: true };
  }
  return {
    status: 'found',
    book: {
      title: cleanText(data.title, 200),
      author: cleanList(data.authors, 200),
      pages: cleanPages(data.pages),
      genres: cleanList(data.subjects, 2000),
      coverUrl: cleanCover(data.image),
      publisher: cleanText(data.publisher, 200),
      synopsis: cleanDescription(data.synopsis, 4000),
      datePublished: cleanText(data.date_published, 40),
      binding: cleanText(data.binding, 100),
      language: cleanText(data.language, 40),
    },
  };
}

// Preserve the existing route contract: { book }, { book: null }, or null when unavailable.
async function lookupBook(isbn) {
  const result = await lookupBookDetailed(isbn);
  if (result.status === 'found') return { book: result.book };
  if (result.status === 'not-found' || result.missingBook) return { book: null };
  console.error(`ISBNdb lookup failed: ${result.reason}`);
  return null;
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

module.exports = { lookupBook, lookupBookDetailed, searchBooks, cleanDescription };
