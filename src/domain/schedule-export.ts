import { memberScheduleMeetings, type MemberScheduleMeeting } from './cycle-overview';
import type { Cycle, Data } from './model';

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
}

export function makeScheduleExport(data: Data, clubIds: string[], staffCycle?: Cycle, unsaved = false): ScheduleExport {
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
  return {
    library: data.library.name,
    label: staffCycle ? `${staffCycle.name} · ${staffCycle.status}${unsaved ? ' · Unsaved local schedule' : ''}` : 'Your schedule · Drafted and published cycles',
    meetings: rows,
  };
}

function csvCell(value: string | number | boolean | null): string {
  let text = value === null ? '' : String(value);
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function scheduleCsv(schedule: ScheduleExport): string {
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
