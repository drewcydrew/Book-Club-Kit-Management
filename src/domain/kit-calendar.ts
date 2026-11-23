import { addDays, daysBetween, validDate } from './dates';
import type { Assignment } from './model';
import { calendarWeeks } from './member-calendar';

export interface KitGroup {
  kitId: string;
  assignments: Assignment[];
}

export interface KitDayMark {
  kitId: string;
  assignment: Assignment;
  ready: boolean;
  meeting: boolean;
  due: boolean;
  overrun: boolean;
}

export interface KitGap {
  from: string;
  to: string;
  days: number;
}

export interface KitSummary {
  kitId: string;
  assignments: Assignment[];
  overruns: Set<string>;
  gaps: KitGap[];
  overlap: boolean;
}

export interface KitCalendarMonth {
  month: string;
  weeks: (string | null)[][];
}

export interface KitCalendar {
  months: KitCalendarMonth[];
  marks: Map<string, KitDayMark[]>;
  kits: KitSummary[];
}

export function buildKitCalendar(groups: KitGroup[], cycleMonths: string[], allowedDays: number): KitCalendar {
  const marks = new Map<string, KitDayMark[]>();
  const months = new Set(cycleMonths);
  const kits = groups.map((group): KitSummary => {
    const assignments = group.assignments
      .filter((assignment) => validDate(assignment.ready) && validDate(assignment.due))
      .sort((a, b) => a.ready.localeCompare(b.ready) || a.id.localeCompare(b.id));
    const overruns = new Set(assignments
      .filter((assignment) => daysBetween(assignment.ready, assignment.due) > allowedDays)
      .map((assignment) => assignment.id));
    const gaps: KitGap[] = [];
    let overlap = false;
    assignments.forEach((assignment, index) => {
      months.add(assignment.ready.slice(0, 7));
      months.add(assignment.due.slice(0, 7));
      for (let day = assignment.ready; day <= assignment.due; day = addDays(day, 1)) {
        const list = marks.get(day) ?? [];
        list.push({
          kitId: group.kitId,
          assignment,
          ready: day === assignment.ready,
          meeting: day === assignment.meeting,
          due: day === assignment.due,
          overrun: overruns.has(assignment.id),
        });
        marks.set(day, list);
      }
      const previous = assignments[index - 1];
      if (!previous) return;
      if (assignment.ready <= previous.due) {
        overlap = true;
        return;
      }
      const days = daysBetween(previous.due, assignment.ready) - 1;
      if (days > 0) gaps.push({ from: addDays(previous.due, 1), to: addDays(assignment.ready, -1), days });
    });
    return { kitId: group.kitId, assignments, overruns, gaps, overlap };
  });
  return {
    months: [...months].sort().map((month) => ({ month, weeks: calendarWeeks(month) })),
    marks,
    kits,
  };
}
