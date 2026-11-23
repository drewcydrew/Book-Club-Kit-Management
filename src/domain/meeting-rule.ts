import { addDays, validDate } from './dates';
import type { Assignment, Club, Cycle, MeetingOccurrence, MeetingWeekday } from './model';

export const meetingWeekdays: { value: MeetingWeekday; label: string }[] = [
  { value: 1, label: 'Monday' }, { value: 2, label: 'Tuesday' }, { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' }, { value: 5, label: 'Friday' }, { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];
export const meetingOccurrences: { value: MeetingOccurrence; label: string }[] = [
  { value: 1, label: '1st' }, { value: 2, label: '2nd' }, { value: 3, label: '3rd' },
  { value: 4, label: '4th' }, { value: -1, label: 'Last' },
];

export function meetingRuleLabel(club: Pick<Club, 'meetingWeekday' | 'meetingOccurrence'>): string {
  const weekday = meetingWeekdays.find((item) => item.value === club.meetingWeekday);
  const occurrence = meetingOccurrences.find((item) => item.value === club.meetingOccurrence);
  if (!weekday || !occurrence) throw new Error('Club meeting rule is invalid.');
  return `${occurrence.label} week, ${weekday.label}`;
}

export const maxPickupOffsetDays = 7;

export function pickupOffsetLabel(days: number): string {
  if (!isPickupOffset(days)) throw new Error('Club pickup offset is invalid.');
  if (days === 0) return 'Same week as previous meeting';
  const count = Math.abs(days);
  return `${count} day${count === 1 ? '' : 's'} ${days > 0 ? 'after' : 'before'} previous meeting`;
}

export function isPickupOffset(days: unknown): days is number {
  return Number.isInteger(days) && Math.abs(days as number) <= maxPickupOffsetDays;
}
// Days back to the Monday of the Monday-first week containing the date.
function mondayOffset(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

// Week n is the nth Monday-first week, where week 1 contains the 1st. The weekday is chosen within that week.
// A date outside the month is moved one week inward so it keeps the requested weekday.
function nthWeekdayOfMonth(month: string, weekday: MeetingWeekday, occurrence: MeetingOccurrence): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
      !meetingWeekdays.some((item) => item.value === weekday) ||
      !meetingOccurrences.some((item) => item.value === occurrence)) {
    throw new Error('Month or weekday rule is invalid.');
  }
  const [year, monthNumber] = month.split('-').map(Number);
  const first = `${month}-01`;
  const last = addDays(first, new Date(Date.UTC(year, monthNumber, 0)).getUTCDate() - 1);
  const weekStart = occurrence === -1
    ? addDays(last, -mondayOffset(last))
    : addDays(first, -mondayOffset(first) + 7 * (occurrence - 1));
  const dayInWeek = (weekday + 6) % 7;
  const date = addDays(weekStart, dayInWeek);
  if (date < first) return addDays(date, 7);
  return date > last ? addDays(date, -7) : date;
}

export function meetingDate(month: string, club: Pick<Club, 'meetingWeekday' | 'meetingOccurrence'>): string {
  return nthWeekdayOfMonth(month, club.meetingWeekday, club.meetingOccurrence);
}

export function previousMonth(month: string): string {
  return addDays(`${month}-01`, -1).slice(0, 7);
}

// Pickup always falls within maxPickupOffsetDays of the previous meeting in the cycle. A cycle's first meeting has no
// previous meeting, so its pickup uses the meeting's own rule applied to the month before. Either way, pickup
// never shares a day with its meeting.
export function pickupDate(meeting: string, club: Pick<Club, 'meetingWeekday' | 'meetingOccurrence' | 'pickupOffsetDays'>, previousMeeting?: string): string {
  if (!validDate(meeting)) throw new Error('Meeting date is invalid.');
  if (!isPickupOffset(club.pickupOffsetDays)) throw new Error('Club pickup offset is invalid.');
  if (previousMeeting) {
    if (!validDate(previousMeeting)) throw new Error('Previous meeting date is invalid.');
    return addDays(previousMeeting, club.pickupOffsetDays);
  }
  return meetingDate(previousMonth(meeting.slice(0, 7)), club);
}

export const returnDaysAfterMeeting = 7;

export function returnDate(meeting: string): string {
  return addDays(meeting, returnDaysAfterMeeting);
}

export function preserveUnassignedMeetingDates(cycle: Cycle, before: Assignment[], after: Assignment[]): Cycle {
  const generatedSlots = new Set(after.map((assignment) => assignment.slotId));
  const stagedDates = new Map(before.filter((assignment) => assignment.cycleId === cycle.id && !generatedSlots.has(assignment.slotId))
    .map((assignment) => [assignment.slotId, assignment.meeting]));
  return { ...cycle, slots: cycle.slots.map((slot) =>
    slot.meeting || !stagedDates.has(slot.id) ? slot : { ...slot, meeting: stagedDates.get(slot.id)! }) };
}
