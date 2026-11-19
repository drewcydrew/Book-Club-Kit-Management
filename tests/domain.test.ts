/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { addDays, today } from '../src/domain/dates';
import { assignmentProblem, assignmentProblems, circulate, draft, fairness, firstMonday, meetingFor, rankings, satisfactionDebt } from '../src/domain/logic';
import { filterOptions, type PickerOption } from '../src/domain/search';
import { seed } from '../src/domain/seed';
import { ballotKey, emptyBallot, moveInRanking, setMark, undoDismissal } from '../src/domain/ballot-draft';
import { ApiError } from '../src/state/api';
import { reconcileBallot, saveStagedBallots, stageBallot, type StagedBallots } from '../src/state/staged-ballots';
import { memberCycleStatus, preferenceStatus, votingStatus } from '../src/domain/voting';
import { BallotSync, type SyncStatus } from '../src/state/ballot-sync';
import type { Assignment, Ballot, Cycle, Data } from '../src/domain/model';
import { clubPriorities, clubStatuses, groupSlotsByMonth, memberMeetingCalendar, memberScheduleMeetings, memberVotes, monthsInRange, priorityCellsForTitle, priorityMatrix, priorityRowsForClub, scheduleByKit, scheduleGrid, scheduleHasChanges, sortPriorityMatrix, titleDemand } from '../src/domain/cycle-overview';

test('voting status explains whether member voting is open and why it is not', () => {
  const collecting = { status: 'collecting' as const, deadline: '2026-11-20' };
  assert.deepEqual(votingStatus({ status: 'open', deadline: '2026-11-20' }, '2026-11-18').open, false);
  assert.equal(votingStatus({ status: 'open', deadline: '2026-11-20' }, '2026-11-18').label, 'Voting has not opened yet');
  assert.equal(votingStatus(collecting, '2026-11-18').detail, 'Closes 2026-11-20 · 2 days left');
  assert.equal(votingStatus(collecting, '2026-11-20').detail, 'Closes 2026-11-20 · closes today');
  assert.equal(votingStatus(collecting, '2026-11-21').open, false);
  assert.equal(votingStatus(collecting, '2026-11-21').detail, 'The deadline was 2026-11-20.');
  assert.equal(votingStatus({ status: 'drafted', deadline: '2026-11-20' }, '2026-11-18').open, false);
});

test('preferences stay editable after a schedule is drafted or published', () => {
  const late = '2026-12-01';
  assert.equal(preferenceStatus({ status: 'collecting', deadline: '2026-11-20' }, late).editable, false);
  assert.equal(preferenceStatus({ status: 'collecting', deadline: '2026-11-20' }, '2026-11-18').editable, true);
  assert.equal(preferenceStatus({ status: 'drafted', deadline: '2026-11-20' }, late).editable, true);
  assert.equal(preferenceStatus({ status: 'published', deadline: '2026-11-20' }, late).label, 'Schedule published');
  assert.equal(preferenceStatus({ status: 'published', deadline: '2026-11-20' }, late).open, true);
});

test('member cycle status distinguishes cycle phase and editable choices', () => {
  const day = '2026-11-20';
  assert.equal(memberCycleStatus({ status: 'open', deadline: day }, day).editable, false);
  assert.equal(memberCycleStatus({ status: 'collecting', deadline: day }, day).label, 'Collecting votes');
  const late = memberCycleStatus({ status: 'collecting', deadline: day }, '2026-11-21');
  assert.equal(late.editable, false);
  assert.match(late.label, /deadline passed/);
  for (const status of ['drafted', 'published'] as const) {
    const result = memberCycleStatus({ status, deadline: day }, '2026-12-01');
    assert.equal(result.editable, true);
    assert.match(result.label, new RegExp(status));
    assert.match(result.detail, /assignments will not change/);
  }
});

test('meetings group by month in date order and filter by club', () => {
  const slots = [
    { id: '3', clubId: 'b', month: '2026-03', meeting: '2026-03-20' },
    { id: '1', clubId: 'a', month: '2026-02', meeting: '2026-02-10' },
    { id: '2', clubId: 'b', month: '2026-02', meeting: '2026-02-03' },
  ];
  assert.deepEqual(groupSlotsByMonth(slots).map((group) => [group.month, group.slots.map((slot) => slot.id)]), [
    ['2026-02', ['2', '1']],
    ['2026-03', ['3']],
  ]);
  assert.deepEqual(groupSlotsByMonth(slots, 'a').map((group) => group.slots.map((slot) => slot.id)), [['1']]);
});

test('member votes count only members of the club and report current preferences', () => {
  const memberships = [
    { personId: 'p1', clubId: 'c', leader: true },
    { personId: 'p2', clubId: 'c', leader: false },
    { personId: 'p3', clubId: 'other', leader: false },
  ];
  const ballots: Ballot[] = [
    { cycleId: 'cy', clubId: 'c', personId: 'p1', marks: { t1: 'selected', t2: 'wont' }, ranking: ['t1'], revision: 1 },
  ];
  assert.deepEqual(memberVotes(memberships, ballots, 'cy', 'c'), [
    { personId: 'p1', voted: true, ranking: ['t1'], selected: ['t1'], marks: { selected: 1, read: 0, wont: 1 } },
    { personId: 'p2', voted: false, ranking: [], selected: [], marks: { selected: 0, read: 0, wont: 0 } },
  ]);
});

test('club priorities score selected titles by ranking position and flag previously read titles', () => {
  const data = {
    clubs: [{ id: 'c', history: ['old'] }],
    titles: [{ id: 't1' }, { id: 't2' }, { id: 'old' }],
    ballots: [
      { cycleId: 'cy', clubId: 'c', personId: 'p1', marks: { t1: 'selected', t2: 'selected', old: 'selected' }, ranking: ['t1', 't2', 'old'], revision: 1 },
      { cycleId: 'cy', clubId: 'c', personId: 'p2', marks: { t2: 'selected', t1: 'read' }, ranking: ['t2', 't1'], revision: 1 },
    ],
  } as unknown as Data;
  const cycle = { id: 'cy', name: '', deadline: '', startsOn: '2026-01-01', endsOn: '2026-12-31', status: 'collecting', slots: [], finalized: {}, revision: 1 } as Cycle;
  assert.deepEqual(clubPriorities(data, cycle, 'c'), [
    { titleId: 't1', score: 3, supporters: 1, history: false },
    { titleId: 't2', score: 3, supporters: 2, history: false },
    { titleId: 'old', score: 1, supporters: 1, history: true },
  ]);
});

test('ballot marks append to the ranking and moves reorder it', () => {
  let ballot = emptyBallot('cycle', 'club', 'person');
  for (const titleId of ['a', 'b', 'c']) ballot = setMark(ballot, titleId, 'selected');
  ballot = moveInRanking(ballot, 2, 0);
  assert.deepEqual(ballot.ranking, ['c', 'a', 'b']);
  assert.equal(setMark(ballot, 'a', 'wont').ranking.includes('a'), false);
});

test('staging isolates ballots and retains their original revisions until explicitly saved', async () => {
  const first = { ...emptyBallot('cycle1', 'club1', 'person'), revision: 3 };
  const second = { ...emptyBallot('cycle2', 'club2', 'person'), revision: 4 };
  let drafts = stageBallot({}, setMark(first, 'a', 'selected'), first);
  drafts = stageBallot(drafts, setMark(second, 'b', 'selected'), second);
  drafts = stageBallot(drafts, setMark(drafts[ballotKey(first)].ballot, 'c', 'selected'), { ...first, revision: 8 });
  assert.equal(drafts[ballotKey(first)].ballot.revision, 3);
  const writes: Ballot[] = [];
  const result = await saveStagedBallots([ballotKey(first)], () => drafts, (next) => { drafts = next; },
    async (ballot) => { writes.push(ballot); }, async () => ({ ballots: [{ ...writes[0], revision: 4 }] }));
  assert.equal(result.savedCount, 1);
  assert.equal(writes.length, 1);
  assert.deepEqual(Object.keys(drafts), [ballotKey(second)]);
  assert.equal(writes[0].revision, 3);
});

test('saving all stops on conflict and preserves failed and unattempted drafts', async () => {
  const ballots = ['a', 'b', 'c'].map((club) => setMark(emptyBallot('cycle', club, 'person'), club, 'selected'));
  let drafts: StagedBallots = {};
  for (const ballot of ballots) drafts = stageBallot(drafts, ballot, emptyBallot('cycle', ballot.clubId, 'person'));
  const writes: string[] = [];
  const result = await saveStagedBallots(ballots.map(ballotKey), () => drafts, (next) => { drafts = next; },
    async (ballot) => {
      writes.push(ballot.clubId);
      if (ballot.clubId === 'b') throw new ApiError('Revision conflict', 409);
    }, async () => ({ ballots: [{ ...ballots[0], revision: 1 }] }));
  assert.equal(result.savedCount, 1);
  assert.deepEqual(writes, ['a', 'b']);
  assert.match(drafts[ballotKey(ballots[1])].issue ?? '', /Save rejected/);
  assert.ok(drafts[ballotKey(ballots[2])]);
  const retry = await saveStagedBallots([ballotKey(ballots[1])], () => drafts, (next) => { drafts = next; },
    async () => { throw new Error('must not retry before reconciliation'); }, async () => ({ ballots: [] }));
  assert.equal(retry.savedCount, 0);
  assert.ok(retry.problem);
});

test('failed refresh retains a saved draft and reconciliation distinguishes save, retry and conflict', async () => {
  const baseline = { ...emptyBallot('cycle', 'club', 'person'), revision: 2 };
  const ballot = setMark(baseline, 'a', 'selected');
  let drafts = stageBallot({}, ballot, baseline);
  const result = await saveStagedBallots([ballotKey(ballot)], () => drafts, (next) => { drafts = next; },
    async () => undefined, async () => { throw new Error('offline'); });
  assert.equal(result.savedCount, 1);
  const entry = drafts[ballotKey(ballot)];
  assert.match(entry.issue ?? '', /save succeeded, but refresh failed/);
  assert.equal(reconcileBallot(entry, { ...ballot, revision: 3 }), 'saved');
  assert.equal(reconcileBallot(entry, baseline), 'retry');
  assert.equal(reconcileBallot(entry, { ...baseline, revision: 3 }), 'conflict');
});

test('undo dismissal restores the original rank without replacing later choices', () => {
  let ballot = emptyBallot('cycle', 'club', 'person');
  for (const id of ['a', 'b', 'c']) ballot = setMark(ballot, id, 'selected');
  ballot = setMark(ballot, 'b', 'wont');
  ballot = setMark(ballot, 'd', 'selected');
  const restored = undoDismissal(ballot, 'b', 'wont', 'selected', 1);
  assert.deepEqual(restored.ranking, ['a', 'b', 'c', 'd']);
  assert.strictEqual(undoDismissal(restored, 'b', 'wont', 'selected', 1), restored);
  assert.equal(undoDismissal(setMark(ballot, 'a', 'wont'), 'a', 'wont', null, -1).marks.a, undefined);
  assert.equal(undoDismissal(ballot, 'b', 'wont', 'read', -1).marks.b, 'read');
  const shortened = setMark(setMark(ballot, 'a', null), 'c', null);
  assert.deepEqual(undoDismissal(shortened, 'b', 'wont', 'selected', 2).ranking, ['d', 'b']);
  const read = setMark(ballot, 'b', 'read');
  assert.deepEqual(undoDismissal(read, 'b', 'read', 'selected', 1).ranking, ['a', 'b', 'c', 'd']);
  assert.strictEqual(undoDismissal(read, 'b', 'wont', 'selected', 1), read);
});

test('marking a selected title as read removes it and undo preserves subsequent edits', () => {
  let ballot = emptyBallot('cycle', 'club', 'person');
  for (const id of ['a', 'b', 'c']) ballot = setMark(ballot, id, 'selected');
  ballot = setMark(ballot, 'b', 'read');
  assert.deepEqual(ballot.ranking, ['a', 'c']);
  ballot = setMark(ballot, 'd', 'selected');
  const restored = undoDismissal(ballot, 'b', 'read', 'selected', 1);
  assert.deepEqual(restored.ranking, ['a', 'b', 'c', 'd']);
  assert.equal(restored.marks.b, 'selected');
  const changed = setMark(ballot, 'b', 'wont');
  assert.strictEqual(undoDismissal(changed, 'b', 'read', 'selected', 1), changed);
});

test('club statuses report preferences and meeting counts for every club', () => {
  const data = {
    clubs: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }],
    ballots: [
      { cycleId: 'cy', clubId: 'c1', personId: 'p1', marks: { t1: 'read' }, ranking: ['t1'], revision: 1 },
      { cycleId: 'cy', clubId: 'c2', personId: 'p2', marks: { t2: 'selected' }, ranking: ['t2'], revision: 1 },
    ],
  } as unknown as Data;
  const slots = [{ id: 's1', clubId: 'c2', month: '2026-01', meeting: null }, { id: 's2', clubId: 'c2', month: '2026-02', meeting: null }];
  const cycle = { id: 'cy', name: '', deadline: '', startsOn: '2026-01-01', endsOn: '2026-12-31', status: 'collecting', slots, finalized: {}, revision: 1 } as unknown as Cycle;
  assert.deepEqual(clubStatuses(data, cycle), [
    { clubId: 'c1', hasPreferences: false, meetingCount: 0 },
    { clubId: 'c2', hasPreferences: true, meetingCount: 2 },
    { clubId: 'c3', hasPreferences: false, meetingCount: 0 },
  ]);
});

test('schedule grid covers every cycle month per club and flags clashes on assigned cells', () => {
  const data = {
    library: { bufferDays: 0 },
    clubs: [{ id: 'c1', history: ['t1'] }],
    kits: [{ id: 'k1', titleId: 't1', status: 'available' }],
    cycles: [],
    assignments: [{ id: 'a1', cycleId: 'cy', slotId: 's1', clubId: 'c1', kitId: 'k1', ready: '2026-01-05', meeting: '2026-01-10', due: '2026-01-20', locked: false }],
  } as unknown as Data;
  const slots = [{ id: 's1', clubId: 'c1', month: '2026-01', meeting: null }, { id: 's2', clubId: 'c1', month: '2026-03', meeting: null }];
  const cycle = { id: 'cy', name: '', deadline: '', startsOn: '2026-01-01', endsOn: '2026-03-31', status: 'drafted', slots, finalized: {}, revision: 1 } as unknown as Cycle;
  data.cycles = [cycle];
  const grid = scheduleGrid(data, cycle, ['c1'], data.assignments);
  assert.deepEqual(grid.months, ['2026-01', '2026-02', '2026-03']);
  const [row] = grid.rows;
  assert.equal(row.clubId, 'c1');
  assert.equal(row.cells[0].assignment?.id, 'a1');
  assert.equal(row.cells[0].problem, 'The club has already read this title.');
  assert.equal(row.cells[1].slot, undefined);
  assert.equal(row.cells[1].assignment, undefined);
  assert.equal(row.cells[2].slot?.id, 's2');
  assert.equal(row.cells[2].assignment, undefined);
  assert.equal(row.cells[2].problem, null);
});

test('priority matrix ranks selected titles per club, flags contested titles and shows assigned months', () => {
  const data = {
    clubs: [{ id: 'c1', history: [] }, { id: 'c2', history: [] }],
    titles: [{ id: 't1' }, { id: 't2' }, { id: 't3' }],
    kits: [{ id: 'k1', titleId: 't1' }, { id: 'k2', titleId: 't2' }],
    ballots: [
      { cycleId: 'cy', clubId: 'c1', personId: 'p1', marks: { t1: 'selected', t2: 'selected', t3: 'wont' }, ranking: ['t2', 't1'], revision: 1 },
      { cycleId: 'cy', clubId: 'c2', personId: 'p2', marks: { t1: 'selected' }, ranking: ['t1'], revision: 1 },
    ],
  } as unknown as Data;
  const slots = [{ id: 's1', clubId: 'c1', month: '2026-02', meeting: null }];
  const cycle = { id: 'cy', name: '', deadline: '', startsOn: '2026-01-01', endsOn: '2026-12-31', status: 'collecting', slots, finalized: {}, revision: 1 } as unknown as Cycle;
  const assignment = { id: 'a1', cycleId: 'cy', slotId: 's1', clubId: 'c1', kitId: 'k2', ready: '', meeting: '', due: '', locked: false } as Assignment;
  const matrix = priorityMatrix(data, cycle, ['c1', 'c2'], [assignment]);
  assert.deepEqual(matrix.rows.map((row) => row.titleId), ['t1', 't2']);
  const [t1, t2] = matrix.rows;
  assert.equal(t1.contested, true);
  assert.equal(t1.rankedClubCount, 2);
  assert.deepEqual(t1.cells.map((cell) => cell.rank), [2, 1]);
  assert.equal(t2.contested, false);
  assert.equal(t2.rankedClubCount, 1);
  assert.deepEqual(t2.cells.map((cell) => [cell.rank, cell.month]), [[1, '2026-02'], [null, null]]);
  assert.equal(t2.cells[0].assignment?.id, 'a1');
  assert.equal(t1.cells[0].assignment, undefined);
  const filtered = priorityMatrix(data, cycle, ['c1'], [assignment]);
  assert.equal(filtered.rows.find((row) => row.titleId === 't1')?.rankedClubCount, 1);
  assert.equal(filtered.rows.find((row) => row.titleId === 't1')?.contested, false);
  assert.deepEqual(priorityMatrix(data, cycle, [], [assignment]).rows, []);
});

test('priority matrix keeps the first matching assignment and ignores missing kits', () => {
  const data = {
    clubs: [{ id: 'c1', history: [] }], titles: [{ id: 't1' }],
    kits: [{ id: 'k1', titleId: 't1' }, { id: 'k2', titleId: 't1' }], ballots: [],
  } as unknown as Data;
  const cycle = { id: 'cy', finalized: { c1: ['t1'] }, slots: [
    { id: 's1', clubId: 'c1', month: '2027-01' },
    { id: 's2', clubId: 'c1', month: '2027-02' },
  ] } as unknown as Cycle;
  const first = { id: 'a1', cycleId: 'cy', clubId: 'c1', slotId: 's1', kitId: 'k1' } as Assignment;
  const second = { ...first, id: 'a2', slotId: 's2', kitId: 'k2' };
  const missing = { ...first, id: 'a3', kitId: 'missing' };
  const result = priorityMatrix(data, cycle, ['c1'], [missing, first, second]);
  assert.equal(result.rows[0].cells[0].assignment, first);
  assert.equal(result.rows[0].cells[0].month, '2027-01');
  assert.equal(result.rows.length, 1);
});

test('priority matrix retains all ranks in a large selected-club grid', () => {
  const clubs = Array.from({ length: 30 }, (_, index) => ({ id: `c${index}`, history: [] }));
  const titles = Array.from({ length: 100 }, (_, index) => ({ id: `t${index}` }));
  const data = { clubs, titles, kits: [], ballots: [] } as unknown as Data;
  const cycle = { id: 'cy', slots: [], finalized: Object.fromEntries(clubs.map((club) =>
    [club.id, titles.map((title) => title.id)])) } as unknown as Cycle;
  const ids = clubs.map((club) => club.id);
  const matrix = priorityMatrix(data, cycle, ids, []);
  assert.equal(matrix.rows.length, 100);
  assert.ok(matrix.rows.every((row) => row.cells.length === 30 && row.rankedClubCount === 30));
  assert.equal(matrix.rows.find((row) => row.titleId === 't99')?.cells[29].rank, 100);
  const selected = priorityMatrix(data, cycle, ids.slice(0, 2), []);
  assert.equal(selected.rows[0].rankedClubCount, 2);
  assert.deepEqual(selected.clubIds, ['c0', 'c1']);
});

test('native preference list orders titles for one club and compares all shown clubs', () => {
  const matrix = {
    clubIds: ['c1', 'c2', 'c3'],
    rows: [
      { titleId: 'a', rankedClubCount: 2, contested: true, cells: [
        { clubId: 'c1', rank: 2, month: null }, { clubId: 'c2', rank: 1, month: '2027-01' }, { clubId: 'c3', rank: null, month: null },
      ] },
      { titleId: 'b', rankedClubCount: 1, contested: false, cells: [
        { clubId: 'c1', rank: 1, month: null }, { clubId: 'c2', rank: null, month: null }, { clubId: 'c3', rank: null, month: null },
      ] },
      { titleId: 'c', rankedClubCount: 0, contested: false, cells: [
        { clubId: 'c1', rank: null, month: null }, { clubId: 'c2', rank: null, month: null }, { clubId: 'c3', rank: null, month: null },
      ] },
    ],
  };
  assert.deepEqual(priorityRowsForClub(matrix, 'c1', [], 'ascending').map((row) => row.titleId), ['b', 'a', 'c']);
  assert.deepEqual(priorityRowsForClub(matrix, 'c1', [], 'descending').map((row) => row.titleId), ['a', 'b', 'c']);
  assert.deepEqual(priorityRowsForClub(matrix, 'c2', ['a'], 'ascending').map((row) => row.titleId), ['b', 'c']);
  assert.deepEqual(priorityRowsForClub(matrix, 'hidden', [], 'ascending'), []);
  assert.deepEqual(priorityCellsForTitle(matrix, matrix.rows[0], 'ascending').map((cell) => cell.clubId), ['c2', 'c1', 'c3']);
  assert.deepEqual(priorityCellsForTitle(matrix, matrix.rows[0], 'descending').map((cell) => cell.clubId), ['c1', 'c2', 'c3']);
  assert.equal(priorityCellsForTitle(matrix, matrix.rows[0], 'ascending')[0].month, '2027-01');
});

test('priority comparison sorts each axis by rank without losing cells or changing the default order', () => {
  const assignment = { id: 'a', cycleId: 'cy', slotId: 's', clubId: 'c1', kitId: 'k' } as Assignment;
  const matrix = {
    clubIds: ['c1', 'c2', 'c3'],
    rows: [
      { titleId: 'a', rankedClubCount: 2, contested: true, cells: [
        { clubId: 'c1', rank: 2, month: '2027-01', assignment },
        { clubId: 'c2', rank: 1, month: null },
        { clubId: 'c3', rank: null, month: null },
      ] },
      { titleId: 'b', rankedClubCount: 1, contested: false, cells: [
        { clubId: 'c1', rank: 1, month: null },
        { clubId: 'c2', rank: null, month: null },
        { clubId: 'c3', rank: null, month: null },
      ] },
      { titleId: 'c', rankedClubCount: 0, contested: false, cells: [
        { clubId: 'c1', rank: null, month: null },
        { clubId: 'c2', rank: null, month: null },
        { clubId: 'c3', rank: null, month: null },
      ] },
    ],
  };
  const sorted = sortPriorityMatrix(matrix, { id: 'c1', direction: 'ascending' }, { id: 'a', direction: 'ascending' });
  assert.deepEqual(sorted.rows.map((row) => row.titleId), ['b', 'a', 'c']);
  assert.deepEqual(sorted.clubIds, ['c2', 'c1', 'c3']);
  assert.deepEqual(sorted.rows.map((row) => row.cells.map((cell) => cell.clubId)), [
    ['c2', 'c1', 'c3'], ['c2', 'c1', 'c3'], ['c2', 'c1', 'c3'],
  ]);
  assert.equal(sorted.rows[1].cells[1].assignment, assignment);
  assert.equal(sorted.rows[1].contested, true);
  assert.deepEqual(sortPriorityMatrix(matrix, null, null), matrix);
  assert.deepEqual(sortPriorityMatrix(matrix, { id: 'missing', direction: 'ascending' }, { id: 'missing', direction: 'descending' }), matrix);
  const reversed = sortPriorityMatrix(matrix, { id: 'c1', direction: 'descending' }, { id: 'a', direction: 'descending' });
  assert.deepEqual(reversed.rows.map((row) => row.titleId), ['a', 'b', 'c']);
  assert.deepEqual(reversed.clubIds, ['c1', 'c2', 'c3']);
  assert.deepEqual(reversed.rows.map((row) => row.cells.map((cell) => cell.clubId)), [
    ['c1', 'c2', 'c3'], ['c1', 'c2', 'c3'], ['c1', 'c2', 'c3'],
  ]);
  const titleOnly = sortPriorityMatrix(matrix, null, { id: 'a', direction: 'descending' });
  assert.deepEqual(titleOnly.rows.map((row) => row.titleId), ['a', 'b', 'c']);
  assert.deepEqual(titleOnly.clubIds, ['c1', 'c2', 'c3']);
  const tied = {
    ...matrix,
    rows: [
      { ...matrix.rows[0], cells: matrix.rows[0].cells.map((cell) => cell.clubId === 'c1' ? { ...cell, rank: 1 } : cell) },
      matrix.rows[1],
      { ...matrix.rows[2], cells: matrix.rows[2].cells.map((cell) => cell.clubId === 'c1' ? { ...cell, assignment } : cell) },
    ],
  };
  const tiesDescending = sortPriorityMatrix(tied, { id: 'c1', direction: 'descending' }, { id: 'a', direction: 'descending' });
  assert.deepEqual(tiesDescending.rows.map((row) => row.titleId), ['a', 'b', 'c']);
  assert.deepEqual(tiesDescending.clubIds, ['c1', 'c2', 'c3']);
  assert.equal(tiesDescending.rows[2].cells[0].assignment, assignment);
  const filtered = { ...matrix, clubIds: ['c2', 'c3'], rows: matrix.rows.map((row) => ({ ...row, cells: row.cells.filter((cell) => cell.clubId !== 'c1') })) };
  assert.deepEqual(sortPriorityMatrix(filtered, { id: 'c1', direction: 'descending' }, { id: 'a', direction: 'ascending' }).rows.map((row) => row.titleId), ['a', 'b', 'c']);
  assert.deepEqual(matrix.rows.map((row) => row.titleId), ['a', 'b', 'c']);
  assert.deepEqual(matrix.clubIds, ['c1', 'c2', 'c3']);
});

test('schedule preview checks conflicts against proposed assignments, not replaced saved assignments', () => {
  const cycle = { id: 'cy', startsOn: '2026-01-01', endsOn: '2026-01-31', status: 'drafted',
    slots: [{ id: 's1', clubId: 'c1', month: '2026-01', meeting: '2026-01-10' }] } as Cycle;
  const saved = { id: 'old', cycleId: 'cy', slotId: 's1', clubId: 'c1', kitId: 'k1',
    ready: '2026-01-05', meeting: '2026-01-10', due: '2026-01-20', locked: false };
  const proposed = { ...saved, id: 'new', kitId: 'k2' };
  const data = { library: { bufferDays: 0 }, cycles: [cycle], clubs: [{ id: 'c1', history: [] }],
    kits: [{ id: 'k1', titleId: 't1', status: 'available' }, { id: 'k2', titleId: 't2', status: 'available' }],
    assignments: [saved] } as unknown as Data;
  assert.equal(scheduleGrid(data, cycle, ['c1'], [proposed]).rows[0].cells[0].problem, null);
});

test('priority matrix combines member votes and respects finalized rankings and history', () => {
  const data = {
    clubs: [{ id: 'c1', history: ['old'] }, { id: 'c2', history: [] }],
    titles: [{ id: 'a' }, { id: 'b' }, { id: 'old' }],
    kits: [],
    ballots: [
      { cycleId: 'cy', clubId: 'c1', personId: 'p1', marks: { a: 'selected', b: 'selected', old: 'selected' }, ranking: ['a', 'b', 'old'] },
      { cycleId: 'cy', clubId: 'c1', personId: 'p2', marks: { b: 'selected' }, ranking: ['b'] },
      { cycleId: 'cy', clubId: 'c2', personId: 'p3', marks: { a: 'selected' }, ranking: ['a'] },
    ],
  } as unknown as Data;
  const cycle = { id: 'cy', slots: [], finalized: {} } as unknown as Cycle;
  const combined = priorityMatrix(data, cycle, ['c1', 'c2'], []);
  assert.equal(combined.rows.find((row) => row.titleId === 'a')?.rankedClubCount, 2);
  assert.equal(combined.rows.find((row) => row.titleId === 'a')?.cells[0].rank, 1);
  assert.equal(combined.rows.find((row) => row.titleId === 'b')?.cells[0].rank, 2);
  assert.equal(combined.rows.some((row) => row.titleId === 'old'), false);
  cycle.finalized = { c1: ['b', 'old', 'missing', 'a'], c2: [] };
  const finalized = priorityMatrix(data, cycle, ['c1', 'c2'], []);
  assert.equal(finalized.rows.find((row) => row.titleId === 'a')?.rankedClubCount, 1);
  assert.equal(finalized.rows.find((row) => row.titleId === 'a')?.contested, false);
  assert.equal(finalized.rows.find((row) => row.titleId === 'b')?.cells[0].rank, 1);
  assert.equal(finalized.rows.find((row) => row.titleId === 'a')?.cells[1].rank, null);
  assert.equal(finalized.rows.some((row) => row.titleId === 'missing'), false);
});

test('assignment-only titles do not count as ranked clubs', () => {
  const data = {
    clubs: [{ id: 'c1', history: [] }, { id: 'c2', history: [] }],
    titles: [{ id: 'ranked' }, { id: 'assigned' }],
    kits: [{ id: 'k', titleId: 'assigned' }],
    ballots: [
      { cycleId: 'cy', clubId: 'c1', personId: 'p1', marks: { ranked: 'selected' }, ranking: ['ranked'] },
      { cycleId: 'cy', clubId: 'c1', personId: 'p2', marks: { ranked: 'selected' }, ranking: ['ranked'] },
    ],
  } as unknown as Data;
  const cycle = { id: 'cy', slots: [{ id: 's', clubId: 'c2', month: '2027-01' }], finalized: {} } as Cycle;
  const assignment = { id: 'a', cycleId: 'cy', slotId: 's', clubId: 'c2', kitId: 'k' } as Assignment;
  const matrix = priorityMatrix(data, cycle, ['c1', 'c2'], [assignment]);
  assert.deepEqual(matrix.rows.map((row) => [row.titleId, row.rankedClubCount, row.contested]), [
    ['ranked', 1, false], ['assigned', 0, false],
  ]);
  assert.equal(matrix.rows[1].cells[1].month, '2027-01');
  assert.equal(matrix.rows[1].cells[1].assignment?.id, 'a');
  assert.equal(priorityMatrix(data, cycle, ['c1'], [assignment]).rows.some((row) => row.titleId === 'assigned'), false);
});

test('title demand counts each selected club once regardless of finalization', () => {
  const data = { ballots: [
    { cycleId: 'cy', clubId: 'c1', marks: { a: 'selected' } },
    { cycleId: 'cy', clubId: 'c1', marks: { a: 'selected', b: 'read' } },
    { cycleId: 'cy', clubId: 'c2', marks: { a: 'selected', b: 'selected' } },
    { cycleId: 'other', clubId: 'c2', marks: { b: 'selected' } },
  ] } as unknown as Data;
  assert.deepEqual([...titleDemand(data, 'cy', ['c1'])], [['a', 1]]);
  assert.deepEqual([...titleDemand(data, 'cy', ['c1', 'c2'])], [['a', 2], ['b', 1]]);
  assert.equal(titleDemand(data, 'cy', []).size, 0);
});

test('member meeting calendar groups visible enrolled assignments by month and day in date order', () => {
  const data = {
    cycles: [{ id: 'cy1', status: 'published' }, { id: 'cy2', status: 'published' }, { id: 'draft', status: 'drafted' }, { id: 'collect', status: 'collecting' }],
    assignments: [
      { id: 'future', cycleId: 'cy2', clubId: 'c2', meeting: '2026-03-01' },
      { id: 'today', cycleId: 'cy1', clubId: 'c1', meeting: '2026-02-01' },
      { id: 'tie', cycleId: 'cy2', clubId: 'c1', meeting: '2026-02-01' },
      { id: 'past', cycleId: 'cy1', clubId: 'c1', meeting: '2026-01-15' },
      { id: 'drafted', cycleId: 'draft', clubId: 'c1', meeting: '2026-03-01' },
      { id: 'hidden', cycleId: 'collect', clubId: 'c1', meeting: '2026-03-01' },
      { id: 'other', cycleId: 'cy1', clubId: 'c3', meeting: '2026-03-01' },
    ],
  } as unknown as Data;
  const calendar = memberMeetingCalendar(data, ['c1', 'c2']);
  assert.deepEqual(calendar.map((m) => m.month), ['2026-01', '2026-02', '2026-03']);
  assert.deepEqual(calendar[1].days.map((d) => d.day), ['2026-02-01']);
  assert.deepEqual(calendar[1].days[0].assignments.map((a) => a.id), ['today', 'tie']);
  assert.deepEqual(calendar[2].days[0].assignments.map((a) => a.id), ['drafted', 'future']);
  assert.deepEqual(memberMeetingCalendar(data, ['c1']).flatMap((m) => m.days.map((d) => d.day)), ['2026-01-15', '2026-02-01', '2026-03-01']);
  assert.deepEqual(memberMeetingCalendar(data, []), []);
});

test('member schedule includes visible unassigned slots and orphan assignments without duplicating assigned slots', () => {
  const data = {
    cycles: [
      { id: 'draft', status: 'drafted', slots: [
        { id: 'assigned', clubId: 'c1', month: '2027-01', meeting: null },
        { id: 'open', clubId: 'c1', month: '2027-02', meeting: null },
        { id: 'other', clubId: 'c2', month: '2027-03', meeting: '2027-03-10' },
      ] },
      { id: 'published', status: 'published', slots: [] },
      { id: 'hidden', status: 'collecting', slots: [{ id: 'hidden-slot', clubId: 'c1', month: '2027-01', meeting: null }] },
    ],
    assignments: [
      { id: 'a', cycleId: 'draft', clubId: 'c1', slotId: 'assigned', meeting: '2027-01-15' },
      { id: 'orphan', cycleId: 'published', clubId: 'c1', slotId: 'missing', meeting: '2027-04-01' },
      { id: 'hidden', cycleId: 'hidden', clubId: 'c1', slotId: 'hidden-slot', meeting: '2027-01-01' },
    ],
  } as unknown as Data;
  const meetings = memberScheduleMeetings(data, ['c1']);
  assert.deepEqual(meetings.map((meeting) => meeting.key), ['assignment:a', 'slot:draft:open', 'assignment:orphan']);
  assert.equal(meetings[1].date, null);
  assert.deepEqual(memberScheduleMeetings(data, []), []);
  assert.equal(memberScheduleMeetings(data, ['c2'])[0].date, '2027-03-10');
});

test('staff kits group selected cycle assignments by physical kit in meeting order', () => {
  const assignment = (id: string, kitId: string, clubId: string, meeting: string, cycleId = 'cy'): Assignment =>
    ({ id, kitId, clubId, meeting, cycleId, slotId: id, ready: meeting, due: meeting, locked: false });
  const data = {
    titles: [{ id: 't', name: 'Same title' }],
    kits: [{ id: 'k1', titleId: 't', barcode: 'A' }, { id: 'k2', titleId: 't', barcode: 'B' }],
    assignments: [
      assignment('later', 'k1', 'c1', '2026-03-01'),
      assignment('other-kit', 'k2', 'c1', '2026-02-01'),
      assignment('earlier', 'k1', 'c2', '2026-01-01'),
      assignment('missing', 'missing-kit', 'c2', '2026-04-01'),
      assignment('other-cycle', 'k1', 'c1', '2026-01-01', 'other'),
    ],
  } as unknown as Data;
  const groups = scheduleByKit(data, 'cy', ['c1', 'c2']);
  assert.deepEqual(groups.map((group) => [group.kitId, group.assignments.map((item) => item.id)]), [
    ['k1', ['earlier', 'later']], ['k2', ['other-kit']], ['missing-kit', ['missing']],
  ]);
  assert.deepEqual(scheduleByKit(data, 'cy', ['c1']).map((group) => group.assignments.map((item) => item.id)), [['later'], ['other-kit']]);
  assert.deepEqual(scheduleByKit(data, 'cy', []), []);
});

test('local schedule changes include edits and unlocks but not assignment ordering', () => {
  const first: Assignment = { id: 'a', cycleId: 'cy', slotId: 's1', clubId: 'c1', kitId: 'k1', ready: '2026-01-01', meeting: '2026-01-10', due: '2026-01-20', locked: true };
  const second: Assignment = { ...first, id: 'b', slotId: 's2', clubId: 'c2', locked: false };
  assert.equal(scheduleHasChanges([first, second], [second, first], []), false);
  assert.equal(scheduleHasChanges([first, second], [{ ...first, kitId: 'k2' }, second], []), true);
  assert.equal(scheduleHasChanges([first, second], [first], []), true);
  assert.equal(scheduleHasChanges([first, second], [first, second], ['a']), true);
  assert.equal(scheduleHasChanges([first], [{ ...first, locked: false }], []), true);
});

test('monthsInRange lists every month inclusively, across year boundaries', () => {
  assert.deepEqual(monthsInRange('2026-11-15', '2027-02-01'), ['2026-11', '2026-12', '2027-01', '2027-02']);
  assert.deepEqual(monthsInRange('2026-03-01', '2026-03-31'), ['2026-03']);
});

test('dateless slots fall back to the first Monday of their month', () => {
  assert.equal(firstMonday('2026-06'), '2026-06-01');
  assert.equal(firstMonday('2026-02'), '2026-02-02');
  const slot = { id: 's', clubId: 'c', month: '2026-02', meeting: null };
  assert.equal(meetingFor(slot), '2026-02-02');
  assert.equal(meetingFor({ ...slot, meeting: '2026-02-20' }), '2026-02-20');
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
  const statuses: SyncStatus[] = [];
  const sync = new BallotSync((status) => statuses.push(status));
  sync.configure(async (ballot) => {
    attempts += 1;
    if (attempts === 1) throw new Error('Conflict');
    return { ...ballot, revision: ballot.revision + 1 };
  }, () => undefined);
  sync.enqueue(emptyBallot('cycle', 'club', 'person'));
  await assert.rejects(sync.flush(), /Conflict/);
  assert.equal(statuses.at(-1)?.key, 'cycle:club:person');
  await sync.flush();
  assert.equal(attempts, 2);
});

test('ballot sync identifies a failed club and retains drafts for other clubs', async () => {
  const statuses: SyncStatus[] = [];
  const sent: string[] = [];
  let first = true;
  const sync = new BallotSync((status) => statuses.push(status));
  sync.configure(async (ballot) => {
    sent.push(ballot.clubId);
    if (first) { first = false; throw new Error('Conflict'); }
    return { ...ballot, revision: ballot.revision + 1 };
  }, () => undefined);
  sync.enqueue(emptyBallot('cycle', 'c1', 'person'));
  sync.enqueue(emptyBallot('cycle', 'c2', 'person'));
  await assert.rejects(sync.flush(), /Conflict/);
  assert.equal(statuses.at(-1)?.key, 'cycle:c1:person');
  await sync.flush();
  assert.deepEqual(sent, ['c1', 'c2', 'c1']);
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

test('fairness weights priorities per slot and counts repeated titles only once', () => {
  const data = seed();
  const cycle = data.cycles[0];
  cycle.finalized.c1 = ['t1', 't2', 't3'];
  const first = cycle.slots.find((slot) => slot.id === 's1')!;
  const second = cycle.slots.find((slot) => slot.id === 's3')!;
  const make = (slot: typeof first, kitId: string): Assignment => ({
    id: slot.id, cycleId: cycle.id, slotId: slot.id, clubId: slot.clubId, kitId,
    ready: '2026-01-01', meeting: '2026-01-02', due: '2026-01-03', locked: false,
  });
  assert.equal(fairness(data, cycle, 'c1', [make(first, 'k1'), make(second, 'k3')]).score, 100 * (1 + 2 / 3) / 2);
  assert.equal(fairness(data, cycle, 'c1', [make(first, 'k1'), make(second, 'k2')]).score, 50);
  assert.equal(fairness(data, cycle, 'c1', [make(first, 'k5')]).score, 0);
  assert.ok(Math.abs((fairness(data, cycle, 'c1', [make(second, 'k4')]).score ?? 0) - 100 / 6) < 1e-10);
  cycle.finalized.c1 = [];
  assert.equal(fairness(data, cycle, 'c1', [make(first, 'k1')]).score, null);
  assert.equal(fairness(data, cycle, 'missing', []).score, null);
  delete cycle.finalized.c1;
  assert.notEqual(fairness(data, cycle, 'c1', [make(first, 'k1')]).score, null);
});

test('local assignment warnings include multiple issues and other cycles', () => {
  const data = seed();
  const cycle = data.cycles[0];
  const assignment = draft(data, cycle).assignments[0];
  data.kits.find((kit) => kit.id === assignment.kitId)!.status = 'unavailable';
  data.clubs.find((club) => club.id === assignment.clubId)!.history.push(data.kits.find((kit) => kit.id === assignment.kitId)!.titleId);
  const other = { ...assignment, id: 'other', cycleId: 'other-cycle', slotId: 'other-slot' };
  const problems = assignmentProblems(data, assignment, [assignment, other]);
  assert.ok(problems.some((problem) => problem.includes('unavailable')));
  assert.ok(problems.some((problem) => problem.includes('already read')));
  assert.ok(problems.some((problem) => problem.includes('other-cycle')));
});

test('buffer boundary and invalid locks are reported', () => {
  const data = seed();
  const cycle = data.cycles[0];
  const result = draft(data, cycle);
  const assignment = result.assignments[0];
  const ready = addDays(assignment.due, data.library.bufferDays);
  const meeting = addDays(ready, 1);
  cycle.slots.push({ id: 'other-slot', clubId: 'c2', month: meeting.slice(0, 7), meeting });
  const conflicting = { ...assignment, id: 'other', slotId: 'other-slot', clubId: 'c2', ready, meeting, due: addDays(ready, 5), locked: true };
  assert.match(assignmentProblem(data, conflicting, [assignment]) ?? '', /buffer/);
  data.assignments = [{ ...assignment, locked: true }, conflicting];
  assert.ok(draft(data, cycle).problems.some((p) => p.startsWith('Locked assignment')));
  const editable = draft(data, cycle, true);
  assert.ok(editable.problems.some((p) => p.startsWith('Locked assignment')));
  assert.ok(editable.assignments.some((item) => item.slotId !== assignment.slotId && item.slotId !== conflicting.slotId));
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
