import assert from 'node:assert/strict';
import test from 'node:test';
import { meetingDate, meetingRuleLabel, preserveUnassignedMeetingDates } from '../src/domain/meeting-rule';
import { draft, meetingFor } from '../src/domain/logic';
import { slotChanges } from '../src/domain/cycle-overview';
import { seed } from '../src/domain/seed';
import type { MeetingWeekday } from '../src/domain/model';

test('monthly rules calculate every weekday and the last occurrence in leap and ordinary years', () => {
  for (const weekday of [0, 1, 2, 3, 4, 5, 6] as MeetingWeekday[]) {
    assert.equal(meetingDate('2027-08', { meetingWeekday: weekday, meetingOccurrence: 1 }), `2027-08-0${weekday + 1}`);
  }
  assert.equal(meetingDate('2024-02', { meetingWeekday: 4, meetingOccurrence: 4 }), '2024-02-22');
  assert.equal(meetingDate('2024-02', { meetingWeekday: 4, meetingOccurrence: -1 }), '2024-02-29');
  assert.equal(meetingDate('2025-02', { meetingWeekday: 4, meetingOccurrence: -1 }), '2025-02-27');
  assert.equal(meetingDate('2026-12', { meetingWeekday: 1, meetingOccurrence: 2 }), '2026-12-14');
  assert.equal(meetingDate('2027-01', { meetingWeekday: 4, meetingOccurrence: 3 }), '2027-01-21');
  assert.equal(meetingRuleLabel({ meetingWeekday: 4, meetingOccurrence: -1 }), 'Last Thursday');
  assert.throws(() => meetingDate('2027-13', { meetingWeekday: 4, meetingOccurrence: 1 }), /invalid/);
});

test('explicit and staged dates take precedence over a changed club rule', () => {
  const data = seed();
  const club = { ...data.clubs[0], meetingWeekday: 4 as const, meetingOccurrence: 3 as const };
  const slot = { id: 's', clubId: club.id, month: '2027-01', meeting: null };
  assert.equal(meetingFor(slot, club), '2027-01-21');
  assert.equal(meetingFor(slot, club, '2027-01-11'), '2027-01-11');
  assert.equal(meetingFor({ ...slot, meeting: '2027-01-04' }, club, '2027-01-11'), '2027-01-04');
  assert.deepEqual(slotChanges([slot], [{ ...slot, meeting: '2027-01-11' }]).datedSlots, [{ id: 's', meeting: '2027-01-11' }]);
  const cycle = { ...data.cycles[0], slots: [slot] };
  const staged = { id: 'a', cycleId: cycle.id, slotId: slot.id, clubId: club.id, kitId: 'k1',
    ready: '2026-12-21', meeting: '2027-01-11', due: '2027-01-18', locked: false };
  const retained = preserveUnassignedMeetingDates(cycle, [staged], []);
  assert.equal(retained.slots[0].meeting, '2027-01-11');
  assert.deepEqual(slotChanges(cycle.slots, retained.slots).datedSlots, [{ id: 's', meeting: '2027-01-11' }]);
  assert.equal(preserveUnassignedMeetingDates(cycle, [staged], [staged]).slots[0].meeting, null);
});

test('both generation modes respect rule dates, deadline, staged dates and actual loan overlap', () => {
  const data = seed();
  data.clubs = data.clubs.map((club) => ({ ...club, history: [], meetingWeekday: 1, meetingOccurrence: 1 }));
  data.kits = data.kits.filter((kit) => kit.id === 'k1');
  data.ballots = [];
  data.assignments = [];
  const cycle = { ...data.cycles[0], deadline: '2026-12-01', startsOn: '2027-01-01', endsOn: '2027-02-28',
    finalized: { c1: ['t1'], c2: ['t1'] }, slots: [
      { id: 'jan', clubId: 'c1', month: '2027-01', meeting: null },
      { id: 'feb', clubId: 'c2', month: '2027-02', meeting: null },
    ] };
  data.cycles = [cycle];
  for (const mode of ['clubs', 'utilisation'] as const) {
    const conflicting = draft(data, cycle, false, undefined, mode);
    assert.equal(conflicting.assignments.length, 1);
    data.clubs[1].meetingOccurrence = 3;
    const compatible = draft(data, cycle, false, undefined, mode);
    assert.deepEqual(compatible.assignments.map((a) => a.meeting).sort(), ['2027-01-04', '2027-02-15']);
    const first = compatible.assignments.find((a) => a.slotId === 'jan')!;
    const scoped = draft({ ...data, assignments: [first] }, cycle, false, { clubId: 'c2' }, mode);
    assert.equal(scoped.assignments.find((a) => a.slotId === 'feb')?.meeting, '2027-02-15');
    const staged = { ...first, meeting: '2027-01-11', ready: '2026-12-21', due: '2027-01-18' };
    const regenerated = draft({ ...data, assignments: [staged] }, cycle, false, undefined, mode);
    assert.equal(regenerated.assignments.find((a) => a.slotId === 'jan')?.meeting, '2027-01-11');
    const blockedCycle = { ...cycle, deadline: '2027-01-04' };
    const blocked = draft({ ...data, cycles: [blockedCycle] }, blockedCycle, false, undefined, mode);
    assert.ok(!blocked.assignments.some((a) => a.slotId === 'jan'));
    assert.ok(blocked.problems.some((problem) => problem.includes('2027-01-04') && problem.includes('deadline')));
    data.clubs[1].meetingOccurrence = 1;
  }
});
