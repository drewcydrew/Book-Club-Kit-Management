const assert = require('node:assert/strict');
const test = require('node:test');
const { normaliseIsbn } = require('../src/isbn');

test('ISBN lookup accepts valid ISBN-13 and ISBN-10 values and rejects bad checksums', () => {
  assert.equal(normaliseIsbn('978-0-306-40615-7'), '9780306406157');
  assert.equal(normaliseIsbn('0-306-40615-2'), '9780306406157');
  assert.equal(normaliseIsbn('0306406152'), '9780306406157');
  assert.equal(normaliseIsbn('080442957X'), '9780804429573');
  assert.equal(normaliseIsbn('9780306406158'), null);
  assert.equal(normaliseIsbn('0306406153'), null);
  assert.equal(normaliseIsbn(''), null);
});
