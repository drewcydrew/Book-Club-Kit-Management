/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { seed } from '../src/domain/seed';
import { filterScheduleTitleGroups, previewScheduleKit, scheduleTitleGroups } from '../src/domain/schedule-options';
import type { Assignment } from '../src/domain/model';

function fixture() {
  const data = seed();
  const cycle = data.cycles[0];
  cycle.startsOn = '2026-01-01'; cycle.endsOn = '2026-03-31'; cycle.deadline = '2025-12-01';
  cycle.slots = [
    { id: 's1', clubId: 'c1', month: '2026-01', meeting: '2026-01-10' },
    { id: 's2', clubId: 'c1', month: '2026-02', meeting: '2026-02-10' },
    { id: 's3', clubId: 'c2', month: '2026-01', meeting: '2026-01-25' },
  ];
  const current: Assignment = { id: 'a1', cycleId: cycle.id, slotId: 's1', clubId: 'c1', kitId: 'k1',
    ready: '2026-01-01', meeting: '2026-01-10', due: '2026-01-31', locked: false };
  const duplicate: Assignment = { ...current, id: 'a2', slotId: 's2', kitId: 'k3',
    ready: '2026-02-01', meeting: '2026-02-10', due: '2026-02-28' };
  const other: Assignment = { ...current, id: 'a3', cycleId: 'other', slotId: 'other-slot', clubId: 'c2', kitId: 'k2',
    ready: '2026-01-25', meeting: '2026-01-25', due: '2026-02-01' };
  data.cycles.push({ ...cycle, id: 'other', slots: [{ id: 'other-slot', clubId: 'c2', month: '2026-01', meeting: '2026-01-25' }] });
  data.assignments = [current, duplicate, other];
  return { data, cycle, slot: cycle.slots[0], current, duplicate, other };
}

test('title groups prioritize unused ranked titles, retain assigned priorities and show missing kits', () => {
  const { data, cycle, slot } = fixture();
  const noKit = { ...data.titles[0], id: 'no-kit', name: 'No kit title' };
  data.titles.push(noKit);
  cycle.finalized.c1 = ['t2', 't1', 'no-kit', 't4'];
  const groups = scheduleTitleGroups(data, cycle, slot, data.assignments);
  assert.deepEqual(groups.map((group) => group.titleId), ['t1', 'no-kit', 't4', 't2', 't3']);
  assert.equal(groups.find((group) => group.titleId === 't2')?.alreadyAssigned, true);
  assert.equal(groups.find((group) => group.titleId === 'no-kit')?.kits.length, 0);
  assert.deepEqual(groups.find((group) => group.titleId === 't1')?.kits.map((kit) => kit.id), ['k1', 'k2']);
  assert.deepEqual(filterScheduleTitleGroups(groups, 'KIT-102 WEST').map((group) => group.titleId), ['t1']);
  cycle.finalized.c1 = [];
  assert.ok(scheduleTitleGroups(data, cycle, slot, data.assignments).every((group) => group.rank === null));
  delete cycle.finalized.c1;
  assert.ok(scheduleTitleGroups(data, cycle, slot, data.assignments).some((group) => group.rank !== null));
});

test('kit previews replace the current slot and preserve its loan window when checking other cycles', () => {
  const { data, cycle, slot, current, other } = fixture();
  const kits = new Map(data.kits.map((kit) => [kit.id, kit]));
  const titles = new Map(data.titles.map((title) => [title.id, title]));
  const preview = (kitId: string, meeting = current.meeting, stale = false) =>
    previewScheduleKit(data, cycle, slot, meeting, current, kits.get(kitId)!, [current, other], stale, kits, titles);
  assert.equal(preview('k1').state, 'clear');
  assert.match(preview('k2').messages.join(' '), /other-cycle|cycle other/);
  assert.equal(preview('k1', 'bad-date').state, 'unknown');
  assert.equal(preview('k1', current.meeting, true).state, 'unknown');
  other.due = 'invalid';
  assert.equal(preview('k2').state, 'unknown');
  other.due = '2026-02-01';
  data.kits.find((kit) => kit.id === 'k1')!.status = 'unavailable';
  data.clubs.find((club) => club.id === 'c1')!.history.push('t1');
  const warnings = preview('k1').messages.join(' ');
  assert.match(warnings, /unavailable/);
  assert.match(warnings, /already read/);
  titles.delete('t1');
  assert.equal(preview('k1').state, 'unknown');
});

test('kit previews flag duplicate titles in the local proposal, even when other clubs are hidden', () => {
  const { data, cycle, slot, current, duplicate } = fixture();
  const kits = new Map(data.kits.map((kit) => [kit.id, kit]));
  const titles = new Map(data.titles.map((title) => [title.id, title]));
  const preview = previewScheduleKit(data, cycle, slot, current.meeting, current, kits.get('k3')!,
    [current, duplicate], false, kits, titles);
  assert.match(preview.messages.join(' '), /already has this title/);
  const hidden: Assignment = { ...current, id: 'hidden', slotId: 's3', clubId: 'c2', kitId: 'k2', meeting: '2026-01-25' };
  const conflict = previewScheduleKit(data, cycle, slot, current.meeting, current, kits.get('k2')!,
    [current, hidden], false, kits, titles);
  assert.match(conflict.messages.join(' '), /loan windows conflict/);
  const missingKit = { ...duplicate, kitId: 'missing' };
  assert.equal(previewScheduleKit(data, cycle, slot, current.meeting, current, kits.get('k1')!,
    [current, missingKit], false, kits, titles).state, 'unknown');
});

test('changing a flexible meeting date recalculates its loan window', () => {
  const { data, cycle, slot, current, other } = fixture();
  slot.meeting = null;
  const kits = new Map(data.kits.map((kit) => [kit.id, kit]));
  const titles = new Map(data.titles.map((title) => [title.id, title]));
  const preview = previewScheduleKit(data, cycle, slot, '2026-01-05', current, kits.get('k2')!,
    [current, other], false, kits, titles);
  assert.equal(preview.state, 'clear');
});
