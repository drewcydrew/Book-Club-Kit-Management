import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogueMatches, indexKits, titleLabelSummary, preferenceMatches } from '../src/domain/kit-label-search';
import type { Kit, KitLabel, Title } from '../src/domain/model';

const title: Title = { id: 't', name: 'A Book', author: 'A Writer', isbn: '12345', pages: 1, genres: 'Imported', labelIds: ['g', 'v'], notes: '', largePrint: false, audio: false };
const labels: KitLabel[] = [
  { id: 'g', category: 'genre', name: 'Mystery', revision: 1 },
  { id: 'v', category: 'vibe', name: 'Discussion starter', revision: 1 },
];
const labelMap = new Map(labels.map((label) => [label.id, label]));
const kit = (id: string): Kit => ({
  id, titleId: 't', barcode: `kit-${id}`, components: [`copy-${id}`], branch: 'Central',
  copies: 1, extras: '', status: 'available', labelIds: [],
});

test('catalog search matches title tags without expanding kits and still identifies matching barcodes', () => {
  const kits = [kit('one'), kit('two')];
  assert.equal(indexKits(kits).get('t')?.length, 2);
  for (const search of ['a book', 'writer', '12345', 'mystery']) {
    const result = catalogueMatches(title, kits, labelMap, search);
    assert.equal(result.matches, true);
    assert.equal(result.matchingKitIds.size, 0);
  }
  for (const search of ['KIT-ONE', 'copy-one']) {
    assert.deepEqual([...catalogueMatches(title, kits, labelMap, search).matchingKitIds], ['one']);
  }
  assert.equal(catalogueMatches(title, [], labelMap, 'mystery').matches, true);
  assert.equal(catalogueMatches(title, [], labelMap, 'missing').matches, false);
});

test('preference search and all selected filters use title labels without requiring kits', () => {
  assert.equal(preferenceMatches(title, labelMap, 'discussion', ['g', 'v']), true);
  assert.equal(preferenceMatches(title, labelMap, 'writer', ['g']), true);
  assert.equal(preferenceMatches(title, labelMap, '', ['g', 'missing']), false);
  assert.equal(preferenceMatches({ ...title, labelIds: [] }, labelMap, 'writer', []), true);
  assert.equal(preferenceMatches({ ...title, labelIds: [] }, labelMap, '', ['g']), false);
  assert.equal(titleLabelSummary(title, labelMap), 'Genres: Mystery · Vibes: Discussion starter');
  assert.equal(titleLabelSummary({ ...title, labelIds: [] }, labelMap), 'No title labels.');
});
