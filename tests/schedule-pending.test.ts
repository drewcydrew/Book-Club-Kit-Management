import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { generationConfirmation, scheduleSelectionPending } from '../src/domain/schedule-pending';
import type { Assignment } from '../src/domain/model';
import { seed } from '../src/domain/seed';

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
  const data = seed();
  const cycle = { ...data.cycles[0], id: 'c', slots: [{ id: 's', clubId: 'club', month: '2027-02', meeting: '2027-02-10' }] };
  const shown = { ...assignment, id: 'shown', locked: true };
  const hidden = { ...assignment, id: 'hidden', clubId: 'other', kitId: 'k1' };
  data.kits[0].status = 'out';
  const base = [{ ...hidden, locked: true }, shown];
  const confirm = (assignments: Assignment[], dirty = false, pending = false) =>
    generationConfirmation(1, ['other'], assignments, base, dirty, pending, cycle, data.clubs, data.kits);
  const message = confirm([{ ...shown, locked: false }, hidden]);
  assert.match(message ?? '', /1 shown club; 1 hidden club is excluded/);
  assert.match(message ?? '', /1 shown-club meeting slot and their dates and assignments will be replaced/);
  assert.match(message ?? '', /1 hidden-club assignment will be removed/);
  assert.match(message ?? '', /Locked assignments will be unlocked/);
  assert.match(message ?? '', /KIT-101\): checked out/);
  assert.match(message ?? '', /remain local until validated and saved/);
  assert.match(confirm([shown]) ?? '', /0 hidden-club assignments/);
  assert.ok(generationConfirmation(1, [], [shown], base, false, false, cycle, data.clubs, data.kits));
  assert.equal(generationConfirmation(1, [], [], [], false, false, { ...cycle, slots: [] }, data.clubs, data.kits), null);
});
