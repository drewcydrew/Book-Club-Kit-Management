import { lastDayOfMonth, monthsInRange, type MemberScheduleMeeting } from './cycle-overview';

export type MemberCalendarMonth = {
  month: string;
  weeks: (string | null)[][];
  dated: Map<string, MemberScheduleMeeting[]>;
  undated: MemberScheduleMeeting[];
};

export function isPastMemberMeeting(meeting: MemberScheduleMeeting, today: string): boolean {
  return meeting.date ? meeting.date < today : meeting.month < today.slice(0, 7);
}

export function calendarWeeks(month: string): (string | null)[][] {
  const first = new Date(`${month}-01T00:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  const last = Number(lastDayOfMonth(month).slice(-2));
  const cells: (string | null)[] = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= last; day++) cells.push(`${month}-${String(day).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
}

export function memberCalendarMonths(meetings: MemberScheduleMeeting[], today: string, showPast: boolean): MemberCalendarMonth[] {
  const months = new Set<string>();
  const cycles = new Map(meetings.map((meeting) => [meeting.cycle.id, meeting.cycle]));
  for (const cycle of cycles.values()) {
    for (const month of monthsInRange(cycle.startsOn, cycle.endsOn)) months.add(month);
  }
  for (const meeting of meetings) months.add(meeting.date?.slice(0, 7) ?? meeting.month);

  const result = [...months].sort()
    .filter((month) => showPast || month >= today.slice(0, 7))
    .map((month): MemberCalendarMonth => ({ month, weeks: calendarWeeks(month), dated: new Map(), undated: [] }));
  const byMonth = new Map(result.map((entry) => [entry.month, entry]));
  for (const meeting of meetings) {
    if (!showPast && isPastMemberMeeting(meeting, today)) continue;
    const entry = byMonth.get(meeting.date?.slice(0, 7) ?? meeting.month);
    if (!entry) continue;
    if (!meeting.date) {
      entry.undated.push(meeting);
    } else {
      const day = entry.dated.get(meeting.date) ?? [];
      day.push(meeting);
      entry.dated.set(meeting.date, day);
    }
  }
  return result;
}

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function calendarMonthLabel(month: string): string {
  return `${monthNames[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

export function calendarDateLabel(date: string): string {
  return `${monthNames[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}, ${date.slice(0, 4)}`;
}

export type OverviewMarkerKind = 'ready' | 'meeting' | 'due';

export type OverviewMarker = { kind: OverviewMarkerKind; meeting: MemberScheduleMeeting };

export type MemberOverviewMonth = {
  month: string;
  weeks: (string | null)[][];
  meetings: MemberScheduleMeeting[];
  book?: MemberScheduleMeeting;
  markers: Map<string, OverviewMarker[]>;
};

export function memberOverviewMonths(meetings: MemberScheduleMeeting[], today: string, showPast: boolean): MemberOverviewMonth[] {
  const entries = memberCalendarMonths(meetings, today, true);
  const known = new Set(entries.map((entry) => entry.month));
  const markerDates = meetings.flatMap((meeting) => [meeting.assignment?.ready, meeting.assignment?.meeting, meeting.assignment?.due])
    .filter((date): date is string => !!date);
  const extraMonths = [...new Set(markerDates.map((date) => date.slice(0, 7)))].filter((month) => !known.has(month));
  const markersByMonth = new Map<string, Map<string, OverviewMarker[]>>();
  const mark = (meeting: MemberScheduleMeeting, date: string | undefined, kind: OverviewMarkerKind) => {
    if (!date) return;
    const month = date.slice(0, 7);
    const byDate = markersByMonth.get(month) ?? new Map<string, OverviewMarker[]>();
    const list = byDate.get(date) ?? [];
    if (!list.some((marker) => marker.kind === kind && marker.meeting.key === meeting.key)) list.push({ kind, meeting });
    byDate.set(date, list);
    markersByMonth.set(month, byDate);
  };
  for (const meeting of meetings) {
    mark(meeting, meeting.assignment?.ready, 'ready');
    mark(meeting, meeting.assignment?.meeting, 'meeting');
    mark(meeting, meeting.assignment?.due, 'due');
  }
  const allEntries = [...entries, ...extraMonths.map((month): MemberCalendarMonth => ({ month, weeks: calendarWeeks(month), dated: new Map(), undated: [] }))];
  return allEntries.sort((a, b) => a.month.localeCompare(b.month))
    .filter((entry) => showPast || entry.month >= today.slice(0, 7))
    .map((entry): MemberOverviewMonth => {
      const items = [...entry.dated.values()].flat().concat(entry.undated)
        .sort((a, b) => (a.date ?? a.month).localeCompare(b.date ?? b.month) || a.key.localeCompare(b.key));
      return { month: entry.month, weeks: entry.weeks, meetings: items, book: items.find((item) => item.assignment), markers: markersByMonth.get(entry.month) ?? new Map() };
    });
}
