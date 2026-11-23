import { validDate } from './dates';
import { assignmentProblems, loanOverrun, previousMeetingFor, rankings, windowFor } from './logic';
import type { Assignment, Cycle, Data, Kit, Slot, Title } from './model';

export type ScheduleTitleGroup = {
  titleId: string;
  title: Title | undefined;
  rank: number | null;
  alreadyAssigned: boolean;
  kits: Kit[];
};

export type KitPreview = { state: 'clear' | 'warning' | 'unknown'; messages: string[] };

export function scheduleTitleGroups(data: Data, cycle: Cycle, slot: Slot, assignments: Assignment[]): ScheduleTitleGroup[] {
  const priority = cycle.finalized[slot.clubId] ?? rankings(data, cycle, slot.clubId, true);
  const ranks = new Map(priority.map((titleId, index) => [titleId, index + 1]));
  const titles = new Map(data.titles.map((title) => [title.id, title]));
  const kits = new Map(data.kits.map((kit) => [kit.id, kit]));
  const assignedTitles = new Set(assignments.filter((a) => a.cycleId === cycle.id && a.clubId === slot.clubId && a.slotId !== slot.id)
    .map((a) => kits.get(a.kitId)?.titleId).filter((titleId): titleId is string => !!titleId));
  const grouped = new Map<string, Kit[]>();
  for (const kit of data.kits) {
    const group = grouped.get(kit.titleId) ?? [];
    group.push(kit);
    grouped.set(kit.titleId, group);
  }
  for (const titleId of priority) if (!grouped.has(titleId)) grouped.set(titleId, []);
  const section = (group: ScheduleTitleGroup) => group.rank === null ? 2 : group.alreadyAssigned ? 1 : 0;
  return [...grouped].map(([titleId, group]): ScheduleTitleGroup => ({
    titleId, title: titles.get(titleId), rank: ranks.get(titleId) ?? null, alreadyAssigned: assignedTitles.has(titleId),
    kits: group.sort((a, b) => a.barcode.localeCompare(b.barcode) || a.branch.localeCompare(b.branch) || a.id.localeCompare(b.id)),
  })).sort((a, b) => section(a) - section(b) || (a.rank ?? 0) - (b.rank ?? 0)
    || (a.title?.name ?? '').localeCompare(b.title?.name ?? '') || a.titleId.localeCompare(b.titleId));
}

export function filterScheduleTitleGroups(groups: ScheduleTitleGroup[], query: string): ScheduleTitleGroup[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return groups.filter((group) => {
    const text = [group.title?.name, group.title?.author, group.title?.isbn, group.titleId,
      ...group.kits.flatMap((kit) => [kit.barcode, kit.branch])].join(' ').toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

export function previewScheduleKit(data: Data, cycle: Cycle, slot: Slot, meeting: string, selected: Assignment | undefined,
  kit: Kit, assignments: Assignment[], stale: boolean, kitsById: ReadonlyMap<string, Kit>, titlesById: ReadonlyMap<string, Title>): KitPreview {
  if (stale) return { state: 'unknown', messages: ['Shared data changed; refresh and restart before relying on this preview.'] };
  if (!validDate(meeting) || !validDate(cycle.deadline) || !meeting.startsWith(`${slot.month}-`) || meeting <= cycle.deadline || (slot.meeting && meeting !== slot.meeting)) {
    return { state: 'unknown', messages: ['Enter a valid meeting date for this slot before checking conflicts.'] };
  }
  if (!Number.isFinite(data.library.loanDays) || !Number.isFinite(data.library.bufferDays)) {
    return { state: 'unknown', messages: ['Loan settings are unavailable.'] };
  }
  if (!data.cycles.some((item) => item.id === cycle.id && item.slots.some((value) => value.id === slot.id && value.clubId === slot.clubId)) ||
      !data.clubs.some((club) => club.id === slot.clubId) || !kitsById.has(kit.id) || !titlesById.has(kit.titleId)) {
    return { state: 'unknown', messages: ['A meeting, club, kit or title is unavailable.'] };
  }
  const others = assignments.filter((a) => a.cycleId !== cycle.id || a.slotId !== slot.id);
  if ((selected && selected.meeting === meeting && (!validDate(selected.ready) || !validDate(selected.due) ||
      selected.ready > meeting || selected.due < meeting)) ||
      others.some((a) => {
        const otherKit = kitsById.get(a.kitId);
        const otherCycle = data.cycles.find((item) => item.id === a.cycleId);
        const otherSlot = otherCycle?.slots.find((item) => item.id === a.slotId && item.clubId === a.clubId);
        return (a.kitId === kit.id && (!validDate(a.ready) || !validDate(a.meeting) || !validDate(a.due) ||
          a.ready > a.meeting || a.meeting > a.due || !otherSlot ||
          (otherSlot.meeting ? otherSlot.meeting !== a.meeting : !a.meeting.startsWith(`${otherSlot.month}-`)) ||
          !data.clubs.some((club) => club.id === a.clubId))) ||
          (a.cycleId === cycle.id && a.clubId === slot.clubId && (!otherKit || !titlesById.has(otherKit.titleId)));
      })) {
    return { state: 'unknown', messages: ['A related assignment has invalid dates or unavailable references.'] };
  }
  let previewId = selected?.id ?? `preview:${cycle.id}:${slot.id}`;
  if (selected && others.some((a) => a.id === previewId)) return { state: 'unknown', messages: ['Assignment identifiers conflict. Refresh the schedule.'] };
  while (others.some((a) => a.id === previewId)) previewId += ':';
  const club = data.clubs.find((item) => item.id === slot.clubId);
  if (!club) return { state: 'unknown', messages: ['A meeting, club, kit or title is unavailable.'] };
  const previousMeeting = previousMeetingFor(cycle, slot, club, (slotId) => others.find((a) => a.slotId === slotId && a.cycleId === cycle.id)?.meeting);
  const fresh = windowFor(data, club, meeting, previousMeeting);
  const candidate: Assignment = { id: previewId, cycleId: cycle.id, slotId: slot.id, clubId: slot.clubId,
    kitId: kit.id, ...fresh, locked: false };
  if (selected && selected.meeting === meeting) { candidate.ready = selected.ready; candidate.due = selected.due; }
  const messages = assignmentProblems(data, candidate, [...others, candidate], kitsById);
  const overrun = loanOverrun(data, candidate);
  if (overrun) messages.push(overrun);
  if (!(selected && selected.meeting === meeting) && fresh.ready <= cycle.deadline) {
    messages.unshift(`The pickup date ${fresh.ready} must be after the preference deadline.`);
  }
  return { state: messages.length ? 'warning' : 'clear', messages };
}
