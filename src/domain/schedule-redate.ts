import { assignmentProblems, loanOverrun, previousMeetingFor, windowFor } from './logic';
import { validDate } from './dates';
import type { Assignment, Cycle, Data, Slot } from './model';

// Re-dates one fixed meeting and recalculates its pickup and return. A blank pickup date uses the automatic rule.
// Returns the problems the new dates would create.
export function moveSlotDate(workspace: { base: Data; cycle: Cycle; assignments: Assignment[] }, slotId: string, date: string, pickupDate?: string):
  { error: string } | { cycle: Cycle; assignments: Assignment[]; problems: string[] } {
  const { base, cycle, assignments } = workspace;
  const slot = cycle.slots.find((item) => item.id === slotId);
  const club = base.clubs.find((item) => item.id === slot?.clubId);
  if (!slot || !club) return { error: 'This meeting is no longer available. Refresh the schedule.' };
  if (!validDate(date)) return { error: 'Enter a valid meeting date (YYYY-MM-DD).' };
  const month = date.slice(0, 7);
  if (month < cycle.startsOn.slice(0, 7) || month > cycle.endsOn.slice(0, 7)) return { error: 'The meeting must fall within the cycle range.' };
  if (date <= cycle.deadline) return { error: 'The meeting must be after the voting deadline.' };
  if (cycle.slots.some((item) => item.id !== slot.id && item.clubId === slot.clubId && item.month === month)) {
    return { error: 'This club already has a meeting in that month.' };
  }
  const moved: Slot = { ...slot, month, meeting: date };
  const nextCycle: Cycle = { ...cycle, slots: cycle.slots.map((item) => item.id === slot.id ? moved : item) };
  const current = assignments.find((item) => item.slotId === slot.id);
  if (!current) return { cycle: nextCycle, assignments, problems: [] };
  if (current.locked) return { error: 'Unlock this assignment before moving its meeting.' };
  const previousMeeting = previousMeetingFor(nextCycle, moved, club, (slotId) => assignments.find((item) => item.slotId === slotId)?.meeting);
  const pickup = windowFor(base, club, date, previousMeeting);
  const manualPickup = pickupDate?.trim() ? pickupDate.trim() : null;
  if (manualPickup !== null) {
    if (!validDate(manualPickup)) return { error: 'Enter a valid pickup date (YYYY-MM-DD).' };
    if (manualPickup > date) return { error: 'The pickup date must be on or before the meeting.' };
  }
  const ready = manualPickup ?? pickup.ready;
  if (ready <= cycle.deadline) return { error: `The pickup date ${ready} must be after the preference deadline.` };
  const next: Assignment = { ...current, ...pickup, ready };
  const nextAssignments = assignments.map((item) => item.id === next.id ? next : item);
  const others = [...base.assignments.filter((item) => item.cycleId !== cycle.id), ...nextAssignments];
  // Validate against the moved cycle so the slot's new meeting date is the one checked.
  const movedBase = { ...base, cycles: base.cycles.map((item) => item.id === cycle.id ? nextCycle : item) };
  const overrun = loanOverrun(movedBase, next);
  const problems = [...assignmentProblems(movedBase, next, others), ...(overrun ? [overrun] : [])];
  return { cycle: nextCycle, assignments: nextAssignments, problems };
}
