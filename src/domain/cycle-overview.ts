import { assignmentProblem } from './logic';
import type { Assignment, Ballot, Cycle, Data, Membership, Mark, Slot } from './model';

export interface GridCell {
  month: string;
  slot?: Slot;
  assignment?: Assignment;
  problem: string | null;
}

export interface GridRow {
  clubId: string;
  cells: GridCell[];
}

export interface ScheduleGrid {
  months: string[];
  rows: GridRow[];
}

export interface MonthGroup {
  month: string;
  slots: Slot[];
}

export interface MemberVote {
  personId: string;
  voted: boolean;
  ranking: string[];
  selected: string[];
  marks: Record<Mark, number>;
}

export interface TitlePriority {
  titleId: string;
  score: number;
  supporters: number;
  history: boolean;
}

export function groupSlotsByMonth(slots: Slot[], clubId = ''): MonthGroup[] {
  const groups = new Map<string, Slot[]>();
  const visible = [...slots]
    .filter((slot) => !clubId || slot.clubId === clubId)
    .sort((a, b) => a.month.localeCompare(b.month)
      || (a.meeting ?? '9999').localeCompare(b.meeting ?? '9999')
      || a.clubId.localeCompare(b.clubId));
  for (const slot of visible) {
    groups.set(slot.month, [...(groups.get(slot.month) ?? []), slot]);
  }
  return [...groups].map(([month, grouped]) => ({ month, slots: grouped }));
}

export function monthsInRange(startsOn: string, endsOn: string): string[] {
  const months: string[] = [];
  const [startYear, startMonth] = startsOn.slice(0, 7).split('-').map(Number);
  const [endYear, endMonth] = endsOn.slice(0, 7).split('-').map(Number);
  for (let year = startYear, month = startMonth; year < endYear || (year === endYear && month <= endMonth);) {
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const index = year * 12 + (monthNumber - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export function lastDayOfMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const day = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(day).padStart(2, '0')}`;
}

export function memberVotes(memberships: Membership[], ballots: Ballot[], cycleId: string, clubId: string): MemberVote[] {
  return memberships
    .filter((membership) => membership.clubId === clubId)
    .map((membership) => {
      const ballot = ballots.find((item) => item.cycleId === cycleId && item.clubId === clubId && item.personId === membership.personId);
      const marks: Record<Mark, number> = { selected: 0, read: 0, wont: 0 };
      for (const mark of Object.values(ballot?.marks ?? {})) marks[mark] += 1;
      const ranking = ballot?.ranking ?? [];
      const selected = ranking.filter((titleId) => ballot?.marks[titleId] === 'selected');
      return { personId: membership.personId, voted: ranking.length > 0 || Object.keys(ballot?.marks ?? {}).length > 0, ranking, selected, marks };
    });
}

export interface ClubStatus {
  clubId: string;
  hasPreferences: boolean;
  meetingCount: number;
}

export function clubStatuses(data: Data, cycle: Cycle): ClubStatus[] {
  return data.clubs.map((club) => ({
    clubId: club.id,
    hasPreferences: data.ballots.some((ballot) => ballot.cycleId === cycle.id && ballot.clubId === club.id
      && Object.values(ballot.marks).includes('selected')),
    meetingCount: cycle.slots.filter((slot) => slot.clubId === club.id).length,
  }));
}

export function clubPriorities(data: Data, cycle: Cycle, clubId: string): TitlePriority[] {
  const history = data.clubs.find((club) => club.id === clubId)?.history ?? [];
  const scores = new Map<string, { score: number; supporters: number }>();
  data.ballots.filter((ballot) => ballot.cycleId === cycle.id && ballot.clubId === clubId).forEach((ballot) => {
    ballot.ranking
      .filter((titleId) => ballot.marks[titleId] === 'selected' && data.titles.some((title) => title.id === titleId))
      .forEach((titleId, index, list) => {
        const entry = scores.get(titleId) ?? { score: 0, supporters: 0 };
        entry.score += list.length - index;
        entry.supporters += 1;
        scores.set(titleId, entry);
      });
  });
  return [...scores]
    .map(([titleId, entry]) => ({ titleId, ...entry, history: history.includes(titleId) }))
    .sort((a, b) => b.score - a.score || a.titleId.localeCompare(b.titleId));
}

export function scheduleGrid(data: Data, cycle: Cycle, clubIds: string[], assignments: Assignment[]): ScheduleGrid {
  const months = [...new Set([...monthsInRange(cycle.startsOn, cycle.endsOn), ...cycle.slots.map((slot) => slot.month)])].sort();
  const assignmentBySlot = new Map(assignments.filter((assignment) => assignment.cycleId === cycle.id).map((assignment) => [assignment.slotId, assignment] as const));
  const rows = clubIds.map((clubId) => ({
    clubId,
    cells: months.map((month): GridCell => {
      const slot = cycle.slots.find((item) => item.clubId === clubId && item.month === month);
      const assignment = slot ? assignmentBySlot.get(slot.id) : undefined;
      const problem = assignment ? assignmentProblem(data, assignment, data.assignments) : null;
      return { month, slot, assignment, problem };
    }),
  }));
  return { months, rows };
}

