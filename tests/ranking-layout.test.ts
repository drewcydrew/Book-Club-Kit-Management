import assert from 'node:assert/strict';
import test from 'node:test';
import { rankingDragTarget } from '../src/components/ranking-layout';

test('drag targets use current variable-height order and row gaps in both directions', () => {
  assert.equal(rankingDragTarget([100, 200, 80], 0, 157), 0);
  assert.equal(rankingDragTarget([100, 200, 80], 0, 158), 1);
  assert.equal(rankingDragTarget([100, 200, 80], 0, 306), 2);
  assert.equal(rankingDragTarget([200, 80, 100], 2, -98), 1);
  assert.equal(rankingDragTarget([200, 80, 100], 2, -246), 0);
  assert.equal(rankingDragTarget([100, undefined, 80], 0, 1000), 0);
});
