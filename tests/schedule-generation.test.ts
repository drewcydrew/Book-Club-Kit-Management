/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { assignmentProblem, draft, draftAsync, exclusionUnlockIds, fairness, prepareDraftExclusions } from '../src/domain/logic';
import { seed } from '../src/domain/seed';
import type { Data } from '../src/domain/model';

function scenario(choices: string[][]): Data {
  const data = seed();
  const template = data.clubs[0];
  data.clubs = choices.map((_, index) => ({ ...template, id: `c${index + 1}`, name: `Club ${index + 1}`, history: [] }));
  data.kits = data.kits.filter((kit) => ['k1', 'k3', 'k4'].includes(kit.id));
  data.kits.forEach((kit) => { kit.branch = 'Central'; });
  data.ballots = [];
  data.assignments = [];
  const cycle = data.cycles[0];
  cycle.deadline = '2026-12-15';
  cycle.startsOn = '2027-01-01';
  cycle.endsOn = '2027-12-31';
  cycle.finalized = Object.fromEntries(choices.map((ranking, index) => [`c${index + 1}`, ranking]));
  cycle.slots = choices.map((_, index) => ({ id: `s${index + 1}`, clubId: `c${index + 1}`, month: '2027-01', meeting: '2027-01-04' }));
  return data;
}

function assignedTitles(data: Data, assignments = draft(data, data.cycles[0]).assignments) {
  return Object.fromEntries(assignments.filter((a) => a.cycleId === data.cycles[0].id)
    .map((a) => [a.slotId, data.kits.find((kit) => kit.id === a.kitId)?.titleId]));
}

test('exclusion removes only current-cycle assignments, retains other-cycle conflicts and records shared unlocks', () => {
  const data = scenario([['t1'], ['t1', 't2']]);
  const cycle = data.cycles[0];
  const sharedLock = { id: 'shared-lock', cycleId: cycle.id, slotId: 's1', clubId: 'c1', kitId: 'k1',
    ready: '2026-12-14', meeting: '2027-01-04', due: '2027-01-11', locked: true };
  const other = { ...sharedLock, id: 'other', cycleId: 'other-cycle', slotId: 'other-slot', kitId: 'k3', locked: false };
  data.cycles.push({ ...cycle, id: 'other-cycle', slots: [{ id: 'other-slot', clubId: 'c1', month: '2027-01', meeting: '2027-01-04' }] });
  data.assignments = [sharedLock, other];
  const before = structuredClone(data);
  const input = prepareDraftExclusions(data, cycle, ['c1']);
  assert.deepEqual(data, before);
  assert.deepEqual(input.removed, [sharedLock]);
  assert.deepEqual(input.cycle.slots.map((slot) => slot.id), ['s2']);
  assert.deepEqual(exclusionUnlockIds([sharedLock], input.removed, ['previous', 'shared-lock']), ['previous', 'shared-lock']);
  assert.deepEqual(exclusionUnlockIds([sharedLock], [{ ...sharedLock, locked: false }], []), ['shared-lock']);
  assert.deepEqual(exclusionUnlockIds([], input.removed, []), []);
  for (const mode of ['clubs', 'utilisation'] as const) {
    const result = draft(input.data, input.cycle, true, undefined, mode);
    assert.deepEqual(assignedTitles(data, result.assignments), { s2: 't1' });
    assert.deepEqual(result.assignments.find((assignment) => assignment.id === other.id), other);
    assert.ok(!result.problems.some((problem) => problem.includes('Club 1')));
    const none = prepareDraftExclusions(data, cycle, ['c1', 'c2']);
    assert.deepEqual(draft(none.data, none.cycle, true, undefined, mode).assignments, [other]);
  }
});

test('excluded clubs do not contribute to utilisation demand and all-excluded generates no assignments', () => {
  const data = scenario([['t1', 't2'], ['t2']]);
  const cycle = data.cycles[0];
  cycle.slots[1] = { ...cycle.slots[1], month: '2027-04', meeting: '2027-04-05' };
  const all = draft(data, cycle, false, undefined, 'utilisation');
  assert.equal(assignedTitles(data, all.assignments).s1, 't2');
  const input = prepareDraftExclusions(data, cycle, ['c2']);
  for (const mode of ['clubs', 'utilisation'] as const) {
    assert.deepEqual(assignedTitles(data, draft(input.data, input.cycle, false, undefined, mode).assignments), { s1: 't1' });
    const none = prepareDraftExclusions(data, cycle, ['c1', 'c2']);
    const result = draft(none.data, none.cycle, false, undefined, mode);
    assert.deepEqual(result.assignments, []);
    assert.deepEqual(result.problems, []);
  }
  const unchanged = prepareDraftExclusions(data, cycle, []);
  assert.equal(unchanged.data, data);
  assert.equal(unchanged.cycle, cycle);
});

test('repairs a scarce-kit conflict by reassigning an earlier slot', () => {
  const data = scenario([['t1', 't2'], ['t1']]);
  const result = draft(data, data.cycles[0]);
  assert.deepEqual(assignedTitles(data, result.assignments), { s1: 't2', s2: 't1' });
  assert.equal(result.problems.length, 0);
  assert.ok(result.assignments.every((a) => assignmentProblem(data, a, result.assignments) === null));
});

test('repairs a two-step chain and does not mutate inputs', () => {
  const data = scenario([['t1', 't2'], ['t2', 't3'], ['t1']]);
  const before = structuredClone(data);
  const result = draft(data, data.cycles[0]);
  assert.deepEqual(assignedTitles(data, result.assignments), { s1: 't2', s2: 't3', s3: 't1' });
  assert.deepEqual(data, before);
});

test('improves the lowest fairness score without reducing coverage', () => {
  const data = scenario([['t1', 't2', 't3'], ['t1', 't2']]);
  data.kits = data.kits.filter((kit) => kit.titleId !== 't3');
  const cycle = data.cycles[0];
  const result = draft(data, cycle);
  assert.deepEqual(assignedTitles(data, result.assignments), { s1: 't2', s2: 't1' });
  assert.equal(result.assignments.length, 2);
  assert.ok((fairness(data, cycle, 'c1', result.assignments).score ?? 0) > 50);
});

test('generates a representative 39-club, 12-month schedule cooperatively', async () => {
  const data = scenario(Array.from({ length: 39 }, (_, club) =>
    Array.from({ length: 20 }, (_, rank) => `title-${(club * 7 + rank * 3) % 140}`)));
  const titleTemplate = data.titles[0];
  const kitTemplate = data.kits[0];
  data.titles = Array.from({ length: 140 }, (_, i) => ({ ...titleTemplate, id: `title-${i}` }));
  data.kits = data.titles.map((title) => ({ ...kitTemplate, id: `kit-${title.id}`, titleId: title.id }));
  const cycle = data.cycles[0];
  cycle.slots = data.clubs.flatMap((club) => Array.from({ length: 12 }, (_, i) => {
    const month = `2027-${String(i + 1).padStart(2, '0')}`;
    return { id: `${club.id}-${month}`, clubId: club.id, month, meeting: null };
  }));
  for (const mode of ['clubs', 'utilisation'] as const) {
    const started = performance.now();
    const result = draft(data, cycle, false, undefined, mode);
    const elapsed = Math.round(performance.now() - started);
    console.log(`39-club ${mode} generation: ${result.assignments.length}/${cycle.slots.length} assigned in ${elapsed} ms`);
    assert.equal(result.assignments.length, cycle.slots.length);
    assert.ok(result.assignments.every((a) => assignmentProblem(data, a, result.assignments) === null));
    let yielded = false;
    const timer = setTimeout(() => { yielded = true; }, 0);
    const asyncResult = await draftAsync(data, cycle, false, undefined, mode);
    clearTimeout(timer);
    assert.equal(yielded, true);
    assert.deepEqual(assignedTitles(data, asyncResult.assignments), assignedTitles(data, result.assignments));
    assert.deepEqual(asyncResult.problems, result.problems);
  }
});

test('repairs a same-club title conflict across months while respecting another cycle', () => {
  const data = scenario([['t1', 't2']]);
  const cycle = data.cycles[0];
  cycle.slots.push({ id: 'later', clubId: 'c1', month: '2027-04', meeting: '2027-04-05' });
  data.cycles.push({ ...cycle, id: 'other', slots: [{ id: 'other-slot', clubId: 'c1', month: '2027-04', meeting: '2027-04-05' }] });
  const other = { id: 'other-assignment', cycleId: 'other', slotId: 'other-slot', clubId: 'c1', kitId: 'k3',
    ready: '2027-03-15', meeting: '2027-04-05', due: '2027-04-12', locked: false };
  data.assignments = [other];
  const result = draft(data, cycle);
  assert.deepEqual(assignedTitles(data, result.assignments), { s1: 't2', later: 't1' });
  assert.deepEqual(result.assignments.find((item) => item.id === other.id), other);
  assert.ok(result.assignments.filter((a) => a.cycleId === cycle.id).every((a) => assignmentProblem(data, a, result.assignments) === null));
});

test('preserves locked assignments and reports genuinely blocked slots', () => {
  const data = scenario([['t1', 't2'], ['t1']]);
  const locked = { id: 'locked', cycleId: 'cycle1', slotId: 's1', clubId: 'c1', kitId: 'k1',
    ready: '2026-12-14', meeting: '2027-01-04', due: '2027-01-11', locked: true };
  data.assignments = [locked];
  const result = draft(data, data.cycles[0]);
  assert.deepEqual(result.assignments, [locked]);
  assert.ok(result.problems.some((message) => message.includes('Club 2') && message.includes('no feasible')));
});

test('preserves an invalid lock and avoids its kit when continuing', () => {
  const data = scenario([['t1'], ['t1', 't2']]);
  const locked = { id: 'locked', cycleId: 'cycle1', slotId: 's1', clubId: 'c1', kitId: 'k1',
    ready: '2026-12-14', meeting: '2027-01-04', due: 'invalid', locked: true };
  data.assignments = [locked];
  const result = draft(data, data.cycles[0], true);
  assert.deepEqual(result.assignments.find((item) => item.id === locked.id), locked);
  assert.deepEqual(assignedTitles(data, result.assignments), { s1: 't1', s2: 't2' });
  assert.ok(result.problems.some((message) => message.startsWith('Locked assignment s1')));
});

test('scoped generation fills every empty slot of the chosen club and keeps existing assignments', () => {
  const data = scenario([['t1', 't2'], ['t1', 't2']]);
  const cycle = data.cycles[0];
  cycle.slots = [
    { id: 'jan', clubId: 'c1', month: '2027-01', meeting: '2027-01-04' },
    { id: 'feb', clubId: 'c1', month: '2027-02', meeting: '2027-02-01' },
    { id: 'mar', clubId: 'c1', month: '2027-03', meeting: '2027-03-01' },
    { id: 'other', clubId: 'c2', month: '2027-01', meeting: '2027-01-04' },
  ];
  const generated = draft(data, cycle, false, { clubId: 'c1' }).assignments;
  const titled = generated.find((item) => item.slotId === 'feb');
  const existing = { id: 'existing', cycleId: cycle.id, slotId: 'other', clubId: 'c2', kitId: 'k1',
    ready: '2026-12-14', meeting: '2027-01-04', due: '2027-01-11', locked: false };
  data.assignments = [existing, titled!];
  const result = draft(data, cycle, false, { clubId: 'c1' });
  assert.deepEqual(result.assignments.find((item) => item.id === existing.id), existing);
  assert.deepEqual(result.assignments.find((item) => item.id === titled!.id), titled);
  assert.deepEqual(result.assignments.filter((item) => item.cycleId === cycle.id && item.id !== existing.id && item.id !== titled!.id).map((item) => item.slotId).sort(), ['jan', 'mar']);
});

test('scoped generation fills a locally added slot that has no meeting date yet', () => {
  const data = scenario([['t1', 't2'], ['t1', 't2']]);
  const cycle = data.cycles[0];
  cycle.slots = [
    { id: 'local', clubId: 'c1', month: '2027-02', meeting: null },
  ];
  data.assignments = [];
  const result = draft(data, cycle, false, { clubId: 'c1' });
  assert.deepEqual(result.assignments.filter((item) => item.cycleId === cycle.id).map((item) => item.slotId), ['local']);
});

test('scoped generation refills cleared entries with the same titles', () => {
  const data = scenario([['t1', 't2'], ['t1', 't2']]);
  const cycle = data.cycles[0];
  cycle.slots = [
    { id: 'feb', clubId: 'c1', month: '2027-02', meeting: '2027-02-01' },
    { id: 'mar', clubId: 'c1', month: '2027-03', meeting: '2027-03-01' },
  ];
  const scope = { clubId: 'c1' };
  const first = draft(data, cycle, false, scope);
  data.assignments = [];
  const refilled = draft(data, cycle, false, scope);
  assert.equal(refilled.assignments.length, 2);
  assert.deepEqual(assignedTitles(data, refilled.assignments), assignedTitles(data, first.assignments));
});

test('scoped generation falls back to unranked titles the club has not read', () => {
  const data = scenario([['t1']]);
  const cycle = data.cycles[0];
  cycle.finalized = { c1: [] };
  cycle.slots = [{ id: 'feb', clubId: 'c1', month: '2027-02', meeting: '2027-02-01' }];
  const result = draft(data, cycle, false, { clubId: 'c1' });
  assert.equal(result.assignments.filter((item) => item.cycleId === cycle.id).length, 1);
  assert.equal(result.problems.length, 0);
});

test('scoped utilisation orders ranked choices by demand and retains unranked fallback', () => {
  const data = scenario([['t2', 't1'], ['t1']]);
  const cycle = data.cycles[0];
  cycle.slots = [
    { id: 'jan', clubId: 'c1', month: '2027-01', meeting: '2027-01-04' },
    { id: 'apr', clubId: 'c1', month: '2027-04', meeting: '2027-04-05' },
    { id: 'jul', clubId: 'c1', month: '2027-07', meeting: '2027-07-05' },
    { id: 'other', clubId: 'c2', month: '2027-08', meeting: '2027-08-02' },
  ];
  const result = draft(data, cycle, false, { clubId: 'c1' }, 'utilisation');
  assert.deepEqual(assignedTitles(data, result.assignments), { jan: 't1', apr: 't2', jul: 't3' });
});

test('scoped generation reports why a slot cannot be filled', () => {
  const data = scenario([['t1']]);
  const cycle = data.cycles[0];
  data.kits = [];
  cycle.slots = [{ id: 'feb', clubId: 'c1', month: '2027-02', meeting: '2027-02-01' }];
  const result = draft(data, cycle, false, { clubId: 'c1' });
  assert.ok(result.problems.some((message) => message.startsWith('Club 1 in 2027-02: no ranked or available title')));
});


test('treats the exact turnaround-buffer boundary as a cross-cycle conflict', () => {
  const data = scenario([['t1', 't2']]);
  const cycle = data.cycles[0];
  data.cycles.push({ ...cycle, id: 'other', slots: [{ id: 'other-slot', clubId: 'c1', month: '2026-12', meeting: '2026-12-10' }] });
  data.assignments = [{ id: 'other-assignment', cycleId: 'other', slotId: 'other-slot', clubId: 'c1', kitId: 'k1',
    ready: '2026-11-13', meeting: '2026-12-10', due: '2026-12-11', locked: false }];
  const result = draft(data, cycle);
  assert.deepEqual(assignedTitles(data, result.assignments), { s1: 't2' });
});

test('reports bounded repair when a required displacement chain exceeds the limit', () => {
  const data = scenario([['t1', 't2'], ['t2', 't3'], ['t3', 't4'], ['t4', 't5'], ['t1']]);
  data.titles.push({ ...data.titles[0], id: 't5' });
  data.kits = data.titles.map((title) => ({ ...data.kits[0], id: `kit-${title.id}`, titleId: title.id }));
  for (const mode of ['clubs', 'utilisation'] as const) {
    const result = draft(data, data.cycles[0], false, undefined, mode);
    assert.equal(result.assignments.length, 4);
    assert.ok(result.problems.some((message) => message.includes('search was limited')));
    assert.ok(result.assignments.every((a) => assignmentProblem(data, a, result.assignments) === null));
  }
});

test('does not generate dateless meetings on or before the deadline', () => {
  const data = scenario([['t1']]);
  const cycle = data.cycles[0];
  cycle.deadline = '2027-01-04';
  cycle.slots[0].meeting = null;
  const result = draft(data, cycle);
  assert.equal(result.assignments.length, 0);
  assert.match(result.problems[0], /after the preference deadline/);
});

test('does not use an unavailable or previously read title and chooses an alternate kit', () => {
  const data = scenario([['t1', 't2']]);
  data.kits.push({ ...data.kits[0], id: 'alternate' });
  data.kits.find((kit) => kit.id === 'k1')!.status = 'unavailable';
  data.clubs[0].history.push('t2');
  const result = draft(data, data.cycles[0]);
  assert.equal(result.assignments[0].kitId, 'alternate');
  assert.equal(result.problems.length, 0);
});

test('does not use a checked-out kit without an active published loan', () => {
  const data = scenario([['t1', 't2']]);
  data.kits.find((kit) => kit.id === 'k1')!.status = 'out';
  const result = draft(data, data.cycles[0]);
  assert.deepEqual(assignedTitles(data, result.assignments), { s1: 't2' });
});

test('reports absent preferences without inventing unranked assignments', () => {
  const data = scenario([[]]);
  const result = draft(data, data.cycles[0]);
  assert.equal(result.assignments.length, 0);
  assert.ok(result.problems.some((message) => message.includes('no feasible preferred kit')));
});

test('retains and reports an invalid locked assignment even if its slot is missing', () => {
  const data = scenario([['t1']]);
  const locked = { id: 'locked', cycleId: 'cycle1', slotId: 'missing', clubId: 'c1', kitId: 'k1',
    ready: '2026-12-14', meeting: '2027-01-04', due: '2027-01-11', locked: true };
  data.assignments = [locked];
  const result = draft(data, data.cycles[0], true);
  assert.ok(result.problems.some((message) => message.startsWith('Locked assignment missing')));
  assert.deepEqual(result.assignments.find((item) => item.id === locked.id), locked);
});

test('prioritise utilisation lends a popular title to every club that ranks it', () => {
  const data = scenario([['t2', 't1'], ['t1', 't3']]);
  data.kits.push({ ...data.kits[0], id: 'k1b' });
  assert.deepEqual(assignedTitles(data, draft(data, data.cycles[0], false, undefined, 'clubs').assignments), { s1: 't2', s2: 't1' });
  assert.deepEqual(assignedTitles(data, draft(data, data.cycles[0], false, undefined, 'utilisation').assignments), { s1: 't1', s2: 't1' });
});

test('prioritise utilisation uses fairness to break equal kit and popularity scores', () => {
  const data = scenario([['t3', 't2', 't1'], ['t1', 't2']]);
  assert.deepEqual(assignedTitles(data, draft(data, data.cycles[0], false, undefined, 'utilisation').assignments), { s1: 't2', s2: 't1' });
});

test('prioritise utilisation reuses a physical kit rather than using another copy of the same title', () => {
  const data = scenario([['t1'], ['t1']]);
  const cycle = data.cycles[0];
  data.clubs[1].branch = 'West';
  data.kits.push({ ...data.kits[0], id: 'west-copy', branch: 'West' });
  cycle.slots[1] = { ...cycle.slots[1], month: '2027-04', meeting: '2027-04-05' };
  const clubs = draft(data, cycle, false, undefined, 'clubs');
  const utilisation = draft(data, cycle, false, undefined, 'utilisation');
  assert.equal(clubs.assignments.length, 2);
  assert.equal(utilisation.assignments.length, 2);
  assert.equal(new Set(clubs.assignments.map((a) => a.kitId)).size, 2);
  assert.equal(new Set(utilisation.assignments.map((a) => a.kitId)).size, 1);
  assert.ok(utilisation.assignments.every((a) => assignmentProblem(data, a, utilisation.assignments) === null));
});

test('utilisation counts only participating clubs in demand and weights their ranking positions', () => {
  const data = scenario([['t2', 't1'], ['t1', 't2'], ['t2']]);
  const cycle = data.cycles[0];
  cycle.slots = cycle.slots.slice(0, 2);
  cycle.slots[1] = { ...cycle.slots[1], month: '2027-04', meeting: '2027-04-05' };
  const result = draft(data, cycle, false, undefined, 'utilisation');
  assert.deepEqual(assignedTitles(data, result.assignments), { s1: 't2', s2: 't2' });
  cycle.finalized.c2 = ['t1', 't3', 't2'];
  const weighted = draft(data, cycle, false, undefined, 'utilisation');
  assert.deepEqual(assignedTitles(data, weighted.assignments), { s1: 't1', s2: 't1' });
});

test('utilisation improves kit reuse after the initial popular choices without losing coverage', () => {
  const data = scenario([['t1', 't2'], ['t2'], ['t1']]);
  const cycle = data.cycles[0];
  cycle.slots[1] = { ...cycle.slots[1], month: '2027-04', meeting: '2027-04-05' };
  cycle.slots[2] = { ...cycle.slots[2], month: '2027-06', meeting: '2027-06-07' };
  const locked = { id: 'locked', cycleId: cycle.id, slotId: 's3', clubId: 'c3', kitId: 'k4',
    ready: '2027-05-17', meeting: '2027-06-07', due: '2027-06-14', locked: true };
  data.assignments = [locked];
  const result = draft(data, cycle, false, undefined, 'utilisation');
  assert.deepEqual(assignedTitles(data, result.assignments), { s1: 't2', s2: 't2', s3: 't3' });
  assert.equal(new Set(result.assignments.map((a) => a.kitId)).size, 2);
  assert.deepEqual(result.assignments.find((a) => a.id === locked.id), locked);
});

test('utilisation keeps coverage and locked kits while respecting other cycles', () => {
  const data = scenario([['t1', 't2'], ['t1'], ['t1']]);
  const cycle = data.cycles[0];
  cycle.slots[2] = { ...cycle.slots[2], month: '2027-04', meeting: '2027-04-05' };
  const locked = { id: 'locked', cycleId: cycle.id, slotId: 's3', clubId: 'c3', kitId: 'k1',
    ready: '2027-03-15', meeting: '2027-04-05', due: '2027-04-12', locked: true };
  const otherCycle = { ...cycle, id: 'other', slots: [{ id: 'other-slot', clubId: 'c3', month: '2027-06', meeting: '2027-06-07' }] };
  const other = { ...locked, id: 'other-assignment', cycleId: 'other', slotId: 'other-slot', kitId: 'k3',
    ready: '2027-05-17', meeting: '2027-06-07', due: '2027-06-14', locked: false };
  data.cycles.push(otherCycle);
  data.assignments = [locked, other];
  const result = draft(data, cycle, false, undefined, 'utilisation');
  assert.deepEqual(assignedTitles(data, result.assignments), { s1: 't2', s2: 't1', s3: 't1' });
  assert.deepEqual(result.assignments.find((a) => a.id === locked.id), locked);
  assert.deepEqual(result.assignments.find((a) => a.id === other.id), other);
  assert.ok(result.assignments.every((a) => assignmentProblem(data, a, result.assignments) === null));
});

test('utilisation async and repeated runs select the same assignments', async () => {
  const data = scenario([['t2', 't1'], ['t1', 't3']]);
  data.kits.push({ ...data.kits[0], id: 'k1b' });
  const cycle = data.cycles[0];
  const sync = draft(data, cycle, false, undefined, 'utilisation');
  const repeat = draft(data, cycle, false, undefined, 'utilisation');
  const asyncResult = await draftAsync(data, cycle, false, undefined, 'utilisation');
  const selections = (assignments: typeof sync.assignments) =>
    assignments.map(({ slotId, kitId }) => ({ slotId, kitId }));
  assert.deepEqual(selections(repeat.assignments), selections(sync.assignments));
  assert.deepEqual(selections(asyncResult.assignments), selections(sync.assignments));
  assert.deepEqual(asyncResult.problems, sync.problems);
});

test('defaults to prioritising clubs when no mode is given', () => {
  const data = scenario([['t2', 't1'], ['t1', 't3']]);
  const byDefault = draft(data, data.cycles[0]);
  const byClubs = draft(data, data.cycles[0], false, undefined, 'clubs');
  assert.deepEqual(assignedTitles(data, byDefault.assignments), assignedTitles(data, byClubs.assignments));
  assert.deepEqual(byDefault.problems, byClubs.problems);
});

test('produces the same choices on repeat runs', () => {
  const data = scenario([['t1', 't2'], ['t2', 't3'], ['t1']]);
  const first = draft(data, data.cycles[0]);
  const second = draft(data, data.cycles[0]);
  assert.deepEqual(assignedTitles(data, first.assignments), assignedTitles(data, second.assignments));
  assert.deepEqual(first.problems, second.problems);
});
