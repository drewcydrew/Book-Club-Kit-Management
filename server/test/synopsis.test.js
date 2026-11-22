const test = require('node:test');
const assert = require('node:assert/strict');
const { formatSynopsis } = require('../src/synopsis');

test('formatSynopsis keeps paragraphs and bold, and drops other markup', () => {
  assert.equal(formatSynopsis('<p class="x"><strong>Now</strong> a novel</p><br><div>Second <i>part</i></div>', 4000),
    '<p><b>Now</b> a novel</p><p>Second part</p>');
  assert.equal(formatSynopsis('Plain text.', 4000), '<p>Plain text.</p>');
  assert.equal(formatSynopsis('<p>  </p>', 4000), null);
  assert.equal(formatSynopsis(null, 4000), null);
});

test('formatSynopsis escapes text so typed or encoded tags are shown, not interpreted', () => {
  assert.equal(formatSynopsis('<script>x</script> &lt;b&gt;R&amp;D &amp; more', 4000),
    '<p>x &lt;b&gt;R&amp;D &amp; more</p>');
});

test('formatSynopsis is stable when applied to its own output', () => {
  const once = formatSynopsis('<p><b>Now</b> a &amp; b</p><p>Next</p>', 4000);
  assert.equal(formatSynopsis(once, 4000), once);
});

test('formatSynopsis truncates without splitting a tag and closes open tags', () => {
  const html = formatSynopsis(`<p><b>${'word '.repeat(50)}</b></p>`, 60);
  assert.ok(html.length <= 60);
  assert.match(html, /^<p><b>word /);
  assert.match(html, /<\/b><\/p>$/);
});
