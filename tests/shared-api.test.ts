/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { seed } from '../src/domain/seed';
import {
  ApiError, deleteClub, deleteCycle, deleteUser, finalizeRanking, loadShared, previewClubDeletion, reopenCycle, saveBallot, saveCycle, saveEvent,
  saveHistory, saveMemberships, saveSchedule, saveSettings, saveUser, saveValidatedSchedule, validateSchedule,
} from '../src/state/api';

const demo = seed();
const payload = {
  people: demo.people,
  memberships: demo.memberships,
  membershipRevisions: demo.clubs.map((club) => ({ clubId: club.id, revision: club.membershipRevision })),
  cycles: demo.cycles,
  ballots: demo.ballots,
  assignments: demo.assignments,
  library: demo.library,
  events: demo.events,
  history: [{ clubId: 'c1', titles: ['t4'] }],
  titles: demo.titles.map((title) => ({ ...title, revision: 1 })),
  kits: demo.kits.map((kit) => ({ ...kit, revision: 1 })),
  clubs: demo.clubs.map(({ leaderId: _leaderId, history: _history, membershipRevision: _membershipRevision, ...club }) => club),
  links: [],
};

test('shared loader validates shared users, memberships, cycles and catalog response shapes', async () => {
  const oldUrl = process.env.EXPO_PUBLIC_API_URL;
  const oldFetch = globalThis.fetch;
  process.env.EXPO_PUBLIC_API_URL = 'https://demo.example';
  const paths: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    return new Response(JSON.stringify(payload), { status: 200 });
  };
  try {
    const result = await loadShared();
    assert.equal(result.people.length, 6);
    assert.equal(result.memberships.length, 4);
    assert.equal(result.cycles[0].slots.length, 4);
    assert.equal(result.clubs[0].revision, 1);
    assert.deepEqual(paths, ['/api/shared']);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = oldUrl;
  }
});

test('shared loader rejects a snapshot missing catalog records', async () => {
  const oldUrl = process.env.EXPO_PUBLIC_API_URL;
  const oldFetch = globalThis.fetch;
  process.env.EXPO_PUBLIC_API_URL = 'https://demo.example';
  const { titles: _titles, ...incomplete } = payload;
  globalThis.fetch = async () => new Response(JSON.stringify(incomplete), { status: 200 });
  try {
    await assert.rejects(loadShared(), /invalid data for \/api\/shared/);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = oldUrl;
  }
});

test('club deletion previews and confirms the current revision and token', async () => {
  const oldUrl = process.env.EXPO_PUBLIC_API_URL;
  const oldFetch = globalThis.fetch;
  process.env.EXPO_PUBLIC_API_URL = 'https://demo.example';
  const calls: { path: string; method: string | undefined; body: Record<string, unknown>; revision: string | null }[] = [];
  const preview = { token: 'a'.repeat(64), club: { id: 'club 1', name: 'Club', revision: 3 },
    counts: { memberships: 1, kitLinks: 0, history: 0, ballots: 1, ballotMarks: 2, finalizedGroups: 0,
      finalizedRankings: 0, slots: 1, assignments: 1, lockedAssignments: 1 },
    cycles: [{ id: 'cycle', name: 'Cycle', status: 'published', slots: 1, assignments: 1, remainingSlots: 0 }],
    affectedKits: [{ id: 'kit', barcode: 'KIT-1', status: 'out' }] };
  globalThis.fetch = async (input, init) => {
    calls.push({ path: new URL(String(input)).pathname, method: init?.method,
      body: JSON.parse(String(init?.body)) as Record<string, unknown>, revision: new Headers(init?.headers).get('If-Match') });
    return init?.method === 'DELETE' ? new Response(null, { status: 204 }) : new Response(JSON.stringify(preview), { status: 200 });
  };
  try {
    const result = await previewClubDeletion('club 1', 3);
    assert.deepEqual(result, preview);
    await deleteClub('club 1', 3, result.token);
    assert.deepEqual(calls, [
      { path: '/api/clubs/club%201/deletion-preview', method: 'POST', body: { revision: 3 }, revision: null },
      { path: '/api/clubs/club%201', method: 'DELETE', body: { token: preview.token, acknowledge: true }, revision: '3' },
    ]);
    globalThis.fetch = async () => new Response(JSON.stringify({ ...preview, counts: {} }), { status: 200 });
    await assert.rejects(previewClubDeletion('club 1', 3), /invalid club deletion preview/);
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Details changed.' }), { status: 409 });
    await assert.rejects(deleteClub('club 1', 3, result.token), /Details changed/);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = oldUrl;
  }
});

test('ballot and schedule writes target cycle-scoped endpoints and carry revisions', async () => {
  const oldUrl = process.env.EXPO_PUBLIC_API_URL;
  const oldFetch = globalThis.fetch;
  process.env.EXPO_PUBLIC_API_URL = 'https://demo.example';
  const requests: { path: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = async (input, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const path = new URL(String(input)).pathname;
    requests.push({ path, body });
    const response = path.endsWith('/ballots/p3')
      ? { cycleId: 'cycle1', clubId: 'c1', personId: 'p3', marks: { t1: 'selected' }, ranking: ['t1'], revision: 2 }
      : { revision: 3 };
    return new Response(JSON.stringify(response), { status: 200 });
  };
  try {
    const ballot = { cycleId: 'cycle1', clubId: 'c1', personId: 'p3', marks: { t1: 'selected' as const }, ranking: ['t1'], revision: 1 };
    const saved = await saveBallot(ballot);
    assert.equal(saved.revision, 2);
    await saveSchedule('cycle1', [], 2, false);
    assert.equal(requests[0].path, '/api/cycles/cycle1/clubs/c1/ballots/p3');
    assert.equal(requests[0].body.revision, 1);
    assert.equal(requests[1].path, '/api/cycles/cycle1/schedule');
    assert.equal(requests[1].body.revision, 2);
    assert.equal(requests[1].body.publish, false);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = oldUrl;
  }
});

test('stale server responses expose actionable API conflict errors', async () => {
  const oldUrl = process.env.EXPO_PUBLIC_API_URL;
  const oldFetch = globalThis.fetch;
  process.env.EXPO_PUBLIC_API_URL = 'https://demo.example';
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Revision conflict; refresh and retry.' }), { status: 409 });
  try {
    await assert.rejects(loadShared(), /Revision conflict/);
    const error = new ApiError('Revision conflict', 409);
    assert.equal(error.status, 409);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = oldUrl;
  }
});

test('schedule validation binds acknowledged saves to revision, unlocks and snapshot', async () => {
  const oldUrl = process.env.EXPO_PUBLIC_API_URL;
  const oldFetch = globalThis.fetch;
  process.env.EXPO_PUBLIC_API_URL = 'https://demo.example';
  const requests: { path: string; method: string | undefined; body: Record<string, unknown> }[] = [];
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    requests.push({ path, method: init?.method, body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(path.endsWith('/validate') ? { token: 'token', warnings: [{ slotId: 's1', message: 'Conflict' }] } : { revision: 3 }), { status: 200 });
  };
  try {
    const basis = { cycles: [{ id: 'cycle1', revision: 2 }], kits: [], clubs: [], settings: 1 };
    const validation = await validateSchedule('cycle1', [], 2, false, ['a1'], basis);
    assert.equal(validation.warnings[0].slotId, 's1');
    await saveValidatedSchedule('cycle1', [], 2, false, ['a1'], validation.token, basis);
    assert.deepEqual(requests[0], { path: '/api/cycles/cycle1/schedule/validate', method: 'POST',
      body: { assignments: [], revision: 2, publish: false, unlockIds: ['a1'], newSlots: [], removedSlotIds: [], basis } });
    assert.deepEqual(requests[1].body, { assignments: [], revision: 2, publish: false, unlockIds: ['a1'], newSlots: [], removedSlotIds: [], validationToken: 'token', acknowledge: true, basis });
    globalThis.fetch = async () => new Response(JSON.stringify({ token: 'token', warnings: [{ slotId: 1 }] }), { status: 200 });
    await assert.rejects(validateSchedule('cycle1', [], 2, false, []), /invalid schedule validation/);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = oldUrl;
  }
});

test('reopening a cycle sends an acknowledged revision and validates the response', async () => {
  const oldUrl = process.env.EXPO_PUBLIC_API_URL;
  const oldFetch = globalThis.fetch;
  process.env.EXPO_PUBLIC_API_URL = 'https://demo.example';
  let captured: { path: string; method: string | undefined; body: unknown } | undefined;
  globalThis.fetch = async (input, init) => {
    captured = { path: new URL(String(input)).pathname, method: init?.method, body: JSON.parse(String(init?.body)) };
    return new Response(JSON.stringify({ ...demo.cycles[0], status: 'collecting', revision: 5 }), { status: 200 });
  };
  try {
    const result = await reopenCycle('cycle1', 4);
    assert.equal(result.revision, 5);
    assert.deepEqual(captured, { path: '/api/cycles/cycle1/reopen', method: 'POST', body: { revision: 4, acknowledge: true } });
    globalThis.fetch = async () => new Response(JSON.stringify({ revision: 5 }), { status: 200 });
    await assert.rejects(reopenCycle('cycle1', 4), /invalid cycle/);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = oldUrl;
  }
});

test('shared user, membership, cycle, settings, history and circulation APIs use revisions and scoped routes', async () => {
  const oldUrl = process.env.EXPO_PUBLIC_API_URL;
  const oldFetch = globalThis.fetch;
  process.env.EXPO_PUBLIC_API_URL = 'https://demo.example';
  const requests: { method: string; path: string; body: Record<string, unknown> | null; revision: string | null }[] = [];
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
    requests.push({ method: init?.method ?? 'GET', path, body, revision: new Headers(init?.headers).get('If-Match') });
    const response = path === '/api/users/p3' && init?.method === 'PUT'
      ? { id: 'p3', name: 'Casey', role: 'member', revision: 2 }
      : path === '/api/cycles/cycle1' && init?.method === 'PUT'
        ? { ...demo.cycles[0], revision: 2 }
        : path === '/api/cycles' && init?.method === 'POST'
          ? { ...demo.cycles[0], id: 'new-cycle', name: 'New', status: 'open', slots: [], revision: 2 }
        : path.endsWith('/events')
          ? { revision: 2, status: 'out' } : { revision: 2 };
    return new Response(JSON.stringify(response), { status: 200 });
  };
  try {
    const person = await saveUser({ id: 'p3', name: 'Casey', role: 'member', revision: 1 });
    assert.equal(person.revision, 2);
    await saveMemberships('c1', [{ personId: 'p3', clubId: 'c1', leader: true }], 1);
    const createdCycle = await saveCycle({ id: 'new-cycle', name: 'New', deadline: '2026-03-01', startsOn: '2026-04-01', endsOn: '2026-12-31', status: 'open', slots: [], finalized: {} });
    await saveCycle({ ...demo.cycles[0], revision: 1 });
    await finalizeRanking('cycle1', 'c1', ['t1'], 2);
    await saveSchedule('cycle1', [], 3, true);
    await saveSettings({ ...demo.library, revision: 1 });
    await saveHistory('c1', ['t4'], 2);
    const event = { id: 'evt', kitId: 'k1', action: 'inspected' as const, at: '2026-01-01T00:00:00.000Z', notes: '', returnedCopies: 9, missingComponents: ['copy-1'] };
    await saveEvent('k1', event, 1, false);
    await deleteCycle('cycle1', 4);
    await deleteUser('p3', 2);
    const membership = requests.find((request) => request.path.endsWith('/memberships'));
    assert.equal(membership?.body?.revision, 1);
    assert.deepEqual(membership?.body?.members, [{ personId: 'p3', leader: true }]);
    const createCycle = requests.find((request) => request.path === '/api/cycles' && request.method === 'POST');
    assert.equal(createdCycle.id, 'new-cycle');
    assert.deepEqual(Object.keys(createCycle?.body ?? {}).sort(), ['deadline', 'endsOn', 'id', 'name', 'slots', 'startsOn', 'status']);
    const history = requests.find((request) => request.path.endsWith('/history'));
    assert.equal(history?.body?.revision, 2);
    const circulation = requests.find((request) => request.path.endsWith('/events'));
    assert.equal(circulation?.body?.complete, false);
    assert.equal('kitId' in (circulation?.body ?? {}), false);
    assert.equal(requests.find((request) => request.path === '/api/cycles/cycle1')?.body?.revision, 1);
    assert.equal(requests.find((request) => request.path === '/api/users/p3')?.revision, null);
    assert.equal(requests.find((request) => request.path === '/api/users/p3' && request.method === 'DELETE')?.revision, '2');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = oldUrl;
  }
});
