import { monthsInRange } from './cycle-overview';
import type { Club, Cycle, Slot } from './model';

export function cadenceLabel(cadence: Club['cadence'], offset: Club['cadenceOffset']): string {
  return cadence === 1 ? 'Monthly' : `Six weeks · offset ${offset}`;
}

export function cadenceMonths(cycle: Cycle, club: Pick<Club, 'cadence' | 'cadenceOffset'>): string[] {
  return monthsInRange(cycle.startsOn, cycle.endsOn).filter((_, index) => club.cadence === 1 || (index + 3 - club.cadenceOffset) % 3 !== 2);
}

export function reconcileCadence(cycle: Cycle, clubs: Club[], clubIds: readonly string[], makeId: () => string) {
  const eligible = new Set(clubIds);
  const missing = [...eligible].filter((clubId) => !clubs.some((club) => club.id === clubId));
  if (missing.length) throw new Error('Some meetings reference unavailable clubs. Refresh before generating.');
  const wanted = new Map(clubs.filter((club) => eligible.has(club.id))
    .map((club) => [club.id, new Set(cadenceMonths(cycle, club))]));
  const removed = cycle.slots.filter((slot) => wanted.has(slot.clubId) && !wanted.get(slot.clubId)!.has(slot.month));
  const removedIds = new Set(removed.map((slot) => slot.id));
  const added: Slot[] = [];
  for (const [clubId, months] of wanted) {
    for (const month of months) {
      if (!cycle.slots.some((slot) => slot.clubId === clubId && slot.month === month)) {
        added.push({ id: makeId(), clubId, month, meeting: null });
      }
    }
  }
  return { cycle: { ...cycle, slots: [...cycle.slots.filter((slot) => !removedIds.has(slot.id)), ...added] }, removed, added };
}
