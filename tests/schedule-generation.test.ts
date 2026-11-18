/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { assignmentProblem, draft, draftAsync, fairness } from '../src/domain/logic';
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
  const started = performance.now();
  const result = draft(data, cycle);
  const elapsed = Math.round(performance.now() - started);
  console.log(`39-club generation: ${result.assignments.length}/${cycle.slots.length} assigned in ${elapsed} ms`);
  assert.equal(result.assignments.length, cycle.slots.length);
  assert.ok(result.assignments.every((a) => assignmentProblem(data, a, result.assignments) === null));
  let yielded = false;
  const timer = setTimeout(() => { yielded = true; }, 0);
  const asyncResult = await draftAsync(data, cycle);
  clearTimeout(timer);
  assert.equal(yielded, true);
  assert.deepEqual(assignedTitles(data, asyncResult.assignments), assignedTitles(data, result.assignments));
  assert.deepEqual(asyncResult.problems, result.problems);
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
  const result = draft(data, data.cycles[0]);
  assert.equal(result.assignments.length, 4);
  assert.ok(result.problems.some((message) => message.includes('search was limited')));
  assert.ok(result.assignments.every((a) => assignmentProblem(data, a, result.assignments) === null));
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

test('prioritise utilisation weights demand by ranking position', () => {
  // t1 is first for club 2 and last for club 1. t2 is second for both. Weighted demand favours t1, while raw counts tie.
  const data = scenario([['t3', 't2', 't1'], ['t1', 't2']]);
  assert.deepEqual(assignedTitles(data, draft(data, data.cycles[0], false, undefined, 'utilisation').assignments), { s1: 't1', s2: 't2' });
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
