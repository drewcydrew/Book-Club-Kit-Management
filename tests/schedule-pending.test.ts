import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { generationConfirmation, scheduleSelectionPending } from '../src/domain/schedule-pending';
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

test('generation confirmation accounts for hidden and locked assignments', () => {
  const shown = { ...assignment, id: 'shown', locked: true };
  const hidden = { ...assignment, id: 'hidden', clubId: 'other' };
  const base = [{ ...hidden, locked: true }, shown];
  const message = generationConfirmation(1, ['other'], [shown, hidden], base, false, false);
  assert.match(message ?? '', /1 shown club; 1 hidden club is excluded/);
  assert.match(message ?? '', /1 hidden-club assignment will be removed locally, including 1 locked assignment/);
  assert.match(message ?? '', /saving the draft shares these removals/);
  assert.match(generationConfirmation(1, ['other'], [shown], base, false, false) ?? '', /0 hidden-club assignments/);
  assert.equal(generationConfirmation(1, [], [shown], base, false, false), null);
  assert.ok(generationConfirmation(1, [], [assignment], base, false, false));
  assert.ok(generationConfirmation(1, [], [shown], base, true, false));
  assert.ok(generationConfirmation(1, [], [shown], base, false, true));
});
