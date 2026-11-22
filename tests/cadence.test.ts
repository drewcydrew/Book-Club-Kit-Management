import assert from 'node:assert/strict';
import test from 'node:test';
import { cadenceMonths, reconcileCadence } from '../src/domain/cadence';
import { draft } from '../src/domain/logic';
import { seed } from '../src/domain/seed';

test('six-week offsets stagger skipped months across years without affecting monthly clubs', () => {
  const data = seed();
  const cycle = { ...data.cycles[0], startsOn: '2027-11-01', endsOn: '2028-04-30' };
  const club = { ...data.clubs[0], cadence: 1.5 as const };
  assert.deepEqual(cadenceMonths(cycle, { ...club, cadenceOffset: 0 }), ['2027-11', '2027-12', '2028-02', '2028-03']);
  assert.deepEqual(cadenceMonths(cycle, { ...club, cadenceOffset: 1 }), ['2027-12', '2028-01', '2028-03', '2028-04']);
  assert.deepEqual(cadenceMonths(cycle, { ...club, cadenceOffset: 2 }), ['2027-11', '2028-01', '2028-02', '2028-04']);
  assert.equal(cadenceMonths(cycle, { ...club, cadence: 1, cadenceOffset: 2 }).length, 6);
  assert.deepEqual(cadenceMonths({ ...cycle, endsOn: '2027-11-30' }, { ...club, cadenceOffset: 1 }), []);
  assert.deepEqual(cadenceMonths({ ...cycle, endsOn: '2027-12-31' }, { ...club, cadenceOffset: 2 }), ['2027-11']);
  const year = { ...cycle, startsOn: '2027-01-01', endsOn: '2027-12-31' };
  const allMonths = cadenceMonths(year, { ...club, cadence: 1 });
  for (const [offset, skipped] of [
    [0, ['2027-03', '2027-06', '2027-09', '2027-12']],
    [1, ['2027-01', '2027-04', '2027-07', '2027-10']],
    [2, ['2027-02', '2027-05', '2027-08', '2027-11']],
  ] as const) {
    const included = cadenceMonths(year, { ...club, cadenceOffset: offset });
    assert.deepEqual(allMonths.filter((month) => !included.includes(month)), skipped);
  }
});

test('reconciliation applies an offset only to selected clubs and preserves retained dates', () => {
  const data = seed();
  const club = { ...data.clubs[0], cadence: 1.5 as const, cadenceOffset: 1 as const };
  const other = data.clubs[1];
  const cycle = { ...data.cycles[0], startsOn: '2027-01-01', endsOn: '2027-04-30', slots: [
    { id: 'jan', clubId: club.id, month: '2027-01', meeting: '2027-01-11' },
    { id: 'mar', clubId: club.id, month: '2027-03', meeting: '2027-03-08' },
    { id: 'other', clubId: other.id, month: '2027-01', meeting: null },
  ] };
  const result = reconcileCadence(cycle, [club, other], [club.id], () => 'new-feb');
  assert.deepEqual(result.removed.map((slot) => slot.id), ['jan']);
  assert.deepEqual(result.added.map((slot) => slot.month), ['2027-02']);
  assert.deepEqual(result.cycle.slots.find((slot) => slot.id === 'mar'), cycle.slots[1]);
  assert.deepEqual(result.cycle.slots.find((slot) => slot.id === 'other'), cycle.slots[2]);
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
  const absent = reconcileCadence({ ...cycle, slots: [] }, [club], [club.id], () => `new${++sequence}`);
  assert.deepEqual(absent.added.map((slot) => slot.month), ['2027-01', '2027-02', '2027-04']);
});

test('single-club reconciliation creates slots without changing another club or its assignments', () => {
  const data = seed();
  data.ballots = [];
  data.clubs[0] = { ...data.clubs[0], history: [] };
  const otherSlot = { id: 'other-slot', clubId: 'c2', month: '2027-01', meeting: '2027-01-04' };
  const cycle = { ...data.cycles[0], deadline: '2026-12-01', startsOn: '2027-01-01', endsOn: '2027-02-28',
    finalized: { c1: ['t1'] }, slots: [otherSlot] };
  const other = { id: 'other-assignment', cycleId: cycle.id, slotId: otherSlot.id, clubId: 'c2', kitId: 'k3',
    ready: '2026-12-07', meeting: '2027-01-04', due: '2027-02-01', locked: true };
  data.cycles = [cycle];
  data.assignments = [other];
  let sequence = 0;
  const reconciled = reconcileCadence(cycle, data.clubs, ['c1'], () => `new-${++sequence}`);
  assert.deepEqual(reconciled.added.map((slot) => slot.month), ['2027-01', '2027-02']);
  assert.deepEqual(reconciled.cycle.slots.find((slot) => slot.id === otherSlot.id), otherSlot);
  for (const mode of ['clubs', 'utilisation'] as const) {
    const result = draft({ ...data, cycles: [reconciled.cycle] }, reconciled.cycle, true, { clubId: 'c1' }, mode);
    assert.deepEqual(result.assignments.find((assignment) => assignment.id === other.id), other);
    assert.ok(result.assignments.some((assignment) => assignment.clubId === 'c1'));
  }
  assert.throws(() => reconcileCadence(cycle, data.clubs, ['missing'], () => 'new'), /unavailable clubs/);
});

test('full and single-club generation use reconciled slots in both modes and offset phases', () => {
  const data = seed();
  const club = { ...data.clubs[0], cadence: 1.5 as const, history: [] };
  const cycle = { ...data.cycles[0], deadline: '2026-12-01', startsOn: '2027-01-01', endsOn: '2027-04-30',
    finalized: { [club.id]: ['t1', 't2', 't3'] }, slots: [
      { id: 'one', clubId: club.id, month: '2027-01', meeting: null },
      { id: 'three', clubId: club.id, month: '2027-03', meeting: null },
    ] };
  for (const offset of [0, 1] as const) {
    const phasedClub = { ...club, cadenceOffset: offset };
    let sequence = 0;
    const reconciled = reconcileCadence(cycle, [phasedClub], [club.id], () => `new${++sequence}`).cycle;
    const input = { ...data, clubs: [phasedClub], cycles: [reconciled], assignments: [] };
    for (const mode of ['clubs', 'utilisation'] as const) {
      for (const scope of [undefined, { clubId: club.id }]) {
        const result = draft(input, reconciled, true, scope, mode);
        assert.deepEqual(result.assignments.map((assignment) => assignment.meeting.slice(0, 7)).sort(),
          offset === 0 ? ['2027-01', '2027-02', '2027-04'] : ['2027-02', '2027-03']);
        assert.ok(result.assignments.every((assignment) => assignment.slotId !== (offset === 0 ? 'three' : 'one')));
      }
    }
  }
});
