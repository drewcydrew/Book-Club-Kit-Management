import { cadenceMonths } from './cadence';
import { meetingDate } from './meeting-rule';
import type { Assignment, Cycle, Data, Slot } from './model';

export function prepareFullRegeneration(data: Data, cycle: Cycle, excludedClubIds: readonly string[], makeId: () => string) {
  const excluded = new Set(excludedClubIds);
  const known = new Set(data.clubs.map((club) => club.id));
  if (cycle.slots.some((slot) => !excluded.has(slot.clubId) && !known.has(slot.clubId))) {
    throw new Error('Some meetings reference unavailable clubs. Refresh before generating.');
  }
  const replacements: Slot[] = [];
  for (const club of data.clubs) {
    if (excluded.has(club.id)) continue;
    for (const month of cadenceMonths(cycle, club)) {
      replacements.push({ id: makeId(), clubId: club.id, month, meeting: null });
    }
  }
  const reset = { ...cycle, slots: [...cycle.slots.filter((slot) => excluded.has(slot.clubId)), ...replacements] };
  return {
    cycle: reset,
    data: { ...data, cycles: data.cycles.map((item) => item.id === cycle.id ? reset : item),
      assignments: data.assignments.filter((assignment) => assignment.cycleId !== cycle.id) },
  };
}

export function regenerationUnlockIds(baseAssignments: readonly Assignment[], cycleId: string, existing: readonly string[]): string[] {
  return [...new Set([...existing, ...baseAssignments
    .filter((assignment) => assignment.cycleId === cycleId && assignment.locked)
    .map((assignment) => assignment.id)])];
}

export function dateRegeneratedSlots(data: Data, cycle: Cycle, excludedClubIds: readonly string[]) {
  const excluded = new Set(excludedClubIds);
  const problems: string[] = [];
  const slots = cycle.slots.map((slot) => {
    if (excluded.has(slot.clubId)) return slot;
    const club = data.clubs.find((item) => item.id === slot.clubId);
    if (!club) throw new Error('Some meetings reference unavailable clubs. Refresh before generating.');
    let date: string;
    try {
      date = meetingDate(slot.month, club);
    } catch {
      problems.push(`${club.name} in ${slot.month}: the club meeting rule is invalid. Check the club details.`);
      return slot;
    }
    if (date <= cycle.deadline) {
      problems.push(`${club.name} in ${slot.month}: the meeting date ${date} must be after the preference deadline. Adjust the meeting date or deadline.`);
      return slot;
    }
    return { ...slot, meeting: date };
  });
  return { cycle: { ...cycle, slots }, problems };
}
