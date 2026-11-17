import assert from 'node:assert/strict';
import test from 'node:test';
import { SCHEDULE_CLUB_WIDTH, scheduleGridSizing } from '../src/components/schedule-layout';

test('desktop grid fits twelve complete cells after the club column', () => {
  for (const width of [1225, 1240, 1326, 1400]) {
    const { cellWidth, gap } = scheduleGridSizing(width, true);
    assert.ok(12 * cellWidth + 11 * gap <= width - SCHEDULE_CLUB_WIDTH);
  }
});

test('grid sizing preserves mobile dimensions and bounds desktop covers', () => {
  assert.deepEqual(scheduleGridSizing(350, false), { cellWidth: 96, gap: 8 });
  assert.equal(scheduleGridSizing(1100, true).cellWidth, 74);
  assert.equal(scheduleGridSizing(2000, true).cellWidth, 96);
});
