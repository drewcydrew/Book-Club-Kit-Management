/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { seed } from '../src/domain/seed';
import { combineData, initialLocalData } from '../src/state/local-data';
import type { SharedData } from '../src/state/api';

function sharedData(): SharedData {
  const demo = seed();
  return {
    people: demo.people,
    memberships: demo.memberships,
    membershipRevisions: demo.clubs.map((club) => ({ clubId: club.id, revision: club.membershipRevision })),
    cycles: demo.cycles,
    ballots: demo.ballots,
    assignments: demo.assignments,
    library: demo.library,
    events: demo.events,
    history: demo.clubs.filter((club) => club.history.length > 0).map((club) => ({ clubId: club.id, titles: club.history })),
    titles: demo.titles.map((title) => ({ ...title, revision: 1 })),
    kits: demo.kits.map((kit) => ({ ...kit, revision: 1 })),
    clubs: demo.clubs.map(({ leaderId: _leaderId, history: _history, membershipRevision: _membershipRevision, ...club }) => club),
    links: [],
  };
}

test('device-local persistence contains only explicit user and club selections', () => {
  const local = initialLocalData();
  assert.deepEqual(local, { version: 1, selectedPersonId: '', selectedClubId: '' });
  assert.deepEqual(Object.keys(local).sort(), ['selectedClubId', 'selectedPersonId', 'version']);
});

test('multiple club memberships and per-club leaders derive independently from shared data', () => {
  const shared = sharedData();
  shared.memberships.push({ personId: 'p3', clubId: 'c2', leader: false });
  const local = { ...initialLocalData(), selectedPersonId: 'p3', selectedClubId: 'c2' };
  const data = combineData(local, shared);
  assert.deepEqual(data.memberships.filter((membership) => membership.personId === 'p3').map((membership) => membership.clubId), ['c1', 'c2']);
  assert.equal(data.clubs.find((club) => club.id === 'c1')?.leaderId, 'p3');
  assert.equal(data.clubs.find((club) => club.id === 'c2')?.leaderId, 'p5');
  assert.equal(data.selectedClubId, 'c2');
});

test('shared records never fall back to local fixtures when the server is empty', () => {
  const empty: SharedData = {
    people: [], memberships: [], membershipRevisions: [], cycles: [], ballots: [], assignments: [],
    library: { name: 'Demo Library', branches: [], loanDays: 28, bufferDays: 3, revision: 0 },
    events: [], history: [], titles: [], kits: [], clubs: [], links: [],
  };
  const data = combineData(initialLocalData(), empty);
  assert.deepEqual(data.people, []);
  assert.deepEqual(data.clubs, []);
  assert.deepEqual(data.cycles, []);
  assert.deepEqual(data.titles, []);
});

test('missing history rows are treated as empty and selected missing references are not substituted', () => {
  const shared = sharedData();
  shared.history = [];
  const local = { ...initialLocalData(), selectedPersonId: 'removed-user', selectedClubId: 'removed-club' };
  const data = combineData(local, shared);
  assert.deepEqual(data.clubs.map((club) => club.history), [[], []]);
  assert.equal(data.selectedPersonId, 'removed-user');
  assert.equal(data.selectedClubId, 'removed-club');
});
