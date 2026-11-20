import assert from 'node:assert/strict';
import test from 'node:test';
import { cadenceMonths, reconcileCadence } from '../src/domain/cadence';
import { draft } from '../src/domain/logic';
import { seed } from '../src/domain/seed';

test('six-week cadence skips every third cycle month across years', () => {
  const data = seed();
  const cycle = { ...data.cycles[0], startsOn: '2027-11-01', endsOn: '2028-04-30' };
  assert.deepEqual(cadenceMonths(cycle, 1.5), ['2027-11', '2027-12', '2028-02', '2028-03']);
  assert.equal(cadenceMonths(cycle, 1).length, 6);
  assert.deepEqual(cadenceMonths({ ...cycle, endsOn: '2027-12-31' }, 1.5), ['2027-11', '2027-12']);
});

test('reconciliation preserves existing dates, handles scoped clubs and restores monthly slots', () => {
  const data = seed();
  const club = { ...data.clubs[0], cadence: 1.5 as const };
  const other = data.clubs[1];
  const cycle = { ...data.cycles[0], deadline: '2026-10-01', startsOn: '2027-01-01', endsOn: '2027-04-30', finalized: { [club.id]: ['t1', 't2'] }, slots: [
    { id: 'one', clubId: club.id, month: '2027-01', meeting: '2027-01-10' },
    { id: 'three', clubId: club.id, month: '2027-03', meeting: '2027-03-10' },
    { id: 'other', clubId: other.id, month: '2027-03', meeting: null },
  ] };
  let sequence = 0;
  const before = structuredClone(cycle);
  const result = reconcileCadence(cycle, [club, other], [club.id], () => `new${++sequence}`);
  assert.deepEqual(cycle, before);
  assert.deepEqual(result.removed.map((slot) => slot.id), ['three']);
  assert.deepEqual(result.added.map((slot) => slot.month), ['2027-02', '2027-04']);
  assert.deepEqual(result.cycle.slots.find((slot) => slot.id === 'one'), cycle.slots[0]);
  assert.ok(result.cycle.slots.some((slot) => slot.id === 'other'));
  assert.equal(reconcileCadence(result.cycle, [club, other], [club.id], () => 'unused').added.length, 0);
  const monthly = reconcileCadence(result.cycle, [{ ...club, cadence: 1 }, other], [club.id], () => 'restored');
  assert.deepEqual(monthly.added.map((slot) => slot.month), ['2027-03']);
  assert.equal(monthly.added[0].meeting, null);
  const generated = draft({ ...data, clubs: [club, other], cycles: [result.cycle], assignments: [] }, result.cycle);
  assert.ok(generated.assignments.every((assignment) => assignment.clubId !== club.id || assignment.slotId !== 'three'));
  const absent = reconcileCadence({ ...cycle, slots: [] }, [club], [club.id], () => 'unused');
  assert.deepEqual(absent.added, []);
});

test('full and single-club generation use reconciled slots in both modes', () => {
  const data = seed();
  const club = { ...data.clubs[0], cadence: 1.5 as const, history: [] };
  const cycle = { ...data.cycles[0], deadline: '2026-12-01', startsOn: '2027-01-01', endsOn: '2027-04-30',
    finalized: { [club.id]: ['t1', 't2', 't3'] }, slots: [
      { id: 'one', clubId: club.id, month: '2027-01', meeting: null },
      { id: 'three', clubId: club.id, month: '2027-03', meeting: null },
    ] };
  let sequence = 0;
  const reconciled = reconcileCadence(cycle, [club], [club.id], () => `new${++sequence}`).cycle;
  const input = { ...data, clubs: [club], cycles: [reconciled], assignments: [] };
  for (const mode of ['clubs', 'utilisation'] as const) {
    for (const scope of [undefined, { clubId: club.id }]) {
      const result = draft(input, reconciled, true, scope, mode);
      assert.deepEqual(result.assignments.map((assignment) => assignment.meeting.slice(0, 7)).sort(),
        ['2027-01', '2027-02', '2027-04']);
      assert.ok(result.assignments.every((assignment) => assignment.slotId !== 'three'));
    }
  }
});
