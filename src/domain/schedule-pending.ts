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
