import assert from 'node:assert/strict';
import test from 'node:test';
import { rankingGridTarget } from '../src/components/ranking-layout';

test('grid targets prefer the slot under the pointer and fall back to the nearest slot', () => {
  const rects = [
    { left: 0, top: 0, width: 100, height: 150 },
    { left: 110, top: 0, width: 100, height: 150 },
    { left: 0, top: 160, width: 100, height: 150 },
  ];
  assert.equal(rankingGridTarget(rects, 0, 150, 70), 1);
  assert.equal(rankingGridTarget(rects, 0, 40, 200), 2);
  assert.equal(rankingGridTarget(rects, 0, 105, 75), 0);
  assert.equal(rankingGridTarget(rects, 1, 60, 600), 2);
  assert.equal(rankingGridTarget([undefined, undefined], 1, 10, 10), 1);
});
