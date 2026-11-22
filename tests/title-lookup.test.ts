import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { replaceWithLookup } from '../src/domain/title-lookup';
import type { Title } from '../src/domain/model';

const existing: Title = {
  id: 't1', name: 'Old name', author: 'Old author', isbn: '9780000000002', pages: 300, genres: 'Old genre',
  labelIds: ['l1'], notes: 'keep me', largePrint: true, audio: false, coverUrl: 'old.jpg', publisher: 'Old pub',
  synopsis: 'Old synopsis', datePublished: '1999', binding: 'Hardcover', language: 'en',
};

const found = {
  title: 'New name', author: 'New author', pages: 412, genres: 'New genre', coverUrl: 'new.jpg', publisher: null,
  synopsis: 'New synopsis', datePublished: '2020', binding: null, language: 'fr',
};

test('a new ISBN result replaces every lookup field and keeps user-owned fields', () => {
  const result = replaceWithLookup(existing, '300', found);
  assert.equal(result.pages, '412');
  assert.equal(result.value.name, 'New name');
  assert.equal(result.value.author, 'New author');
  assert.equal(result.value.genres, 'New genre');
  assert.equal(result.value.coverUrl, 'new.jpg');
  assert.equal(result.value.synopsis, 'New synopsis');
  assert.equal(result.value.datePublished, '2020');
  assert.equal(result.value.language, 'fr');
  assert.equal(result.value.notes, 'keep me');
  assert.deepEqual(result.value.labelIds, ['l1']);
  assert.equal(result.value.largePrint, true);
});

test('fields ISBNdb does not return are cleared, except name and author', () => {
  const result = replaceWithLookup(existing, '300', found);
  assert.equal(result.value.publisher, null);
  assert.equal(result.value.binding, null);
  const sparse = replaceWithLookup(existing, '300', { ...found, title: null, author: null, pages: null, genres: null });
  assert.equal(sparse.pages, '');
  assert.equal(sparse.value.genres, '');
  assert.equal(sparse.value.name, 'Old name');
  assert.equal(sparse.value.author, 'Old author');
});

test('a not-found ISBN clears lookup fields and keeps name, author and user fields', () => {
  const result = replaceWithLookup(existing, '300', null);
  assert.equal(result.pages, '');
  assert.equal(result.value.genres, '');
  assert.equal(result.value.coverUrl, null);
  assert.equal(result.value.synopsis, null);
  assert.equal(result.value.publisher, null);
  assert.equal(result.value.name, 'Old name');
  assert.equal(result.value.author, 'Old author');
  assert.equal(result.value.notes, 'keep me');
});
