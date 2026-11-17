import { assignmentProblem, preferences } from './logic';
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

export interface PriorityCell {
  clubId: string;
  rank: number | null;
  month: string | null;
  assignment?: Assignment;
}

export interface PriorityRow {
  titleId: string;
  rankedClubCount: number;
  contested: boolean;
  cells: PriorityCell[];
}

export interface PriorityMatrix {
  clubIds: string[];
  rows: PriorityRow[];
}

export function priorityMatrix(data: Data, cycle: Cycle, clubIds: string[], assignments: Assignment[]): PriorityMatrix {
  const cycleAssignments = assignments.filter((assignment) => assignment.cycleId === cycle.id && clubIds.includes(assignment.clubId));
  const ranks = new Map<string, Map<string, number>>();
  for (const clubId of clubIds) {
    const selected = preferences(data, cycle, clubId);
    ranks.set(clubId, new Map(selected.map((titleId, index) => [titleId, index + 1] as const)));
  }
  const titleIds = new Set<string>();
  for (const clubRanks of ranks.values()) for (const titleId of clubRanks.keys()) titleIds.add(titleId);
  for (const assignment of cycleAssignments) {
    const titleId = data.kits.find((kit) => kit.id === assignment.kitId)?.titleId;
    if (titleId) titleIds.add(titleId);
  }
  const rows = [...titleIds].map((titleId): PriorityRow => {
    const cells = clubIds.map((clubId) => {
      const assignment = cycleAssignments.find((item) => item.clubId === clubId && data.kits.find((kit) => kit.id === item.kitId)?.titleId === titleId);
      const slot = assignment ? cycle.slots.find((item) => item.id === assignment.slotId) : undefined;
      return { clubId, rank: ranks.get(clubId)?.get(titleId) ?? null, month: slot?.month ?? null, assignment };
    });
    const rankedClubCount = cells.filter((cell) => cell.rank !== null).length;
    return { titleId, rankedClubCount, contested: rankedClubCount > 1, cells };
  });
  rows.sort((a, b) => b.rankedClubCount - a.rankedClubCount
    || a.titleId.localeCompare(b.titleId));
  return { clubIds, rows };
}

export type PrioritySort = { id: string; direction: 'ascending' | 'descending' };

export function sortPriorityMatrix(matrix: PriorityMatrix, clubSort: PrioritySort | null, titleSort: PrioritySort | null): PriorityMatrix {
  const rankOrder = (a: number | null, b: number | null, direction: PrioritySort['direction']) =>
    a === null ? (b === null ? 0 : 1) : b === null ? -1 : direction === 'ascending' ? a - b : b - a;
  const targetRow = matrix.rows.find((row) => row.titleId === titleSort?.id);
  const targetRanks = new Map(targetRow?.cells.map((cell) => [cell.clubId, cell.rank]));
  const clubIds = targetRow && titleSort
    ? [...matrix.clubIds].sort((a, b) => rankOrder(targetRanks.get(a) ?? null, targetRanks.get(b) ?? null, titleSort.direction))
    : matrix.clubIds;
  const rows = clubSort && matrix.clubIds.includes(clubSort.id)
    ? [...matrix.rows].sort((a, b) => rankOrder(
      a.cells.find((cell) => cell.clubId === clubSort.id)?.rank ?? null,
      b.cells.find((cell) => cell.clubId === clubSort.id)?.rank ?? null,
      clubSort.direction,
    ))
    : matrix.rows;
  const positions = new Map(clubIds.map((id, index) => [id, index]));
  return {
    clubIds,
    rows: rows.map((row) => ({
      ...row,
      cells: [...row.cells].sort((a, b) => (positions.get(a.clubId) ?? clubIds.length) - (positions.get(b.clubId) ?? clubIds.length)),
    })),
  };
}

export function titleDemand(data: Data, cycleId: string, clubIds: string[]): Map<string, number> {
  const selectedClubs = new Set(clubIds);
  const clubsByTitle = new Map<string, Set<string>>();
  for (const ballot of data.ballots) {
    if (ballot.cycleId !== cycleId || !selectedClubs.has(ballot.clubId)) continue;
    for (const [titleId, mark] of Object.entries(ballot.marks)) {
      if (mark !== 'selected') continue;
      const clubs = clubsByTitle.get(titleId) ?? new Set<string>();
      clubs.add(ballot.clubId);
      clubsByTitle.set(titleId, clubs);
    }
  }
  return new Map([...clubsByTitle].map(([titleId, clubs]) => [titleId, clubs.size]));
}

export function memberSchedule(data: Data, clubIds: string[], day: string, period: 'upcoming' | 'past'): Assignment[] {
  const clubs = new Set(clubIds);
  const published = new Set(data.cycles.filter((cycle) => cycle.status === 'published').map((cycle) => cycle.id));
  return data.assignments
    .filter((assignment) => clubs.has(assignment.clubId) && published.has(assignment.cycleId)
      && (period === 'upcoming' ? assignment.meeting >= day : assignment.meeting < day))
    .sort((a, b) => (period === 'upcoming' ? a.meeting.localeCompare(b.meeting) : b.meeting.localeCompare(a.meeting))
      || a.clubId.localeCompare(b.clubId) || a.cycleId.localeCompare(b.cycleId) || a.id.localeCompare(b.id));
}

export function scheduleByKit(data: Data, cycleId: string, clubIds: string[]): { kitId: string; assignments: Assignment[] }[] {
  const clubs = new Set(clubIds);
  const groups = new Map<string, Assignment[]>();
  for (const assignment of data.assignments) {
    if (assignment.cycleId !== cycleId || !clubs.has(assignment.clubId)) continue;
    const group = groups.get(assignment.kitId) ?? [];
    group.push(assignment);
    groups.set(assignment.kitId, group);
  }
  const kits = new Map(data.kits.map((kit) => [kit.id, kit]));
  const titles = new Map(data.titles.map((title) => [title.id, title]));
  return [...groups].map(([kitId, assignments]) => ({
    kitId,
    assignments: assignments.sort((a, b) => a.meeting.localeCompare(b.meeting) || a.clubId.localeCompare(b.clubId) || a.id.localeCompare(b.id)),
  })).sort((a, b) => {
    const kitA = kits.get(a.kitId);
    const kitB = kits.get(b.kitId);
    return (titles.get(kitA?.titleId ?? '')?.name ?? 'Unavailable title').localeCompare(titles.get(kitB?.titleId ?? '')?.name ?? 'Unavailable title')
      || (kitA?.barcode ?? '').localeCompare(kitB?.barcode ?? '') || a.kitId.localeCompare(b.kitId);
  });
}

export function scheduleHasChanges(initial: Assignment[], current: Assignment[], unlockIds: string[]): boolean {
  const snapshot = (assignments: Assignment[]) => JSON.stringify([...assignments].sort((a, b) => a.id.localeCompare(b.id)).map((a) =>
    [a.id, a.cycleId, a.slotId, a.clubId, a.kitId, a.ready, a.meeting, a.due, a.locked]));
  return unlockIds.length > 0 || snapshot(initial) !== snapshot(current);
}

export function scheduleGrid(data: Data, cycle: Cycle, clubIds: string[], assignments: Assignment[]): ScheduleGrid {
  const months = [...new Set([...monthsInRange(cycle.startsOn, cycle.endsOn), ...cycle.slots.map((slot) => slot.month)])].sort();
  const cycleAssignments = assignments.filter((assignment) => assignment.cycleId === cycle.id);
  const assignmentBySlot = new Map(cycleAssignments.map((assignment) => [assignment.slotId, assignment] as const));
  const allAssignments = [...data.assignments.filter((assignment) => assignment.cycleId !== cycle.id), ...cycleAssignments];
  const rows = clubIds.map((clubId) => ({
    clubId,
    cells: months.map((month): GridCell => {
      const slot = cycle.slots.find((item) => item.clubId === clubId && item.month === month);
      const assignment = slot ? assignmentBySlot.get(slot.id) : undefined;
      const problem = assignment ? assignmentProblem(data, assignment, allAssignments) : null;
      return { month, slot, assignment, problem };
    }),
  }));
  return { months, rows };
}

