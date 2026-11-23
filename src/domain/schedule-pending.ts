import type { Assignment, Club, Cycle, Kit } from './model';

export function scheduleSelectionPending(
  assignment: Assignment | undefined,
  initialMeeting: string,
  kitId: string,
  meeting: string,
  swapId: string,
) {
  const kitChanged = kitId !== (assignment?.kitId ?? '');
  const dateChanged = meeting !== (assignment?.meeting ?? initialMeeting);
  return { selection: kitChanged || dateChanged, swap: !!swapId };
}

export function generationConfirmation(
  shownCount: number,
  excludedClubIds: readonly string[],
  assignments: readonly Assignment[],
  baseAssignments: readonly Assignment[],
  dirty: boolean,
  hasPending: boolean,
  cycle: Cycle,
  clubs: readonly Club[],
  kits: readonly Kit[],
): string | null {
  const excluded = new Set(excludedClubIds);
  const baseline = baseAssignments.filter((assignment) => assignment.cycleId === cycle.id);
  const affected = [...assignments, ...baseline];
  const hidden = assignments.filter((assignment) => excluded.has(assignment.clubId));
  const resetSlots = cycle.slots.filter((slot) => !excluded.has(slot.clubId));
  const locked = new Map(affected.filter((assignment) => assignment.locked).map((assignment) => [assignment.id, assignment]));
  const describe = (assignment: Assignment) => {
    const club = clubs.find((item) => item.id === assignment.clubId)?.name ?? assignment.clubId;
    const kit = kits.find((item) => item.id === assignment.kitId);
    return `${club} ${assignment.meeting} (${kit?.barcode ?? assignment.kitId})`;
  };
  const inUse = new Map(affected.flatMap((assignment) => {
    const kit = kits.find((item) => item.id === assignment.kitId);
    return kit && (kit.status === 'out' || kit.status === 'reserved')
      ? [[`${assignment.clubId}:${kit.id}`, `${describe(assignment)}: ${kit.status === 'out' ? 'picked up' : 'reserved'}`] as const] : [];
  }));
  if (!excluded.size && !resetSlots.length && !affected.length && !dirty && !hasPending) return null;
  const scopeText = `Generate for ${shownCount} shown ${shownCount === 1 ? 'club' : 'clubs'}; ${excluded.size} hidden ${excluded.size === 1 ? 'club is' : 'clubs are'} excluded.`;
  const removal = ` ${resetSlots.length} shown-club meeting slot${resetSlots.length === 1 ? '' : 's'} and their dates and assignments will be replaced using current club rules. ${hidden.length} hidden-club assignment${hidden.length === 1 ? '' : 's'} will be removed; hidden meeting slots and dates and all ballots remain.`;
  const locks = locked.size ? `\nLocked assignments will be unlocked and replaced or removed: ${[...locked.values()].map(describe).join('; ')}.` : '';
  const circulation = inUse.size ? `\nAffected kits in circulation: ${[...inUse.values()].join('; ')}. Replacing assignments may affect active loans; validation may block saving.` : '';
  return `${scopeText}${removal}${locks}${circulation}\nUnapplied selections will be discarded. Changes remain local until validated and saved as a draft.`;
}
