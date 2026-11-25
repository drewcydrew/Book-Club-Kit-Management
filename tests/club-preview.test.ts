import assert from 'node:assert/strict';
import test from 'node:test';
import { clubYearPreview } from '../src/domain/club-preview';

const monthly = { cadence: 1 as const, meetingWeekday: 3 as const, meetingOccurrence: 2 as const, skipMonths: 0, pickupOffsetDays: -7 };
const skipMonths = (...months: number[]) => months.reduce((mask, month) => mask | (1 << (month - 1)), 0);
const datesWith = (months: ReturnType<typeof clubYearPreview>, mark: string) => months
  .flatMap((month) => Object.entries(month.marks).filter(([, marks]) => marks.includes(mark as never)).map(([date]) => date));

test('monthly preview marks meeting, return (+7 days) and pickup (previous meeting plus offset)', () => {
  const months = clubYearPreview(monthly, 2027);
  assert.equal(months.length, 12);
  assert.deepEqual(months[0].marks['2027-01-06'], ['meeting']);
  assert.deepEqual(months[0].marks['2027-01-13'], ['return']);
  assert.deepEqual(months[1].marks['2027-02-10'], ['meeting']);
  assert.deepEqual(months[1].marks['2027-02-03'], ['pickup']);
});

test('skipped months have no meeting and are flagged for greying', () => {
  const months = clubYearPreview({ ...monthly, skipMonths: skipMonths(1, 12) }, 2027);
  assert.equal(months[0].skipped, true);
  assert.equal(months[11].skipped, true);
  assert.deepEqual(datesWith([months[0], months[11]], 'meeting'), []);
  assert.equal(datesWith(months, 'meeting').length, 10);
});

test('every-6-weeks preview starts in February when January is skipped and moves steps that land in a skipped month', () => {
  const every6 = { ...monthly, cadence: 2 as const, skipMonths: skipMonths(3) };
  const meetings = datesWith(clubYearPreview(every6, 2027), 'meeting').sort();
  assert.deepEqual(meetings, ['2027-01-06', '2027-02-17', '2027-04-07', '2027-05-19', '2027-06-30',
    '2027-08-11', '2027-09-22', '2027-11-03', '2027-12-15']);
});

