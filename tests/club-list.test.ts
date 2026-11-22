import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { filterClubs, sortClubs } from '../src/domain/club-list';

const clubs = [
  { id: 'c3', name: 'Zebra Readers', branch: 'North' },
  { id: 'c1', name: 'book Club', branch: 'Central' },
  { id: 'c2', name: 'Atlas Society', branch: 'Harbour' },
  { id: 'c4', name: 'Club 10', branch: 'East' },
  { id: 'c5', name: 'Club 2', branch: 'East' },
];

test('sorts clubs A to Z by name, ignoring case, and reverses for Z to A', () => {
  assert.deepEqual(sortClubs(clubs, 'az').map((club) => club.name), ['Atlas Society', 'book Club', 'Club 2', 'Club 10', 'Zebra Readers']);
  assert.deepEqual(sortClubs(clubs, 'za').map((club) => club.name), ['Zebra Readers', 'Club 10', 'Club 2', 'book Club', 'Atlas Society']);
});

test('does not mutate the input array', () => {
  const input = [...clubs];
  sortClubs(input, 'za');
  assert.deepEqual(input, clubs);
});

test('search matches name or branch case-insensitively and requires every term', () => {
  assert.deepEqual(filterClubs(clubs, 'ATLAS').map((club) => club.id), ['c2']);
  assert.deepEqual(filterClubs(clubs, 'east').map((club) => club.id), ['c4', 'c5']);
  assert.deepEqual(filterClubs(clubs, 'book central').map((club) => club.id), ['c1']);
  assert.deepEqual(filterClubs(clubs, 'book harbour').map((club) => club.id), []);
  assert.equal(filterClubs(clubs, '   ').length, clubs.length);
});
