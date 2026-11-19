import { memberScheduleMeetings, scheduleByKit, scheduleGrid, type MemberScheduleMeeting } from './cycle-overview';
import type { Cycle, Data } from './model';

export type StaffScheduleView = 'grid' | 'meetings' | 'kits';

export interface ExportMeeting {
  cycleId: string;
  cycleName: string;
  cycleStatus: string;
  clubId: string;
  clubName: string;
  slotId: string;
  assignmentId: string;
  month: string;
  meeting: string;
  ready: string;
  due: string;
  titleId: string;
  title: string;
  author: string;
  isbn: string;
  coverUrl: string;
  kitId: string;
  barcode: string;
  branch: string;
  copies: number | null;
  locked: boolean | null;
}

export interface ScheduleExport {
  library: string;
  label: string;
  meetings: ExportMeeting[];
  mode?: StaffScheduleView;
  grid?: { cycleId: string; cycleName: string; cycleStatus: string; months: string[]; rows: { clubId: string; clubName: string; cells: (ExportMeeting | null)[] }[] };
}

export function makeScheduleExport(data: Data, clubIds: string[], staffCycle?: Cycle, unsaved = false, mode?: StaffScheduleView): ScheduleExport {
  const clubs = new Set(clubIds);
  let meetings: MemberScheduleMeeting[];
  if (staffCycle) {
    const assignments = data.assignments.filter((item) => item.cycleId === staffCycle.id && clubs.has(item.clubId));
    const assigned = new Set(assignments.map((item) => item.slotId));
    meetings = assignments.map((assignment) => ({
      key: `assignment:${assignment.id}`, cycle: staffCycle, clubId: assignment.clubId,
      month: assignment.meeting.slice(0, 7), date: assignment.meeting, assignment,
    }));
    for (const slot of staffCycle.slots) {
      if (clubs.has(slot.clubId) && !assigned.has(slot.id)) {
        meetings.push({ key: `slot:${staffCycle.id}:${slot.id}`, cycle: staffCycle, clubId: slot.clubId, month: slot.month, date: slot.meeting });
      }
    }
  } else {
    meetings = memberScheduleMeetings(data, clubIds);
  }
  const clubsById = new Map(data.clubs.map((club) => [club.id, club]));
  const kitsById = new Map(data.kits.map((kit) => [kit.id, kit]));
  const titlesById = new Map(data.titles.map((title) => [title.id, title]));
  const rows = meetings.map((item): ExportMeeting => {
    const assignment = item.assignment;
    const kit = assignment ? kitsById.get(assignment.kitId) : undefined;
    const title = kit ? titlesById.get(kit.titleId) : undefined;
    const slotId = assignment?.slotId ?? item.key.slice(`slot:${item.cycle.id}:`.length);
    return {
      cycleId: item.cycle.id, cycleName: item.cycle.name, cycleStatus: item.cycle.status,
      clubId: item.clubId, clubName: clubsById.get(item.clubId)?.name ?? 'Unavailable club',
      slotId, assignmentId: assignment?.id ?? '', month: item.month, meeting: item.date ?? '',
      ready: assignment?.ready ?? '', due: assignment?.due ?? '',
      titleId: kit?.titleId ?? '', title: title?.name ?? '', author: title?.author ?? '',
      isbn: title?.isbn ?? '', coverUrl: title?.coverUrl ?? '',
      kitId: assignment?.kitId ?? '', barcode: kit?.barcode ?? '', branch: kit?.branch ?? '',
      copies: kit?.copies ?? null, locked: assignment?.locked ?? null,
    };
  });
  rows.sort((a, b) => a.clubName.localeCompare(b.clubName) || a.clubId.localeCompare(b.clubId)
    || (a.meeting || a.month).localeCompare(b.meeting || b.month)
    || a.cycleId.localeCompare(b.cycleId) || a.slotId.localeCompare(b.slotId));
  let grid: ScheduleExport['grid'];
  if (staffCycle && mode === 'grid') {
    const source = scheduleGrid(data, staffCycle, clubIds, data.assignments);
    const bySlot = new Map(rows.map((row) => [row.slotId, row]));
    grid = {
      cycleId: staffCycle.id, cycleName: staffCycle.name, cycleStatus: staffCycle.status,
      months: source.months,
      rows: source.rows.map((row) => ({
        clubId: row.clubId, clubName: clubsById.get(row.clubId)?.name ?? 'Unavailable club',
        cells: row.cells.map((cell) => cell.slot ? bySlot.get(cell.slot.id) ?? null : null),
      })),
    };
  }
  if (staffCycle && mode === 'kits') {
    const byAssignment = new Map(rows.filter((row) => row.assignmentId).map((row) => [row.assignmentId, row]));
    rows.length = 0;
    for (const group of scheduleByKit(data, staffCycle.id, clubIds)) {
      for (const assignment of group.assignments) {
        const row = byAssignment.get(assignment.id);
        if (row) rows.push(row);
      }
    }
  }
  return {
    library: data.library.name,
    label: staffCycle ? `${staffCycle.name} · ${staffCycle.status}${unsaved ? ' · Unsaved local schedule' : ''}` : 'Your schedule · Drafted and published cycles',
    meetings: rows, mode: staffCycle ? mode : undefined, grid,
  };
}

function csvCell(value: string | number | boolean | null): string {
  let text = value === null ? '' : String(value);
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function scheduleCsv(schedule: ScheduleExport): string {
  if (schedule.mode === 'grid' && schedule.grid) {
    const grid = schedule.grid;
    const fields = ['Status', 'Slot ID', 'Assignment ID', 'Meeting date', 'Ready date', 'Due date', 'Title ID',
      'Title', 'Author', 'ISBN', 'Cover URL', 'Kit ID', 'Kit barcode', 'Kit branch', 'Copies', 'Locked'];
    const headers = ['Export scope', 'Cycle ID', 'Cycle', 'Cycle status', 'Club ID', 'Club', ...grid.months.flatMap((month) => fields.map((field) => `${month} ${field}`))];
    const lines = grid.rows.map((row) => [
      schedule.label, grid.cycleId, grid.cycleName, grid.cycleStatus, row.clubId, row.clubName, ...row.cells.flatMap((cell) => cell
        ? [cell.assignmentId ? 'Assigned' : 'Unassigned', cell.slotId, cell.assignmentId, cell.meeting, cell.ready, cell.due,
          cell.titleId, cell.title, cell.author, cell.isbn, cell.coverUrl, cell.kitId, cell.barcode, cell.branch, cell.copies, cell.locked]
        : ['No meeting', ...Array.from({ length: fields.length - 1 }, () => '')]),
    ].map(csvCell).join(','));
    return `\uFEFF${[headers.map(csvCell).join(','), ...lines].join('\r\n')}\r\n`;
  }
  if (schedule.mode === 'kits') {
    const headers = ['Export scope', 'Cycle ID', 'Cycle', 'Cycle status', 'Kit ID', 'Kit barcode', 'Kit branch', 'Copies',
      'Title ID', 'Title', 'Author', 'ISBN', 'Cover URL', 'Club ID', 'Club', 'Slot ID', 'Assignment ID', 'Month',
      'Meeting date', 'Ready date', 'Due date', 'Locked'];
    const lines = schedule.meetings.map((row) => [
      schedule.label, row.cycleId, row.cycleName, row.cycleStatus, row.kitId, row.barcode, row.branch, row.copies,
      row.titleId, row.title, row.author, row.isbn, row.coverUrl, row.clubId, row.clubName, row.slotId, row.assignmentId,
      row.month, row.meeting, row.ready, row.due, row.locked,
    ].map(csvCell).join(','));
    return `\uFEFF${[headers.map(csvCell).join(','), ...lines].join('\r\n')}\r\n`;
  }
  const headers = ['Export scope', 'Cycle ID', 'Cycle', 'Cycle status', 'Club ID', 'Club', 'Slot ID', 'Assignment ID',
    'Assignment status', 'Month', 'Meeting date', 'Ready date', 'Due date', 'Title ID', 'Title',
    'Author', 'ISBN', 'Cover URL', 'Kit ID', 'Kit barcode', 'Kit branch', 'Copies', 'Locked'];
  const lines = schedule.meetings.map((row) => [
    schedule.label, row.cycleId, row.cycleName, row.cycleStatus, row.clubId, row.clubName, row.slotId, row.assignmentId,
    row.assignmentId ? 'Assigned' : 'Unassigned', row.month, row.meeting, row.ready, row.due, row.titleId,
    row.title, row.author, row.isbn, row.coverUrl, row.kitId, row.barcode, row.branch, row.copies, row.locked,
  ].map(csvCell).join(','));
  return `\uFEFF${[headers.map(csvCell).join(','), ...lines].join('\r\n')}\r\n`;
}
