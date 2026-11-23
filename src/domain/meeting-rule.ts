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

export function pickupRuleLabel(club: Pick<Club, 'pickupWeekday' | 'pickupOccurrence'>): string {
  const weekday = meetingWeekdays.find((item) => item.value === club.pickupWeekday);
  const occurrence = meetingOccurrences.find((item) => item.value === club.pickupOccurrence);
  if (!weekday || !occurrence) throw new Error('Club pickup rule is invalid.');
  return `${occurrence.label} week, ${weekday.label}`;
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

// Pickup is always in the month before the meeting, so it can never fall on the meeting day.
export function pickupDate(meeting: string, club: Pick<Club, 'pickupWeekday' | 'pickupOccurrence'>): string {
  if (!validDate(meeting)) throw new Error('Meeting date is invalid.');
  const previous = addDays(`${meeting.slice(0, 7)}-01`, -1).slice(0, 7);
  return nthWeekdayOfMonth(previous, club.pickupWeekday, club.pickupOccurrence);
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
