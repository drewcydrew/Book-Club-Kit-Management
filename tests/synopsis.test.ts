import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { parseSynopsis } from '../src/domain/synopsis';

test('splits formatted synopses into paragraphs with bold runs', () => {
  assert.deepEqual(parseSynopsis('<p><b>Now a</b> novel &amp; more.</p><p>Second</p>'), [
    [{ text: 'Now a', bold: true }, { text: ' novel & more.', bold: false }],
    [{ text: 'Second', bold: false }],
  ]);
});

test('treats plain text without paragraph tags as one paragraph', () => {
  assert.deepEqual(parseSynopsis('Old text &lt;b&gt;'), [[{ text: 'Old text <b>', bold: false }]]);
});

test('decodes numeric entities and ignores empty paragraphs', () => {
  assert.deepEqual(parseSynopsis('<p>&#8217;s</p><p> </p>'), [[{ text: '\u2019s', bold: false }]]);
});

test('returns no paragraphs for empty input', () => {
  assert.deepEqual(parseSynopsis(null), []);
  assert.deepEqual(parseSynopsis(''), []);
});
