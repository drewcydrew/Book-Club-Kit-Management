import assert from 'node:assert/strict';
import test from 'node:test';
import { makePreferencesExport, visiblePreferencesMatrix } from '../src/domain/preferences-export';
import { makePreferencesHtml } from '../src/domain/preferences-html';
import { priorityMatrix } from '../src/domain/cycle-overview';
import { seed } from '../src/domain/seed';

test('HTML snapshot includes only shown clubs and visible titles with rank cells', () => {
  const data = seed();
  const cycle = data.cycles[0];
  const matrix = priorityMatrix(data, cycle, ['c1'], data.assignments);
  const hidden = matrix.rows[0].titleId;
  const snapshot = makePreferencesExport(data, cycle, visiblePreferencesMatrix(matrix, [hidden], null, null));
  const html = makePreferencesHtml(snapshot, '2027-01-01');
  assert.ok(html.includes('Harbour Readers'));
  assert.ok(!html.includes('Westside Stories'));
  assert.ok(!html.includes(data.titles.find((title) => title.id === hidden)!.name));
  assert.ok(!html.includes(data.people[2].name));
  assert.ok(html.includes('data-rank="2"'));
  assert.ok(html.includes('<noscript>'));
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(!html.includes('https://'));
});

test('HTML treats hostile names as text and rejects inconsistent or invalid cells', () => {
  const data = seed();
  data.clubs[0].name = '</script><img src=x onerror=alert(1)>';
  data.titles[0].name = '"</script><script>alert(1)</script>&';
  data.titles[0].coverUrl = 'https://example.invalid/secret';
  data.cycles[0].name = 'Cycle </script>\u2028 &';
  const cycle = data.cycles[0];
  const snapshot = makePreferencesExport(data, cycle, priorityMatrix(data, cycle, ['c1'], data.assignments));
  const html = makePreferencesHtml(snapshot, '2027-01-01');
  assert.ok(html.includes('&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('&quot;&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;&amp;'));
  assert.equal((html.match(/<script>/g) ?? []).length, 1);
  assert.ok(!html.includes('https://example.invalid/secret'));
  snapshot.titles[0].cells[0].clubId = 'wrong';
  assert.throws(() => makePreferencesHtml(snapshot, '2027-01-01'), /columns are inconsistent/);
  snapshot.titles[0].cells[0].clubId = snapshot.clubs[0].id;
  snapshot.titles[0].cells[0].rank = -1;
  assert.throws(() => makePreferencesHtml(snapshot, '2027-01-01'), /invalid rank/);
});
