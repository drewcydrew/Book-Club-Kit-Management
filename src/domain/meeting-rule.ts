import { addDays } from './dates';
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
  return `${occurrence.label} ${weekday.label}`;
}

export function pickupRuleLabel(club: Pick<Club, 'pickupWeekday' | 'pickupOccurrence'>): string {
  const weekday = meetingWeekdays.find((item) => item.value === club.pickupWeekday);
  const occurrence = meetingOccurrences.find((item) => item.value === club.pickupOccurrence);
  if (!weekday || !occurrence) throw new Error('Club pickup rule is invalid.');
  return `${occurrence.label} ${weekday.label}`;
}

function nthWeekdayOfMonth(month: string, weekday: MeetingWeekday, occurrence: MeetingOccurrence): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
      !meetingWeekdays.some((item) => item.value === weekday) ||
      !meetingOccurrences.some((item) => item.value === occurrence)) {
    throw new Error('Month or weekday rule is invalid.');
  }
  const first = `${month}-01`;
  const firstWeekday = new Date(`${first}T00:00:00Z`).getUTCDay();
  const firstMatch = addDays(first, (weekday - firstWeekday + 7) % 7);
  if (occurrence !== -1) return addDays(firstMatch, 7 * (occurrence - 1));
  const fifth = addDays(firstMatch, 28);
  return fifth.startsWith(`${month}-`) ? fifth : addDays(firstMatch, 21);
}

export function meetingDate(month: string, club: Pick<Club, 'meetingWeekday' | 'meetingOccurrence'>): string {
  return nthWeekdayOfMonth(month, club.meetingWeekday, club.meetingOccurrence);
}

// Pickup falls in the meeting's month; if that lands after the meeting, the previous month's rule date is used.
export function pickupDate(meeting: string, club: Pick<Club, 'pickupWeekday' | 'pickupOccurrence'>): string {
  const month = meeting.slice(0, 7);
  const sameMonth = nthWeekdayOfMonth(month, club.pickupWeekday, club.pickupOccurrence);
  if (sameMonth <= meeting) return sameMonth;
  const previous = addDays(`${month}-01`, -1).slice(0, 7);
  return nthWeekdayOfMonth(previous, club.pickupWeekday, club.pickupOccurrence);
}

export function preserveUnassignedMeetingDates(cycle: Cycle, before: Assignment[], after: Assignment[]): Cycle {
  const generatedSlots = new Set(after.map((assignment) => assignment.slotId));
  const stagedDates = new Map(before.filter((assignment) => assignment.cycleId === cycle.id && !generatedSlots.has(assignment.slotId))
    .map((assignment) => [assignment.slotId, assignment.meeting]));
  return { ...cycle, slots: cycle.slots.map((slot) =>
    slot.meeting || !stagedDates.has(slot.id) ? slot : { ...slot, meeting: stagedDates.get(slot.id)! }) };
}
