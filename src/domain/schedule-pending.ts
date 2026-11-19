import type { Assignment } from './model';

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
): string | null {
  const excluded = new Set(excludedClubIds);
  const removed = assignments.filter((assignment) => excluded.has(assignment.clubId));
  const lockedIds = new Set(baseAssignments.filter((assignment) => assignment.locked).map((assignment) => assignment.id));
  const locked = removed.filter((assignment) => assignment.locked || lockedIds.has(assignment.id));
  const replacesUnlocked = assignments.some((assignment) => !excluded.has(assignment.clubId) && !assignment.locked);
  if (!excluded.size && !replacesUnlocked && !dirty && !hasPending) return null;
  const scopeText = `Generate for ${shownCount} shown ${shownCount === 1 ? 'club' : 'clubs'}; ${excluded.size} hidden ${excluded.size === 1 ? 'club is' : 'clubs are'} excluded.`;
  const removal = ` ${removed.length} hidden-club assignment${removed.length === 1 ? '' : 's'} will be removed locally${locked.length ? `, including ${locked.length} locked assignment${locked.length === 1 ? '' : 's'} that will be unlocked` : ''}. Meeting slots and ballots remain; saving the draft shares these removals.`;
  return `${scopeText}${removal} Replace unlocked local assignments and discard any unapplied selections?`;
}
