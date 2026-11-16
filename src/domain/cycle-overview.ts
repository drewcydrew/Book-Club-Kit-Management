import type { Ballot, Membership, Mark, Slot } from './model';

export interface MonthGroup {
  month: string;
  slots: Slot[];
}

export interface MemberVote {
  personId: string;
  voted: boolean;
  ranking: string[];
  marks: Record<Mark, number>;
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
      return { personId: membership.personId, voted: ranking.length > 0 || Object.keys(ballot?.marks ?? {}).length > 0, ranking, marks };
    });
}
