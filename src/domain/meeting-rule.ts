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

export function meetingDate(month: string, club: Pick<Club, 'meetingWeekday' | 'meetingOccurrence'>): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
      !meetingWeekdays.some((item) => item.value === club.meetingWeekday) ||
      !meetingOccurrences.some((item) => item.value === club.meetingOccurrence)) {
    throw new Error('Meeting month or club meeting rule is invalid.');
  }
  const first = `${month}-01`;
  const firstWeekday = new Date(`${first}T00:00:00Z`).getUTCDay();
  const firstMatch = addDays(first, (club.meetingWeekday - firstWeekday + 7) % 7);
  if (club.meetingOccurrence !== -1) return addDays(firstMatch, 7 * (club.meetingOccurrence - 1));
  const fifth = addDays(firstMatch, 28);
  return fifth.startsWith(`${month}-`) ? fifth : addDays(firstMatch, 21);
}

export function preserveUnassignedMeetingDates(cycle: Cycle, before: Assignment[], after: Assignment[]): Cycle {
  const generatedSlots = new Set(after.map((assignment) => assignment.slotId));
  const stagedDates = new Map(before.filter((assignment) => assignment.cycleId === cycle.id && !generatedSlots.has(assignment.slotId))
    .map((assignment) => [assignment.slotId, assignment.meeting]));
  return { ...cycle, slots: cycle.slots.map((slot) =>
    slot.meeting || !stagedDates.has(slot.id) ? slot : { ...slot, meeting: stagedDates.get(slot.id)! }) };
}
