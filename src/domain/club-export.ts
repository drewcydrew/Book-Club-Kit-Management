import { cadenceLabel, validSkipMonths } from './cadence';
import { csvCell } from './csv';
import { isPickupOffset, meetingOccurrences, meetingWeekdays } from './meeting-rule';
import type { Club } from './model';

export const clubDefinitionHeaders = ['Club', 'First meeting occurrence', 'First meeting weekday', 'Repeats', 'Pickup offset (days)', 'Skipped months'];

export const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function skippedMonthNames(skipMonths: number): string {
  if (!validSkipMonths(skipMonths)) throw new Error('Club skipped months are invalid.');
  return monthNames.filter((_, index) => ((skipMonths >> index) & 1) === 1).join('; ');
}

export function clubDefinitionsCsv(clubs: readonly Club[]): string {
  const lines = clubs.map((club) => {
    const occurrence = meetingOccurrences.find((item) => item.value === club.meetingOccurrence);
    const weekday = meetingWeekdays.find((item) => item.value === club.meetingWeekday);
    if (!occurrence || !weekday) throw new Error('Club meeting rule is invalid.');
    if (!isPickupOffset(club.pickupOffsetDays)) throw new Error('Club pickup offset is invalid.');
    return [
      club.name, occurrence.label, weekday.label, cadenceLabel(club.cadence),
      club.pickupOffsetDays, skippedMonthNames(club.skipMonths),
    ].map(csvCell).join(',');
  });
  return `\uFEFF${[clubDefinitionHeaders.map(csvCell).join(','), ...lines].join('\r\n')}\r\n`;
}
