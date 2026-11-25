import { addDays } from './dates';
import { monthsInRange } from './cycle-overview';
import { meetingDate } from './meeting-rule';
import type { Club, Cycle, Slot } from './model';

export const recurringMeetingStepDays = 42;
const monthAbbreviations = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const allMonthsMask = 0xfff;

export function cadenceLabel(cadence: Club['cadence']): string {
  return cadence === 1 ? 'Monthly' : 'Every 6 weeks';
}

export function validSkipMonths(mask: unknown): mask is number {
  return Number.isInteger(mask) && (mask as number) >= 0 && (mask as number) <= allMonthsMask;
}

// Bit n-1 of the mask marks month n (1 = January) as skipped.
export function isSkippedMonth(month: string, skipMonths: number): boolean {
  return ((skipMonths >> (Number(month.slice(5, 7)) - 1)) & 1) === 1;
}

export function skipMonthsLabel(skipMonths: number): string {
  if (!validSkipMonths(skipMonths)) throw new Error('Club skipped months are invalid.');
  const skipped = monthAbbreviations.filter((_, index) => isSkippedMonth(`2000-${String(index + 1).padStart(2, '0')}`, skipMonths));
  return skipped.length ? `Skips ${skipped.join(', ')}` : 'No skipped months';
}

// Skipped months are treated as if they do not exist. The schedule starts at the week-of-month rule in the cycle's
// first active month, then steps 42 days. A step that lands in a skipped month moves the meeting to the rule date
// in the next active month, and stepping continues from there.
export function recurringMeetingDates(cycle: Pick<Cycle, 'startsOn' | 'endsOn'>, club: Pick<Club, 'meetingWeekday' | 'meetingOccurrence' | 'skipMonths'>): string[] {
  const first = monthsInRange(cycle.startsOn, cycle.endsOn)
    .filter((month) => !isSkippedMonth(month, club.skipMonths))
    .map((month) => meetingDate(month, club))
    .find((date) => date >= cycle.startsOn);
  if (!first) return [];
  const dates: string[] = [];
  for (let date = first; date <= cycle.endsOn; date = nextRecurringDate(date, club)) {
    dates.push(date);
  }
  return dates;
}

function nextRecurringDate(date: string, club: Pick<Club, 'meetingWeekday' | 'meetingOccurrence' | 'skipMonths'>): string {
  const next = addDays(date, recurringMeetingStepDays);
  if (!isSkippedMonth(next, club.skipMonths)) return next;
  let month = addDays(`${next.slice(0, 7)}-01`, 31).slice(0, 7);
  while (isSkippedMonth(month, club.skipMonths)) month = addDays(`${month}-01`, 31).slice(0, 7);
  return meetingDate(month, club);
}

export function slotMeetingDate(cycle: Pick<Cycle, 'startsOn' | 'endsOn'>, club: Pick<Club, 'cadence' | 'meetingWeekday' | 'meetingOccurrence' | 'skipMonths'>, month: string): string {
  if (club.cadence !== 2) return meetingDate(month, club);
  const date = recurringMeetingDates(cycle, club).find((item) => item.startsWith(`${month}-`));
  if (!date) throw new Error('Meeting month is outside the every-6-weeks schedule.');
  return date;
}

export function cadenceMonths(cycle: Cycle, club: Pick<Club, 'cadence' | 'meetingWeekday' | 'meetingOccurrence' | 'skipMonths'>): string[] {
  if (club.cadence === 2) return [...new Set(recurringMeetingDates(cycle, club).map((date) => date.slice(0, 7)))];
  return monthsInRange(cycle.startsOn, cycle.endsOn).filter((month) => !isSkippedMonth(month, club.skipMonths));
}

// Kept slots of the eligible clubs are re-dated to the club's current rule; moved lists those whose date changed.
export function reconcileCadence(cycle: Cycle, clubs: Club[], clubIds: readonly string[], makeId: () => string) {
  const eligible = new Set(clubIds);
  const missing = [...eligible].filter((clubId) => !clubs.some((club) => club.id === clubId));
  if (missing.length) throw new Error('Some meetings reference unavailable clubs. Refresh before generating.');
  const wanted = new Map(clubs.filter((club) => eligible.has(club.id))
    .map((club) => [club.id, new Set(cadenceMonths(cycle, club))]));
  const removed = cycle.slots.filter((slot) => wanted.has(slot.clubId) && !wanted.get(slot.clubId)!.has(slot.month));
  const removedIds = new Set(removed.map((slot) => slot.id));
  const moved: { slot: Slot; from: string; to: string }[] = [];
  const kept = cycle.slots.filter((slot) => !removedIds.has(slot.id)).map((slot) => {
    const club = clubs.find((item) => item.id === slot.clubId);
    if (!club || !eligible.has(club.id) || !slot.meeting) return slot;
    const to = slotMeetingDate(cycle, club, slot.month);
    if (to === slot.meeting) return slot;
    moved.push({ slot, from: slot.meeting, to });
    return { ...slot, meeting: to };
  });
  const added: Slot[] = [];
  for (const [clubId, months] of wanted) {
    for (const month of months) {
      if (!cycle.slots.some((slot) => slot.clubId === clubId && slot.month === month)) {
        added.push({ id: makeId(), clubId, month, meeting: null });
      }
    }
  }
  return { cycle: { ...cycle, slots: [...kept, ...added] }, removed, added, moved };
}
