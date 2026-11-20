import assert from 'node:assert/strict';
import test from 'node:test';
import { draft, prepareDraftExclusions } from '../src/domain/logic';
import { dateRegeneratedSlots, prepareFullRegeneration, regenerationUnlockIds } from '../src/domain/schedule-regeneration';
import { slotChanges } from '../src/domain/cycle-overview';
import { seed } from '../src/domain/seed';

test('full regeneration replaces participating slots and dates in both modes while preserving hidden slots', () => {
  const data = seed();
  data.clubs = [
    { ...data.clubs[0], cadence: 1.5, meetingWeekday: 4, meetingOccurrence: 3, history: [] },
    data.clubs[1],
    { ...data.clubs[0], id: 'c3' },
  ];
  data.ballots = [];
  const hidden = { id: 'hidden', clubId: 'c2', month: '2027-01', meeting: null };
  const cycle = { ...data.cycles[0], startsOn: '2027-01-01', endsOn: '2027-04-30', deadline: '2027-01-21',
    finalized: { c1: ['t1'] }, slots: [
      { id: 'old-jan', clubId: 'c1', month: '2027-01', meeting: '2027-01-25' },
      { id: 'old-feb', clubId: 'c1', month: '2027-02', meeting: '2027-02-01' }, hidden,
    ] };
  const old = { id: 'old-a', cycleId: cycle.id, slotId: 'old-feb', clubId: 'c1', kitId: 'k1',
    ready: '2027-01-11', meeting: '2027-02-01', due: '2027-02-08', locked: true };
  const hiddenAssignment = { ...old, id: 'hidden-a', slotId: hidden.id, clubId: 'c2' };
  data.assignments = [old, hiddenAssignment];
  data.cycles = [cycle];
  for (const mode of ['clubs', 'utilisation'] as const) {
    let counter = 0;
    const prepared = prepareFullRegeneration(data, cycle, ['c2'], () => `${mode}-${++counter}`);
    const reset = prepared.cycle;
    assert.deepEqual(prepared.data.assignments, []);
    assert.deepEqual(regenerationUnlockIds(data.assignments, cycle.id, ['earlier-unlock', 'old-a']), ['earlier-unlock', 'old-a', 'hidden-a']);
    assert.equal(reset.slots.find((slot) => slot.id === hidden.id), hidden);
    assert.deepEqual(reset.slots.filter((slot) => slot.clubId === 'c1').map((slot) => slot.month), ['2027-01', '2027-02', '2027-04']);
    assert.ok(!reset.slots.some((slot) => slot.clubId === 'c3' || slot.id.startsWith('old-')));
    const input = prepareDraftExclusions(prepared.data, reset, ['c2']);
    const result = draft(input.data, input.cycle, false, undefined, mode);
    const dated = dateRegeneratedSlots(data, reset, ['c2']);
    const byMonth = new Map(dated.cycle.slots.filter((slot) => slot.clubId === 'c1').map((slot) => [slot.month, slot]));
    assert.equal(byMonth.get('2027-01')?.meeting, null);
    assert.equal(byMonth.get('2027-02')?.meeting, '2027-02-18');
    assert.equal(byMonth.get('2027-04')?.meeting, '2027-04-15');
    assert.ok(result.problems.some((problem) => problem.includes('2027-01-21') && problem.includes('deadline')));
    assert.ok(!result.assignments.some((item) => item.slotId === byMonth.get('2027-01')?.id));
    assert.ok(result.assignments.some((item) => item.meeting === '2027-02-18'));
    assert.ok(!result.assignments.some((item) => item.slotId === byMonth.get('2027-04')?.id));
    assert.equal(dated.cycle.slots.find((slot) => slot.id === hidden.id), hidden);
    const changes = slotChanges(cycle.slots, dated.cycle.slots);
    assert.deepEqual(changes.removedSlotIds.sort(), ['old-feb', 'old-jan']);
    assert.equal(changes.newSlots.length, 3);
    assert.deepEqual(changes.datedSlots.map((item) => item.meeting).sort(), ['2027-02-18', '2027-04-15']);
    const again = prepareFullRegeneration(data, dated.cycle, ['c2'], () => `again-${++counter}`).cycle;
    const repeated = slotChanges(cycle.slots, dateRegeneratedSlots(data, again, ['c2']).cycle.slots);
    assert.deepEqual(repeated.removedSlotIds.sort(), ['old-feb', 'old-jan']);
    assert.ok(repeated.newSlots.every((slot) => slot.id.startsWith('again-')));
  }
});

test('invalid meeting rules leave replacement slots undated and explain the problem', () => {
  const data = seed();
  const cycle = { ...data.cycles[0], startsOn: '2027-01-01', endsOn: '2027-01-31', deadline: '2026-12-01',
    slots: [{ id: 'old', clubId: 'c1', month: '2027-01', meeting: '2027-01-04' }] };
  data.clubs[0].meetingOccurrence = 5 as typeof data.clubs[0]['meetingOccurrence'];
  const reset = prepareFullRegeneration(data, cycle, [], () => 'new').cycle;
  const dated = dateRegeneratedSlots(data, reset, []);
  assert.equal(dated.cycle.slots[0].meeting, null);
  assert.match(dated.problems[0], /meeting rule is invalid.*club details/);
});

test('full regeneration keeps other-cycle assignments as kit availability constraints', () => {
  const data = seed();
  data.clubs[0] = { ...data.clubs[0], history: [], meetingWeekday: 4, meetingOccurrence: 3 };
  data.kits = data.kits.filter((kit) => kit.id === 'k1');
  data.ballots = [];
  const cycle = { ...data.cycles[0], startsOn: '2027-01-01', endsOn: '2027-01-31', deadline: '2026-12-01',
    finalized: { c1: ['t1'] }, slots: [{ id: 'old', clubId: 'c1', month: '2027-01', meeting: '2027-01-04' }] };
  const otherSlot = { id: 'other-slot', clubId: 'c2', month: '2027-01', meeting: '2027-01-21' };
  const otherCycle = { ...cycle, id: 'other', slots: [otherSlot] };
  const other = { id: 'other-a', cycleId: 'other', slotId: otherSlot.id, clubId: 'c2', kitId: 'k1',
    ready: '2026-12-31', meeting: '2027-01-21', due: '2027-01-28', locked: true };
  data.cycles = [cycle, otherCycle];
  data.assignments = [other];
  const prepared = prepareFullRegeneration(data, cycle, [], () => 'new');
  const reset = prepared.cycle;
  const input = prepared.data;
  assert.deepEqual(input.assignments, [other]);
  for (const mode of ['clubs', 'utilisation'] as const) {
    assert.ok(!draft(input, reset, false, undefined, mode).assignments.some((item) => item.cycleId === cycle.id));
    assert.ok(draft({ ...input, assignments: [] }, reset, false, undefined, mode).assignments.some((item) => item.cycleId === cycle.id));
  }
});

test('full regeneration staggers six-week clubs for both scheduling modes', () => {
  const data = seed();
  data.clubs = data.clubs.map((club, index) => ({ ...club, cadence: 1.5, cadenceOffset: index === 0 ? 1 : 2, history: [] }));
  data.ballots = [];
  const cycle = { ...data.cycles[0], startsOn: '2027-01-01', endsOn: '2027-04-30', deadline: '2026-12-01',
    finalized: { c1: ['t1', 't2', 't3'], c2: ['t1', 't2', 't3'] }, slots: [
      { id: 'old-c1', clubId: 'c1', month: '2027-01', meeting: null },
      { id: 'old-c2', clubId: 'c2', month: '2027-01', meeting: null },
    ] };
  data.cycles = [cycle];
  data.assignments = [];
  for (const mode of ['clubs', 'utilisation'] as const) {
    let sequence = 0;
    const prepared = prepareFullRegeneration(data, cycle, [], () => `${mode}-${++sequence}`);
    assert.deepEqual(prepared.cycle.slots.filter((slot) => slot.clubId === 'c1').map((slot) => slot.month), ['2027-02', '2027-03']);
    assert.deepEqual(prepared.cycle.slots.filter((slot) => slot.clubId === 'c2').map((slot) => slot.month), ['2027-01', '2027-03', '2027-04']);
    const generated = draft(prepared.data, prepared.cycle, false, undefined, mode);
    for (const assignment of generated.assignments.filter((item) => item.cycleId === cycle.id)) {
      assert.ok(prepared.cycle.slots.some((slot) => slot.id === assignment.slotId && slot.clubId === assignment.clubId));
    }
    assert.ok(generated.assignments.some((item) => item.clubId === 'c1'));
    assert.ok(generated.assignments.some((item) => item.clubId === 'c2'));
  }
});
