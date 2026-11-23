import assert from 'node:assert/strict';
import test from 'node:test';
import { buildKitCalendar, type KitGroup } from '../src/domain/kit-calendar';
import type { Assignment } from '../src/domain/model';

const assignment = (id: string, ready: string, meeting: string, due: string): Assignment =>
  ({ id, cycleId: 'cycle', slotId: id, clubId: 'club', kitId: 'kit-1', ready, meeting, due, locked: false });

test('a kit is out on every day from pickup to return and only the meeting day is marked', () => {
  const calendar = buildKitCalendar([{ kitId: 'kit-1', assignments: [assignment('a', '2026-03-17', '2026-04-21', '2026-04-28')] }], ['2026-03'], 60);
  const days = [...calendar.marks.keys()];
  assert.equal(days.length, 43);
  assert.equal(days[0], '2026-03-17');
  assert.equal(days.at(-1), '2026-04-28');
  assert.deepEqual(calendar.marks.get('2026-04-21')?.map((mark) => [mark.meeting, mark.ready, mark.due]), [[true, false, false]]);
  assert.deepEqual(calendar.marks.get('2026-03-17')?.map((mark) => [mark.ready, mark.meeting, mark.due]), [[true, false, false]]);
  assert.deepEqual(calendar.marks.get('2026-04-28')?.map((mark) => [mark.ready, mark.meeting, mark.due]), [[false, false, true]]);
});

test('the gap between one return and the next pickup is reported, and overlapping kit loans are flagged instead', () => {
  const groups: KitGroup[] = [{ kitId: 'kit-1', assignments: [
    assignment('first', '2026-03-17', '2026-04-21', '2026-04-28'),
    assignment('second', '2026-05-18', '2026-05-19', '2026-05-26'),
  ] }];
  const [kit] = buildKitCalendar(groups, ['2026-03', '2026-04', '2026-05'], 60).kits;
  assert.deepEqual(kit.gaps, [{ from: '2026-04-29', to: '2026-05-17', days: 19 }]);
  assert.equal(kit.overlap, false);

  const overlapping: KitGroup[] = [{ kitId: 'kit-1', assignments: [
    assignment('first', '2026-03-17', '2026-04-21', '2026-04-28'),
    assignment('second', '2026-04-20', '2026-05-19', '2026-05-26'),
  ] }];
  const [clash] = buildKitCalendar(overlapping, ['2026-04'], 60).kits;
  assert.equal(clash.overlap, true);
  assert.deepEqual(clash.gaps, []);
});

test('loans longer than the loan period are flagged as overruns, and their months are shown even outside the cycle', () => {
  const loan = assignment('long', '2026-09-01', '2026-10-05', '2026-10-12');
  const calendar = buildKitCalendar([{ kitId: 'kit-1', assignments: [loan] }], ['2026-10'], 28);
  assert.deepEqual([...calendar.kits[0].overruns], ['long']);
  assert.equal(calendar.marks.get('2026-09-15')?.[0].overrun, true);
  assert.ok(calendar.months.some((month) => month.month === '2026-09'));
});
