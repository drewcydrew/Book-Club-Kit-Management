import { overviewClubDetails, overviewPdfMonths, type ClubOverviewPdfClub } from './club-overview-pdf';
import { scheduleMeetings } from './cycle-overview';
import { memberOverviewMonths } from './member-calendar';
import { rankings } from './logic';
import type { Assignment, Cycle, Data } from './model';

export interface HandoutCover {
  id: string;
  coverUrl: string;
  isbn: string;
}

export function makeHandoutClubs(data: Data, cycle: Cycle, clubIds: string[], today: string): { clubs: ClubOverviewPdfClub[]; covers: HandoutCover[] } {
  if (!clubIds.length) throw new Error('Select at least one club in Clubs shown.');
  const titleById = new Map(data.titles.map((title) => [title.id, title] as const));
  const kitById = new Map(data.kits.map((kit) => [kit.id, kit] as const));
  const titleFor = (assignment: Assignment) => titleById.get(kitById.get(assignment.kitId)?.titleId ?? '');
  const assignments = data.assignments.filter((assignment) => assignment.cycleId === cycle.id);
  const clubs = clubIds.map((id) => {
    const club = data.clubs.find((item) => item.id === id);
    if (!club) throw new Error('A selected club is unavailable. Refresh the schedule.');
    const months = memberOverviewMonths(scheduleMeetings([cycle], assignments, [id]), today, true);
    const ranks = new Map((cycle.finalized[id] ?? rankings(data, cycle, id, true)).map((titleId, index) => [titleId, index + 1] as const));
    const priorityFor = (assignment: Assignment) => ranks.get(titleFor(assignment)?.id ?? '') ?? null;
    return { club: club.name, details: overviewClubDetails(club), months: overviewPdfMonths(months, titleFor, priorityFor) };
  });
  const covers = [...new Map(assignments.filter((assignment) => clubIds.includes(assignment.clubId))
    .flatMap((assignment) => {
      const title = titleFor(assignment);
      return title ? [[title.id, { id: title.id, coverUrl: title.coverUrl ?? '', isbn: title.isbn }] as const] : [];
    })).values()];
  return { clubs, covers };
}
