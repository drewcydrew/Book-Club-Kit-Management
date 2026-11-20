import assert from 'node:assert/strict';
import test from 'node:test';
import { selectMemberScheduleCycle, type MemberScheduleMeeting } from '../src/domain/cycle-overview';
import { calendarDateLabel, calendarMonthLabel, calendarWeeks, memberCalendarMonths } from '../src/domain/member-calendar';
import type { Cycle } from '../src/domain/model';

const cycle = (id: string, startsOn: string, endsOn: string): Cycle => ({
  id, name: id, startsOn, endsOn, deadline: startsOn, status: 'published', slots: [], finalized: {}, revision: 1,
});
const meeting = (key: string, cycleValue: Cycle, month: string, date: string | null, clubId = 'c1'): MemberScheduleMeeting =>
  ({ key, cycle: cycleValue, month, date, clubId });

test('calendar grids use Monday-first dates across leap years and year boundaries', () => {
  const february = calendarWeeks('2024-02');
  assert.deepEqual(february[0], [null, null, null, '2024-02-01', '2024-02-02', '2024-02-03', '2024-02-04']);
  assert.deepEqual(february.at(-1), ['2024-02-26', '2024-02-27', '2024-02-28', '2024-02-29', null, null, null]);
  assert.equal(calendarWeeks('2025-02').flat().filter(Boolean).length, 28);
  assert.deepEqual(calendarWeeks('2027-01')[0], [null, null, null, null, '2027-01-01', '2027-01-02', '2027-01-03']);
  assert.equal(calendarMonthLabel('2027-01'), 'January 2027');
  assert.equal(calendarDateLabel('2027-01-03'), 'January 3, 2027');
});

test('member calendars include empty and overlapping cycle months and actual out-of-range dates', () => {
  const first = cycle('first', '2026-12-01', '2027-03-31');
  const second = cycle('second', '2027-02-01', '2027-04-30');
  const meetings = [
    meeting('one', first, '2027-01', '2027-01-10'),
    meeting('two', second, '2027-01', '2027-01-10', 'c2'),
    meeting('undated', first, '2027-03', null),
    meeting('outside', first, '2027-05', '2027-05-02'),
  ];
  const months = memberCalendarMonths(meetings, '2027-01-10', true);
  assert.deepEqual(months.map((month) => month.month), ['2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05']);
  assert.deepEqual(months[1].dated.get('2027-01-10')?.map((item) => item.key), ['one', 'two']);
  assert.equal(months[2].dated.size, 0);
  assert.deepEqual(months[3].undated.map((item) => item.key), ['undated']);
  assert.deepEqual(months[5].dated.get('2027-05-02')?.map((item) => item.key), ['outside']);
  assert.deepEqual(memberCalendarMonths([], '2027-01-10', true), []);
});

test('hiding past retains today, current undated meetings, and future empty months', () => {
  const c = cycle('c', '2026-12-01', '2027-03-31');
  const meetings = [
    meeting('past-month', c, '2026-12', null),
    meeting('yesterday', c, '2027-01', '2027-01-09'),
    meeting('today', c, '2027-01', '2027-01-10'),
    meeting('current-undated', c, '2027-01', null),
    meeting('later', c, '2027-03', '2027-03-15'),
  ];
  const months = memberCalendarMonths(meetings, '2027-01-10', false);
  assert.deepEqual(months.map((month) => month.month), ['2027-01', '2027-02', '2027-03']);
  assert.deepEqual([...months[0].dated.keys()], ['2027-01-10']);
  assert.deepEqual(months[0].undated.map((item) => item.key), ['current-undated']);
  assert.equal(months[1].dated.size, 0);
  assert.equal(memberCalendarMonths(meetings, '2027-04-01', false).length, 0);
});

test('member cycle selection keeps a valid choice and falls back to current, upcoming, then past', () => {
  const past = cycle('past', '2026-01-01', '2026-12-31');
  const current = cycle('current', '2027-01-01', '2027-03-31');
  const upcoming = cycle('upcoming', '2027-04-01', '2027-06-30');
  const cycles = [upcoming, past, current];
  assert.equal(selectMemberScheduleCycle(cycles, 'past', '2027-01-01')?.id, 'past');
  assert.equal(selectMemberScheduleCycle(cycles, '', '2027-03-31')?.id, 'current');
  assert.equal(selectMemberScheduleCycle([past, upcoming], 'removed', '2027-01-01')?.id, 'upcoming');
  assert.equal(selectMemberScheduleCycle([past, current], '', '2028-01-01')?.id, 'current');
  assert.equal(selectMemberScheduleCycle([], 'removed', '2027-01-01'), undefined);
  const tied = [cycle('b', '2027-01-01', '2027-03-31'), cycle('a', '2027-01-01', '2027-03-31')];
  assert.equal(selectMemberScheduleCycle(tied, '', '2027-02-01')?.id, 'a');
});
