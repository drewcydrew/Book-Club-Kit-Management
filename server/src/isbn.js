function isbn10Valid(digits) {
  if (!/^\d{9}[\dX]$/.test(digits)) return false;
  const sum = [...digits].reduce((total, char, index) => total + (char === 'X' ? 10 : Number(char)) * (10 - index), 0);
  return sum % 11 === 0;
}

function isbn13Valid(digits) {
  if (!/^\d{13}$/.test(digits)) return false;
  const sum = [...digits].reduce((total, char, index) => total + Number(char) * (index % 2 ? 3 : 1), 0);
  return sum % 10 === 0;
}

function isbn10ToIsbn13(isbn10) {
  const core = `978${isbn10.slice(0, 9)}`;
  const check = (10 - ([...core].reduce((total, char, index) => total + Number(char) * (index % 2 ? 3 : 1), 0) % 10)) % 10;
  return `${core}${check}`;
}

// Returns the normalised ISBN-13 for a valid ISBN-10 or ISBN-13, otherwise null.
function normaliseIsbn(value) {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/[\s-]/g, '').toUpperCase();
  if (isbn13Valid(digits)) return digits;
  if (isbn10Valid(digits)) return isbn10ToIsbn13(digits);
  return null;
}

module.exports = { normaliseIsbn };
