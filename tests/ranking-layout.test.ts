import assert from 'node:assert/strict';
import test from 'node:test';
import { rankingDragTarget, rankingGridTarget } from '../src/components/ranking-layout';

test('drag targets use current variable-height order and row gaps in both directions', () => {
  assert.equal(rankingDragTarget([100, 200, 80], 0, 157), 0);
  assert.equal(rankingDragTarget([100, 200, 80], 0, 158), 1);
  assert.equal(rankingDragTarget([100, 200, 80], 0, 306), 2);
  assert.equal(rankingDragTarget([200, 80, 100], 2, -98), 1);
  assert.equal(rankingDragTarget([200, 80, 100], 2, -246), 0);
  assert.equal(rankingDragTarget([100, undefined, 80], 0, 1000), 0);
});

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
