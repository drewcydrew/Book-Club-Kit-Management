import { recurringMeetingDates, isSkippedMonth } from './cadence';
import { meetingDate, pickupDate, previousMonth, returnDate } from './meeting-rule';
import type { Club } from './model';

export type PreviewMark = 'meeting' | 'pickup' | 'return';

export type PreviewMonth = {
  month: string;
  skipped: boolean;
  // Keyed by full YYYY-MM-DD date. A pickup can fall in the previous month, so markers are kept per date.
  marks: Record<string, PreviewMark[]>;
};

type PreviewClub = Pick<Club, 'cadence' | 'meetingWeekday' | 'meetingOccurrence' | 'skipMonths' | 'pickupOffsetDays'>;

// Projects one indicative year of a club's rules. Pickups follow the same rules as scheduling: a monthly pickup uses the
// previous meeting only when it is in the month before, and every-6-weeks pickups always use the previous meeting.
export function clubYearPreview(club: PreviewClub, year: number): PreviewMonth[] {
  const months = Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);
  const meetings = club.cadence === 2
    ? recurringMeetingDates({ startsOn: `${year}-01-01`, endsOn: `${year}-12-31` }, club)
    : months.filter((month) => !isSkippedMonth(month, club.skipMonths)).map((month) => meetingDate(month, club));

  const marks: Record<string, PreviewMark[]> = {};
  const add = (date: string, mark: PreviewMark) => {
    marks[date] = [...(marks[date] ?? []), mark];
  };
  meetings.forEach((meeting, index) => {
    const previous = meetings[index - 1];
    const usePrevious = previous !== undefined
      && (club.cadence === 2 || previous.slice(0, 7) === previousMonth(meeting.slice(0, 7)));
    add(meeting, 'meeting');
    add(pickupDate(meeting, club, usePrevious ? previous : undefined), 'pickup');
    add(returnDate(meeting), 'return');
  });

  return months.map((month) => ({
    month,
    skipped: isSkippedMonth(month, club.skipMonths),
    marks: Object.fromEntries(Object.entries(marks).filter(([date]) => date.startsWith(`${month}-`))),
  }));
}
