import { assignmentProblem, preferences } from './logic';
import { compareClubs } from './club-list';
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

export function highlightedGrid<Row, Cell>(
  rows: readonly Row[],
  cellsFor: (row: Row) => readonly Cell[],
  matches: (cell: Cell) => boolean,
): { rows: Row[]; stops: { row: number; column: number }[] } {
  const visible = rows.filter((row) => cellsFor(row).some(matches));
  const stops: { row: number; column: number }[] = [];
  const columns = visible.length ? cellsFor(visible[0]).length : 0;
  for (let column = 0; column < columns; column++) {
    visible.forEach((row, index) => {
      const cell = cellsFor(row)[column];
      if (cell !== undefined && matches(cell)) stops.push({ row: index, column });
    });
  }
  return { rows: visible, stops };
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
  const selectedClubs = new Set(clubIds);
  const cycleAssignments = assignments.filter((assignment) => assignment.cycleId === cycle.id && selectedClubs.has(assignment.clubId));
  const kitTitles = new Map<string, string>();
  for (const kit of data.kits) if (!kitTitles.has(kit.id)) kitTitles.set(kit.id, kit.titleId);
  const slots = new Map<string, Slot>();
  for (const slot of cycle.slots) if (!slots.has(slot.id)) slots.set(slot.id, slot);
  const assignmentsByClub = new Map<string, Map<string, Assignment>>();
  for (const assignment of cycleAssignments) {
    const titleId = kitTitles.get(assignment.kitId);
    if (!titleId) continue;
    let byTitle = assignmentsByClub.get(assignment.clubId);
    if (!byTitle) {
      byTitle = new Map();
      assignmentsByClub.set(assignment.clubId, byTitle);
    }
    if (!byTitle.has(titleId)) byTitle.set(titleId, assignment);
  }
  const ranks = new Map<string, Map<string, number>>();
  for (const clubId of clubIds) {
    const selected = preferences(data, cycle, clubId);
    ranks.set(clubId, new Map(selected.map((titleId, index) => [titleId, index + 1] as const)));
  }
  const titleIds = new Set<string>();
  for (const clubRanks of ranks.values()) for (const titleId of clubRanks.keys()) titleIds.add(titleId);
  for (const assignment of cycleAssignments) {
    const titleId = kitTitles.get(assignment.kitId);
    if (titleId) titleIds.add(titleId);
  }
  const rows = [...titleIds].map((titleId): PriorityRow => {
    const cells = clubIds.map((clubId) => {
      const assignment = assignmentsByClub.get(clubId)?.get(titleId);
      const slot = assignment ? slots.get(assignment.slotId) : undefined;
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

function rankOrder(a: number | null, b: number | null, direction: PrioritySort['direction']): number {
  return a === null ? (b === null ? 0 : 1) : b === null ? -1 : direction === 'ascending' ? a - b : b - a;
}

function sortRowsByClubRank(rows: PriorityRow[], clubSort: PrioritySort): PriorityRow[] {
  const ranks = new Map(rows.map((row) => [row, row.cells.find((cell) => cell.clubId === clubSort.id)?.rank ?? null] as const));
  return [...rows].sort((a, b) => rankOrder(ranks.get(a) ?? null, ranks.get(b) ?? null, clubSort.direction));
}

export function sortPriorityMatrix(matrix: PriorityMatrix, clubSort: PrioritySort | null, titleSort: PrioritySort | null): PriorityMatrix {
  const targetRow = matrix.rows.find((row) => row.titleId === titleSort?.id);
  const targetRanks = new Map(targetRow?.cells.map((cell) => [cell.clubId, cell.rank]));
  const clubIds = targetRow && titleSort
    ? [...matrix.clubIds].sort((a, b) => rankOrder(targetRanks.get(a) ?? null, targetRanks.get(b) ?? null, titleSort.direction))
    : matrix.clubIds;
  const rows = clubSort && matrix.clubIds.includes(clubSort.id)
    ? sortRowsByClubRank(matrix.rows, clubSort)
    : matrix.rows;
  const positions = new Map(clubIds.map((id, index) => [id, index]));
  return {
    clubIds,
    rows: rows.map((row) => {
      if (row.cells.every((cell, index) => index === 0 ||
        (positions.get(row.cells[index - 1].clubId) ?? clubIds.length) <= (positions.get(cell.clubId) ?? clubIds.length))) return row;
      return { ...row, cells: [...row.cells].sort((a, b) => (positions.get(a.clubId) ?? clubIds.length) - (positions.get(b.clubId) ?? clubIds.length)) };
    }),
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

// Temporary development rule: members can see drafted schedules as well as published ones.
export function memberVisibleCycle(cycle: Pick<Cycle, 'status'>): boolean {
  return cycle.status === 'drafted' || cycle.status === 'published';
}

export type MemberMeetingMonth = { month: string; days: { day: string; assignments: Assignment[] }[] };

export function memberMeetingCalendar(data: Data, clubIds: string[]): MemberMeetingMonth[] {
  const clubs = new Set(clubIds);
  const visible = new Set(data.cycles.filter(memberVisibleCycle).map((cycle) => cycle.id));
  const byDay = new Map<string, Assignment[]>();
  for (const assignment of data.assignments) {
    if (!clubs.has(assignment.clubId) || !visible.has(assignment.cycleId)) continue;
    const group = byDay.get(assignment.meeting) ?? [];
    group.push(assignment);
    byDay.set(assignment.meeting, group);
  }
  const byMonth = new Map<string, MemberMeetingMonth>();
  for (const day of [...byDay.keys()].sort()) {
    const month = day.slice(0, 7);
    const entry = byMonth.get(month) ?? { month, days: [] };
    const assignments = (byDay.get(day) ?? []).sort((a, b) => a.clubId.localeCompare(b.clubId) || a.cycleId.localeCompare(b.cycleId) || a.id.localeCompare(b.id));
    entry.days.push({ day, assignments });
    byMonth.set(month, entry);
  }
  return [...byMonth.values()];
}

export interface MemberScheduleMeeting {
  key: string;
  cycle: Cycle;
  clubId: string;
  month: string;
  date: string | null;
  assignment?: Assignment;
}

export function memberScheduleMeetings(data: Pick<Data, 'cycles' | 'assignments'>, clubIds: string[]): MemberScheduleMeeting[] {
  return scheduleMeetings(data.cycles.filter(memberVisibleCycle), data.assignments, clubIds);
}

// Unlike memberScheduleMeetings, this does not apply member visibility, so staff can use any cycle.
export function scheduleMeetings(cycles: Cycle[], assignments: Assignment[], clubIds: string[]): MemberScheduleMeeting[] {
  const clubs = new Set(clubIds);
  const cycleById = new Map(cycles.map((cycle) => [cycle.id, cycle]));
  const assignedSlots = new Set<string>();
  const meetings: MemberScheduleMeeting[] = [];
  for (const assignment of assignments) {
    const cycle = cycleById.get(assignment.cycleId);
    if (!cycle || !clubs.has(assignment.clubId)) continue;
    assignedSlots.add(JSON.stringify([assignment.cycleId, assignment.slotId]));
    meetings.push({
      key: `assignment:${assignment.id}`, cycle, clubId: assignment.clubId,
      month: assignment.meeting.slice(0, 7), date: assignment.meeting, assignment,
    });
  }
  for (const cycle of cycles) {
    for (const slot of cycle.slots) {
      if (!clubs.has(slot.clubId) || assignedSlots.has(JSON.stringify([cycle.id, slot.id]))) continue;
      meetings.push({
        key: `slot:${cycle.id}:${slot.id}`, cycle, clubId: slot.clubId,
        month: slot.month, date: slot.meeting,
      });
    }
  }
  return meetings.sort((a, b) => (a.date ?? a.month).localeCompare(b.date ?? b.month)
    || a.clubId.localeCompare(b.clubId) || a.cycle.id.localeCompare(b.cycle.id) || a.key.localeCompare(b.key));
}

export function selectMemberScheduleCycle(cycles: readonly Cycle[], selectedId: string, day: string): Cycle | undefined {
  const selected = cycles.find((cycle) => cycle.id === selectedId);
  if (selected) return selected;
  const current = cycles.filter((cycle) => cycle.startsOn <= day && cycle.endsOn >= day)
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn) || a.endsOn.localeCompare(b.endsOn) || a.id.localeCompare(b.id));
  if (current.length) return current[0];
  const upcoming = cycles.filter((cycle) => cycle.startsOn > day)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.endsOn.localeCompare(b.endsOn) || a.id.localeCompare(b.id));
  if (upcoming.length) return upcoming[0];
  return [...cycles].sort((a, b) => b.endsOn.localeCompare(a.endsOn) || b.startsOn.localeCompare(a.startsOn) || a.id.localeCompare(b.id))[0];
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

// Include newly fixed dates when a staged assignment is no longer present.
export function slotChanges(initial: Slot[], current: Slot[]): { newSlots: { id: string; clubId: string; month: string }[]; removedSlotIds: string[]; datedSlots: { id: string; meeting: string }[] } {
  const initialIds = new Set(initial.map((slot) => slot.id));
  const initialById = new Map(initial.map((slot) => [slot.id, slot]));
  const currentIds = new Set(current.map((slot) => slot.id));
  return {
    newSlots: current.filter((slot) => !initialIds.has(slot.id)).map(({ id, clubId, month }) => ({ id, clubId, month })),
    removedSlotIds: initial.filter((slot) => !currentIds.has(slot.id)).map((slot) => slot.id),
    datedSlots: current.filter((slot) => slot.meeting !== null && !initialById.get(slot.id)?.meeting)
      .map((slot) => ({ id: slot.id, meeting: slot.meeting! })),
  };
}

export function scheduleClubsMatchingTitle(data: Data, cycle: Cycle, clubIds: string[], assignments: Assignment[], titleId: string): string[] {
  if (!data.titles.some((title) => title.id === titleId)) return [];
  const selected = new Set(clubIds);
  const assignmentBySlot = new Map(assignments.filter((assignment) => assignment.cycleId === cycle.id)
    .map((assignment) => [assignment.slotId, assignment] as const));
  const titleByKit = new Map(data.kits.map((kit) => [kit.id, kit.titleId] as const));
  const seen = new Set<string>();
  const matching = new Set<string>();
  for (const slot of cycle.slots) {
    if (!selected.has(slot.clubId)) continue;
    const key = JSON.stringify([slot.clubId, slot.month]);
    if (seen.has(key)) continue;
    seen.add(key);
    const assignment = assignmentBySlot.get(slot.id);
    if (assignment && titleByKit.get(assignment.kitId) === titleId) matching.add(slot.clubId);
  }
  return clubIds.filter((clubId) => matching.has(clubId));
}

export function focusedScheduleClub(clubIds: readonly string[], focusedId: string): string {
  return clubIds.includes(focusedId) ? focusedId : clubIds[0] ?? '';
}

export function scheduleGrid(data: Data, cycle: Cycle, clubIds: string[], assignments: Assignment[]): ScheduleGrid {
  const months = [...new Set([...monthsInRange(cycle.startsOn, cycle.endsOn), ...cycle.slots.map((slot) => slot.month)])].sort();
  const cycleAssignments = assignments.filter((assignment) => assignment.cycleId === cycle.id);
  const assignmentBySlot = new Map(cycleAssignments.map((assignment) => [assignment.slotId, assignment] as const));
  const allAssignments = [...data.assignments.filter((assignment) => assignment.cycleId !== cycle.id), ...cycleAssignments];
  const clubById = new Map(data.clubs.map((club) => [club.id, club] as const));
  const orderedClubIds = [...clubIds].sort((a, b) => {
    const left = clubById.get(a);
    const right = clubById.get(b);
    if (!left || !right) return Number(!left) - Number(!right);
    return compareClubs(left, right);
  });
  const rows = orderedClubIds.map((clubId) => ({
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

