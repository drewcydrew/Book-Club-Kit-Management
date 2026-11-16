const { records } = require('./records');
const { object, text, integer, boolean, HttpError } = require('../http');
const { titleColumns } = require('./shared-selects');

function coverUrl(value) {
  if (value === null || value === undefined || value === '') return null;
  const url = text(value, 'coverUrl', false, 2000);
  if (!/^https:\/\//.test(url)) throw new HttpError(400, 'coverUrl is invalid.');
  return url;
}

module.exports = records({
  table: 'titles',
  columns: ['name', 'author', 'isbn', 'pages', 'genres', 'notes', 'large_print', 'audio', 'cover_url'],
  select: titleColumns,
  validate(value) {
    const b = object(value);
    return [text(b.name, 'name', true, 200), text(b.author, 'author', true, 200), text(b.isbn, 'isbn', false, 40),
      integer(b.pages, 'pages', 0), text(b.genres, 'genres'), text(b.notes, 'notes'), boolean(b.largePrint, 'largePrint'), boolean(b.audio, 'audio'), coverUrl(b.coverUrl)];
  },
});
