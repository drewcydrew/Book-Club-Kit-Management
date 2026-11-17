import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { scheduleSelectionPending } from '../src/domain/schedule-pending';
import type { Assignment } from '../src/domain/model';

const assignment: Assignment = {
  id: 'a', cycleId: 'c', slotId: 's', clubId: 'club', kitId: 'kit',
  meeting: '2027-02-10', ready: '2027-02-01', due: '2027-02-20', locked: false,
};

test('assigned selections detect changed and reverted kit, date and swap', () => {
  const check = (kit: string, meeting: string, swap = '') => scheduleSelectionPending(assignment, assignment.meeting, kit, meeting, swap);
  assert.deepEqual(check('kit', assignment.meeting), { selection: false, swap: false });
  assert.equal(check('other', assignment.meeting).selection, true);
  assert.equal(check('kit', '2027-02-11').selection, true);
  assert.deepEqual(check('kit', assignment.meeting, 'other'), { selection: false, swap: true });
  assert.equal(scheduleSelectionPending({ ...assignment, locked: true }, assignment.meeting, 'kit', assignment.meeting, '').selection, false);
  assert.equal(scheduleSelectionPending({ ...assignment, kitId: 'other' }, assignment.meeting, 'other', assignment.meeting, '').selection, false);
});

test('unassigned and cleared meetings use their initial date as baseline', () => {
  const check = (kit: string, meeting: string) => scheduleSelectionPending(undefined, '2027-02-10', kit, meeting, '');
  assert.equal(check('', '2027-02-10').selection, false);
  assert.equal(check('kit', '2027-02-10').selection, true);
  assert.equal(check('', '2027-02-11').selection, true);
  assert.equal(check('', '2027-02-10').selection, false);
});
