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
