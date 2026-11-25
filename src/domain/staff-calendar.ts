import { monthsInRange } from './cycle-overview';
import { calendarWeeks, type OverviewMarkerKind } from './member-calendar';
import type { Assignment, Cycle } from './model';

export type StaffCalendarMeeting = {
  slotId: string;
  clubId: string;
  date: string | null;
  month: string;
  assignment?: Assignment;
};

export type StaffCalendarMarker = { kind: OverviewMarkerKind; meeting: StaffCalendarMeeting };

export type StaffCalendarMonth = {
  month: string;
  weeks: (string | null)[][];
  markers: Map<string, StaffCalendarMarker[]>;
  undated: StaffCalendarMeeting[];
};

export function staffCalendarMonths(cycle: Cycle, assignments: Assignment[], clubIds: string[],
  kinds: readonly OverviewMarkerKind[] = ['meeting', 'ready', 'due']): StaffCalendarMonth[] {
  const shown = new Set(kinds);
  const clubs = new Set(clubIds);
  const assignmentBySlot = new Map(assignments.filter((assignment) => assignment.cycleId === cycle.id)
    .map((assignment) => [assignment.slotId, assignment] as const));
  const meetings: StaffCalendarMeeting[] = cycle.slots.filter((slot) => clubs.has(slot.clubId)).map((slot) => {
    const assignment = assignmentBySlot.get(slot.id);
    return { slotId: slot.id, clubId: slot.clubId, date: assignment?.meeting ?? slot.meeting, month: slot.month, assignment };
  });

  const months = new Set(monthsInRange(cycle.startsOn, cycle.endsOn));
  for (const meeting of meetings) {
    months.add(meeting.date?.slice(0, 7) ?? meeting.month);
    for (const date of [meeting.assignment?.ready, meeting.assignment?.due]) if (date) months.add(date.slice(0, 7));
  }
  const entries = new Map<string, StaffCalendarMonth>([...months].sort()
    .map((month) => [month, { month, weeks: calendarWeeks(month), markers: new Map(), undated: [] }] as const));

  const mark = (meeting: StaffCalendarMeeting, date: string | undefined, kind: OverviewMarkerKind) => {
    if (!date || !shown.has(kind)) return;
    const entry = entries.get(date.slice(0, 7));
    if (!entry) return;
    const day = entry.markers.get(date) ?? [];
    day.push({ kind, meeting });
    entry.markers.set(date, day);
  };
  for (const meeting of meetings) {
    if (!meeting.date) {
      entries.get(meeting.month)?.undated.push(meeting);
      continue;
    }
    mark(meeting, meeting.date, 'meeting');
    mark(meeting, meeting.assignment?.ready, 'ready');
    mark(meeting, meeting.assignment?.due, 'due');
  }
  return [...entries.values()];
}
