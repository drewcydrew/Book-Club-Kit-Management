import { addDays } from './dates';
import { monthsInRange } from './cycle-overview';
import { meetingDate } from './meeting-rule';
import type { Club, Cycle, Slot } from './model';

export const recurringMeetingStepDays = 42;

export function cadenceLabel(cadence: Club['cadence'], offset: Club['cadenceOffset']): string {
  if (cadence === 1) return 'Monthly';
  if (cadence === 2) return 'Every 6 weeks';
  return `Six weeks · offset ${offset}`;
}

// Every-6-weeks clubs start at their week-of-month rule in the cycle's first month that falls within the cycle,
// then meet every 42 days until the cycle ends.
export function recurringMeetingDates(cycle: Pick<Cycle, 'startsOn' | 'endsOn'>, club: Pick<Club, 'meetingWeekday' | 'meetingOccurrence'>): string[] {
  const first = monthsInRange(cycle.startsOn, cycle.endsOn).map((month) => meetingDate(month, club))
    .find((date) => date >= cycle.startsOn);
  if (!first) return [];
  const dates: string[] = [];
  for (let date = first; date <= cycle.endsOn; date = addDays(date, recurringMeetingStepDays)) dates.push(date);
  return dates;
}

export function slotMeetingDate(cycle: Pick<Cycle, 'startsOn' | 'endsOn'>, club: Pick<Club, 'cadence' | 'meetingWeekday' | 'meetingOccurrence'>, month: string): string {
  if (club.cadence !== 2) return meetingDate(month, club);
  const date = recurringMeetingDates(cycle, club).find((item) => item.startsWith(`${month}-`));
  if (!date) throw new Error('Meeting month is outside the every-6-weeks schedule.');
  return date;
}

export function cadenceMonths(cycle: Cycle, club: Pick<Club, 'cadence' | 'cadenceOffset' | 'meetingWeekday' | 'meetingOccurrence'>): string[] {
  if (club.cadence === 2) return [...new Set(recurringMeetingDates(cycle, club).map((date) => date.slice(0, 7)))];
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
