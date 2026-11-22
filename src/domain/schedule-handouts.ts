import type { Cycle, Data } from './model';
import { synopsisPlainText } from './synopsis';

export interface HandoutMeeting {
  date: string;
  title: string;
  author: string;
  synopsis: string;
  titleId: string;
  isbn: string;
  coverUrl: string;
  assigned: boolean;
}

export interface HandoutSnapshot {
  library: string;
  cycle: string;
  status: string;
  unsaved: boolean;
  clubs: { id: string; name: string; meetings: HandoutMeeting[] }[];
}

export function makeHandoutSnapshot(data: Data, cycle: Cycle, clubIds: string[], unsaved: boolean): HandoutSnapshot {
  if (!clubIds.length) throw new Error('Select at least one club in Clubs shown.');
  const selected = new Set(clubIds);
  const clubs = clubIds.map((id) => {
    const club = data.clubs.find((item) => item.id === id);
    if (!club) throw new Error('A selected club is unavailable. Refresh the schedule.');
    return { id, name: club.name, meetings: [] as HandoutMeeting[] };
  });
  const byClub = new Map(clubs.map((club) => [club.id, club]));
  const shownSlots = cycle.slots.filter((slot) => selected.has(slot.clubId));
  const slots = new Map(shownSlots.map((slot) => [slot.id, slot]));
  if (slots.size !== shownSlots.length) throw new Error('Some shown meeting identifiers are duplicated. Refresh or repair the schedule.');
  const assigned = new Map<string, Data['assignments'][number]>();
  for (const assignment of data.assignments.filter((item) => item.cycleId === cycle.id && selected.has(item.clubId))) {
    const slot = slots.get(assignment.slotId);
    if (!slot || slot.clubId !== assignment.clubId || assigned.has(assignment.slotId)) {
      throw new Error(`Schedule assignments for ${byClub.get(assignment.clubId)?.name ?? 'a shown club'} are inconsistent. Refresh or repair the schedule.`);
    }
    assigned.set(assignment.slotId, assignment);
  }
  for (const slot of slots.values()) {
    const assignment = assigned.get(slot.id);
    const kit = assignment ? data.kits.find((item) => item.id === assignment.kitId) : undefined;
    const title = kit ? data.titles.find((item) => item.id === kit.titleId) : undefined;
    if (assignment && (!title || !title.name.trim())) throw new Error(`An assigned title for ${byClub.get(slot.clubId)?.name ?? 'a shown club'} is unavailable. Refresh or repair the schedule.`);
    byClub.get(slot.clubId)!.meetings.push({
      date: assignment?.meeting || slot.meeting || `${slot.month} · Date to be confirmed`,
      title: title?.name ?? 'Title to be confirmed', author: title?.author ?? '',
      synopsis: synopsisPlainText(title?.synopsis), titleId: title?.id ?? '', isbn: title?.isbn ?? '',
      coverUrl: title?.coverUrl ?? '', assigned: !!assignment,
    });
  }
  clubs.forEach((club) => club.meetings.sort((a, b) => a.date.localeCompare(b.date)));
  return { library: data.library.name, cycle: cycle.name, status: cycle.status, unsaved, clubs };
}
