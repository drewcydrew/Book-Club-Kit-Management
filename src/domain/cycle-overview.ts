import type { Ballot, Cycle, Data, Membership, Mark, Slot } from './model';

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
    .sort((a, b) => a.meeting.localeCompare(b.meeting) || a.clubId.localeCompare(b.clubId));
  for (const slot of visible) {
    const month = slot.meeting.slice(0, 7);
    groups.set(month, [...(groups.get(month) ?? []), slot]);
  }
  return [...groups].map(([month, grouped]) => ({ month, slots: grouped }));
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
