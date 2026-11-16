/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { addDays, today } from '../src/domain/dates';
import { assignmentProblem, circulate, draft, rankings, satisfactionDebt } from '../src/domain/logic';
import { filterOptions, type PickerOption } from '../src/domain/search';
import { seed } from '../src/domain/seed';
import { emptyBallot, moveInRanking, setMark } from '../src/domain/ballot-draft';
import { BallotSync, type SyncStatus } from '../src/state/ballot-sync';
import type { Ballot } from '../src/domain/model';

test('ballot marks append to the ranking and moves reorder it', () => {
  let ballot = emptyBallot('cycle', 'club', 'person');
  for (const titleId of ['a', 'b', 'c']) ballot = setMark(ballot, titleId, 'selected');
  ballot = moveInRanking(ballot, 2, 0);
  assert.deepEqual(ballot.ranking, ['c', 'a', 'b']);
  assert.equal(setMark(ballot, 'a', 'wont').ranking.includes('a'), false);
  assert.equal(setMark(ballot, 'a', null).marks.a, undefined);
});

test('background ballot sync sends the latest draft with the latest server revision', async () => {
  const sent: Ballot[] = [];
  const statuses: SyncStatus[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const sync = new BallotSync((status) => statuses.push(status));
  sync.configure(async (ballot) => {
    sent.push(ballot);
    if (sent.length === 1) await gate;
    return { ...ballot, revision: ballot.revision + 1 };
  }, () => undefined);
  const base = emptyBallot('cycle', 'club', 'person');
  sync.enqueue({ ...base, ranking: ['a'] });
  sync.enqueue({ ...base, ranking: ['a', 'b'] });
  release();
  await sync.flush();
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[1].ranking, ['a', 'b']);
  assert.equal(sent[1].revision, 1);
  assert.equal(statuses.at(-1)?.state, 'saved');
});

test('a failed ballot sync keeps the draft so a later flush retries it', async () => {
  let attempts = 0;
  const sync = new BallotSync(() => undefined);
  sync.configure(async (ballot) => {
    attempts += 1;
    if (attempts === 1) throw new Error('Conflict');
    return { ...ballot, revision: ballot.revision + 1 };
  }, () => undefined);
  sync.enqueue(emptyBallot('cycle', 'club', 'person'));
  await assert.rejects(sync.flush(), /Conflict/);
  await sync.flush();
  assert.equal(attempts, 2);
});

test('aggregates ballots and excludes club history', () => {
  const data = seed();
  data.clubs[0].history.push('t1');
  assert.deepEqual(rankings(data, data.cycles[0], 'c1'), ['t2', 't3']);
});

test('draft handles duplicate physical kits and preserves locks on rerun', () => {
  const data = seed();
  const cycle = data.cycles[0];
  const result = draft(data, cycle);
  assert.equal(result.problems.length, 0);
  const simultaneous = result.assignments.filter((a) => a.meeting === cycle.slots[0].meeting);
  assert.equal(new Set(simultaneous.map((a) => a.kitId)).size, 2);
  const locked = { ...result.assignments[0], locked: true };
  data.assignments = result.assignments.map((a) => a.id === locked.id ? locked : a);
  const next = draft(data, cycle);
  assert.deepEqual(next.assignments.find((a) => a.id === locked.id), locked);
  assert.equal(next.problems.length, 0);
});

test('buffer boundary and invalid locks are reported', () => {
  const data = seed();
  const cycle = data.cycles[0];
  const result = draft(data, cycle);
  const assignment = result.assignments[0];
  const ready = addDays(assignment.due, data.library.bufferDays);
  const meeting = addDays(ready, 1);
  cycle.slots.push({ id: 'other-slot', clubId: 'c2', meeting });
  const conflicting = { ...assignment, id: 'other', slotId: 'other-slot', clubId: 'c2', ready, meeting, due: addDays(ready, 5), locked: true };
  assert.match(assignmentProblem(data, conflicting, [assignment]) ?? '', /buffer/);
  data.assignments = [{ ...assignment, locked: true }, conflicting];
  assert.ok(draft(data, cycle).problems.some((p) => p.startsWith('Locked assignment')));
});

test('circulation enforces transitions and inspection makes damaged kit unavailable', () => {
  let data = seed();
  assert.throws(() => circulate(data, 'k1', 'returned', '', true));
  data = circulate(data, 'k1', 'picked up', '', true);
  data = circulate(data, 'k1', 'returned', '9 of 10 copies', true);
  data = circulate(data, 'k1', 'inspected', 'One copy missing', false);
  assert.equal(data.kits.find((k) => k.id === 'k1')?.status, 'unavailable');
  assert.deepEqual(data.events.slice(-3).map((e) => e.action), ['picked up', 'returned', 'inspected']);
});

test('picker search matches every term and respects the group filter', () => {
  const options: PickerOption[] = [
    { id: 'a', label: 'Patrick (library admin)', detail: 'admin', group: 'admin' },
    { id: 'b', label: 'Casey (leader)', detail: 'member', group: 'member' },
    { id: 'c', label: 'Andrew (staff)', detail: 'staff', group: 'staff' },
  ];
  assert.deepEqual(filterOptions(options, 'CASEY  member', 'all').map((o) => o.id), ['b']);
  assert.deepEqual(filterOptions(options, 'casey', 'admin').map((o) => o.id), []);
  assert.deepEqual(filterOptions(options, '', 'staff').map((o) => o.id), ['c']);
  assert.deepEqual(filterOptions(options, 'zzz', 'all'), []);
});

test('date calculation crosses month boundaries', () => {
  assert.equal(addDays('2026-01-30', 3), '2026-02-02');
  assert.match(today(), /^\d{4}-\d{2}-\d{2}$/);
});

test('reports unfilled slots when preferences have no feasible kits', () => {
  const data = seed();
  data.kits = data.kits.map((kit) => ({ ...kit, status: 'unavailable' }));
  const result = draft(data, data.cycles[0]);
  assert.equal(result.assignments.length, 0);
  assert.equal(result.problems.length, data.cycles[0].slots.length);
});

test('history and duplicate meeting assignments are rejected', () => {
  const data = seed();
  const cycle = data.cycles[0];
  const assignment = draft(data, cycle).assignments[0];
  const assignedTitle = data.kits.find((kit) => kit.id === assignment.kitId)!.titleId;
  data.clubs.find((club) => club.id === assignment.clubId)!.history.push(assignedTitle);
  assert.match(assignmentProblem(data, assignment, []) ?? '', /already read/);
  data.clubs.find((club) => club.id === assignment.clubId)!.history = [];
  assert.match(assignmentProblem(data, { ...assignment, id: 'duplicate' }, [assignment]) ?? '', /already has an assignment/);
});

test('fairness debt only considers published cycles and keeps historic ranks', () => {
  const data = seed();
  const cycle = data.cycles[0];
  data.assignments = draft(data, cycle).assignments;
  assert.equal(satisfactionDebt(data, 'c1'), 0);
  cycle.status = 'published';
  cycle.finalized.c1 = ['t3', 't2', 't1'];
  data.clubs[0].history.push('t1');
  assert.ok(satisfactionDebt(data, 'c1') > 0);
});

test('inspection records missing copies and blocks damaged kit from replacements', () => {
  let data = seed();
  data.kits[0].components = ['copy-1', 'copy-2'];
  data = circulate(data, 'k1', 'picked up', '', true);
  data = circulate(data, 'k1', 'returned', '', true);
  assert.throws(() => circulate(data, 'k1', 'inspected', '', true, { returnedCopies: 11, missingComponents: [] }));
  data = circulate(data, 'k1', 'inspected', 'Missing copy', true, { returnedCopies: 9, missingComponents: ['copy-1'] });
  assert.equal(data.kits[0].status, 'unavailable');
  assert.equal(data.events.at(-1)?.returnedCopies, 9);
  const result = draft(data, data.cycles[0]);
  assert.ok(result.assignments.every((a) => a.kitId !== 'k1'));
});
