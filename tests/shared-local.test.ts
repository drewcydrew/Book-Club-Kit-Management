/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { seed } from '../src/domain/seed';
import { combineData, initialLocalData, localFromData } from '../src/state/local-data';
import type { SharedData } from '../src/state/api';

function sharedData(): SharedData {
  const demo = seed();
  return {
    titles: demo.titles.map((title) => ({ ...title, revision: 1 })),
    kits: demo.kits.map(({ status: _status, ...kit }) => ({ ...kit, revision: 1 })),
    clubs: demo.clubs.map(({ leaderId: _leaderId, history: _history, ...club }) => ({ ...club, revision: 1 })),
    links: [],
  };
}

test('shared records remain authoritative while circulation and history stay local', () => {
  const shared = sharedData();
  const local = initialLocalData();
  const data = combineData(local, shared);
  data.kits[0].status = 'out';
  data.clubs[0].history.push('t2');
  data.titles[0].name = 'Unpersisted local edit';
  const next = localFromData(data, local);
  const freshShared = sharedData();
  freshShared.titles[0].name = 'Server title';
  const restored = combineData(next, freshShared);
  assert.equal(restored.titles[0].name, 'Server title');
  assert.equal(restored.kits[0].status, 'out');
  assert.ok(restored.clubs[0].history.includes('t2'));
  assert.equal('titles' in next, false);
});

test('local history remains retained if shared records temporarily disappear', () => {
  const shared = sharedData();
  const local = initialLocalData();
  const data = combineData(local, { ...shared, clubs: [], kits: [] });
  const next = localFromData(data, local);
  assert.deepEqual(combineData(next, shared).clubs[0].history, ['t4']);
});
