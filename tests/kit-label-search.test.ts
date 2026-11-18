import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogueMatches, indexKits, preferenceMatches } from '../src/domain/kit-label-search';
import type { Kit, KitLabel, Title } from '../src/domain/model';

const title: Title = { id: 't', name: 'A Book', author: 'A Writer', isbn: '12345', pages: 1, genres: 'Imported', notes: '', largePrint: false, audio: false };
const labels: KitLabel[] = [
  { id: 'g', category: 'genre', name: 'Mystery', revision: 1 },
  { id: 'v', category: 'vibe', name: 'Discussion starter', revision: 1 },
];
const labelMap = new Map(labels.map((label) => [label.id, label]));
const kit = (id: string, labelIds: string[], status: Kit['status'] = 'available'): Kit => ({
  id, titleId: 't', barcode: `kit-${id}`, components: [`copy-${id}`], branch: 'Central',
  copies: 1, extras: '', status, labelIds,
});

test('catalog search returns parent titles and identifies matching physical kits', () => {
  const kits = [kit('one', ['g']), kit('two', ['v'])];
  assert.equal(indexKits(kits).get('t')?.length, 2);
  for (const search of ['a book', 'writer', '12345']) {
    assert.equal(catalogueMatches(title, kits, labelMap, search).matches, true);
    assert.equal(catalogueMatches(title, kits, labelMap, search).matchingKitIds.size, 0);
  }
  for (const search of ['KIT-ONE', 'copy-one', 'mystery']) {
    const result = catalogueMatches(title, kits, labelMap, search);
    assert.equal(result.matches, true);
    assert.deepEqual([...result.matchingKitIds], ['one']);
  }
  assert.equal(catalogueMatches(title, [], labelMap, 'missing').matches, false);
  assert.equal(catalogueMatches(title, [], labelMap, '').matches, true);
});

test('preference filters and label searches must match the same kit, regardless of status', () => {
  const separate = [kit('one', ['g']), kit('two', ['v'])];
  const combined = [...separate, kit('three', ['g', 'v'], 'unavailable')];
  assert.equal(preferenceMatches(title, separate, labelMap, '', ['g', 'v']), false);
  assert.equal(preferenceMatches(title, combined, labelMap, '', ['g', 'v']), true);
  assert.equal(preferenceMatches(title, separate, labelMap, 'discussion', ['g']), false);
  assert.equal(preferenceMatches(title, combined, labelMap, 'discussion', ['g']), true);
  assert.equal(preferenceMatches(title, separate, labelMap, 'writer', ['g']), true);
  assert.equal(preferenceMatches(title, [], labelMap, '', []), true);
  assert.equal(preferenceMatches(title, [], labelMap, 'writer', []), true);
  assert.equal(preferenceMatches(title, [], labelMap, '', ['g']), false);
});
