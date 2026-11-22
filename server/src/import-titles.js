const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { getPool } = require('./db');
const { assertLegacyScriptSupported } = require('./legacy-script-guard');
const { normaliseIsbn } = require('./isbn');

const DEFAULT_FILE = path.join(__dirname, '..', 'data', 'titles-import.tsv');
const MAX_TEXT = 200;

// Strips catalogue markers such as "[bookclub]" and trailing " /" from list entries.
function cleanText(value) {
  return value.replace(/\[bookclub\]/gi, ' ').replace(/\s*\/\s*$/, '').replace(/\s+/g, ' ').trim();
}

// Expects tab-separated lines: Title, Author, ISBN-13. A header row and blank lines are ignored.
function parseTitleList(content) {
  const rows = [];
  const invalid = [];
  const duplicates = [];
  const seen = new Set();
  content.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    const [rawName = '', rawAuthor = '', rawIsbn = ''] = line.split('\t');
    if (rawIsbn.trim() === 'ISBN-13') return;
    const lineNumber = index + 1;
    const isbn = normaliseIsbn(rawIsbn.trim());
    const name = cleanText(rawName);
    const author = cleanText(rawAuthor);
    if (!isbn || !name || !author || name.length > MAX_TEXT || author.length > MAX_TEXT) {
      invalid.push({ line: lineNumber, value: rawIsbn.trim() || name });
      return;
    }
    if (seen.has(isbn)) {
      duplicates.push({ line: lineNumber, isbn });
      return;
    }
    seen.add(isbn);
    rows.push({ isbn, name, author });
  });
  return { rows, invalid, duplicates };
}

// Inserts rows whose ISBN is not already in titles, in one transaction. Titles start with pages 0 (unknown).
async function importTitles(pool, rows, { dryRun = false } = {}) {
  const existing = await pool.query('SELECT isbn FROM titles WHERE isbn = ANY($1)', [rows.map((row) => row.isbn)]);
  const existingIsbns = new Set(existing.rows.map((row) => row.isbn));
  const toInsert = rows.filter((row) => !existingIsbns.has(row.isbn));
  if (!dryRun && toInsert.length) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of toInsert) {
        await client.query('INSERT INTO titles (id,name,author,isbn,pages) VALUES ($1,$2,$3,$4,0)', [randomUUID(), row.name, row.author, row.isbn]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  return { added: toInsert.length, existing: rows.length - toInsert.length };
}

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const file = args.find((arg) => !arg.startsWith('--')) || DEFAULT_FILE;
    const pool = getPool();
    try {
      await assertLegacyScriptSupported(pool);
      const { rows, invalid, duplicates } = parseTitleList(await fs.readFile(file, 'utf8'));
      const { added, existing } = await importTitles(pool, rows, { dryRun });
      console.log(`${dryRun ? 'Would import' : 'Imported'} ${added} titles; ${existing} already in catalogue; ${duplicates.length} duplicate ISBNs skipped; ${invalid.length} invalid rows skipped.`);
      for (const item of invalid) console.log(`  invalid line ${item.line}: ${item.value}`);
      for (const item of duplicates) console.log(`  duplicate line ${item.line}: ${item.isbn}`);
    } finally {
      await pool.end();
    }
  })().catch((error) => {
    console.error('Title import failed:', error.code === 'LIBRARY_SERVICES_UNSUPPORTED' ? error.message : error.code || (error.message.startsWith('DATABASE_URL') ? error.message : 'unknown'));
    process.exitCode = 1;
  });
}

module.exports = { parseTitleList, importTitles };
