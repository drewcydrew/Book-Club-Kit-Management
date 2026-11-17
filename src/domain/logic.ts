import { addDays, today, validDate } from './dates';
import type { Assignment, Cycle, Data, Event, Kit, Slot } from './model';

export function id(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function rankings(data: Data, cycle: Cycle, clubId: string, includeHistory = false): string[] {
  const history = includeHistory ? [] : data.clubs.find((club) => club.id === clubId)?.history ?? [];
  const scores = new Map<string, number>();
  data.ballots.filter((b) => b.cycleId === cycle.id && b.clubId === clubId).forEach((ballot) => {
    ballot.ranking.filter((titleId) => !history.includes(titleId) && ballot.marks[titleId] === 'selected' && data.titles.some((title) => title.id === titleId))
      .forEach((titleId, index, list) => scores.set(titleId, (scores.get(titleId) ?? 0) + list.length - index));
  });
  return [...scores].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([titleId]) => titleId);
}

export function preferences(data: Data, cycle: Cycle, clubId: string): string[] {
  const history = data.clubs.find((club) => club.id === clubId)?.history ?? [];
  return (cycle.finalized[clubId] ?? rankings(data, cycle, clubId))
    .filter((titleId) => !history.includes(titleId) && data.titles.some((title) => title.id === titleId));
}

export function firstMonday(month: string): string {
  const first = `${month}-01`;
  const weekday = new Date(`${first}T00:00:00Z`).getUTCDay();
  return addDays(first, (8 - weekday) % 7);
}

export function meetingFor(slot: Slot): string {
  return slot.meeting ?? firstMonday(slot.month);
}

export function windowFor(data: Data, meeting: string): Pick<Assignment, 'ready' | 'meeting' | 'due'> {
  const ready = addDays(meeting, -Math.max(1, data.library.loanDays - 7));
  return { ready, meeting, due: addDays(ready, data.library.loanDays) };
}

export function assignmentProblem(data: Data, assignment: Assignment, others: Assignment[]): string | null {
  return assignmentProblems(data, assignment, others)[0] ?? null;
}

export function assignmentProblems(data: Data, assignment: Assignment, others: Assignment[]): string[] {
  const problems: string[] = [];
  const kit = data.kits.find((item) => item.id === assignment.kitId);
  const club = data.clubs.find((item) => item.id === assignment.clubId);
  const cycle = data.cycles.find((item) => item.id === assignment.cycleId);
  const slot = cycle?.slots.find((item) => item.id === assignment.slotId);
  const slotMatches = slot?.meeting ? slot.meeting === assignment.meeting : assignment.meeting.startsWith(`${slot?.month}-`);
  if (!kit || !club || !cycle || !slot || slot.clubId !== club.id || !slotMatches) return ['Assignment no longer matches an existing meeting, kit and club.'];
  if (!validDate(assignment.ready) || !validDate(assignment.meeting) || !validDate(assignment.due) ||
      assignment.ready > assignment.meeting || assignment.meeting > assignment.due) return ['The loan dates are invalid.'];
  if (kit.status === 'inspection' || kit.status === 'unavailable') problems.push('Kit is currently unavailable.');
  if (kit.status === 'out') {
    const active = others.filter((a) => a.kitId === kit.id && a.ready <= today() &&
      data.cycles.some((c) => c.id === a.cycleId && c.status === 'published'))
      .sort((a, b) => b.ready.localeCompare(a.ready))[0];
    if (!active) problems.push('Kit is checked out without a current published assignment.');
    else if (active.id !== assignment.id && (assignment.ready <= addDays(active.due, data.library.bufferDays) ||
      (active.due < today() && assignment.ready <= addDays(today(), data.library.bufferDays)))) problems.push('A checked-out or overdue kit blocks this assignment.');
  }
  if (club.history.includes(kit.titleId)) problems.push('The club has already read this title.');
  for (const other of others) {
    if (other.id === assignment.id) continue;
    if (other.cycleId === assignment.cycleId && other.slotId === assignment.slotId) problems.push('Meeting already has an assignment.');
    if (other.cycleId === assignment.cycleId && other.clubId === assignment.clubId &&
      data.kits.find((item) => item.id === other.kitId)?.titleId === kit.titleId) {
      problems.push('The club already has this title in the cycle.');
    }
    if (other.kitId === assignment.kitId &&
      assignment.ready <= addDays(other.due, data.library.bufferDays) &&
      other.ready <= addDays(assignment.due, data.library.bufferDays)) {
      problems.push(`Kit loan windows conflict with slot ${other.slotId} in cycle ${other.cycleId}, including the turnaround buffer.`);
    }
  }
  return [...new Set(problems)];
}

export function fairness(data: Data, cycle: Cycle, clubId: string, assignments: Assignment[]): { score: number | null; assigned: number; slots: number } {
  const slots = cycle.slots.filter((slot) => slot.clubId === clubId).sort((a, b) => a.month.localeCompare(b.month) || a.id.localeCompare(b.id));
  const priority = cycle.finalized[clubId] ?? rankings(data, cycle, clubId, true);
  const bySlot = new Map(assignments.filter((a) => a.cycleId === cycle.id && a.clubId === clubId).map((a) => [a.slotId, a]));
  const seen = new Set<string>();
  let total = 0;
  for (const slot of slots) {
    const assignment = bySlot.get(slot.id);
    const titleId = data.kits.find((kit) => kit.id === assignment?.kitId)?.titleId;
    if (!titleId || seen.has(titleId)) continue;
    seen.add(titleId);
    const rank = priority.indexOf(titleId);
    if (rank >= 0) total += (priority.length - rank) / priority.length;
  }
  return { score: priority.length && slots.length ? 100 * total / slots.length : null, assigned: slots.filter((slot) => bySlot.has(slot.id)).length, slots: slots.length };
}

export function satisfactionDebt(data: Data, clubId: string): number {
  const previous = data.assignments.filter((a) =>
    a.clubId === clubId && data.cycles.some((c) => c.id === a.cycleId && c.status === 'published'));
  if (previous.length === 0) return 0;
  return previous.reduce((total, a) => {
    const cycle = data.cycles.find((c) => c.id === a.cycleId);
    const titleId = data.kits.find((k) => k.id === a.kitId)?.titleId;
    const rank = cycle && titleId ? (cycle.finalized[clubId] ?? rankings(data, cycle, clubId, true)).indexOf(titleId) : -1;
    return total + (rank < 0 ? 10 : rank);
  }, 0) / previous.length;
}

export function draft(data: Data, cycle: Cycle, continueWithInvalidLocks = false): { assignments: Assignment[]; problems: string[] } {
  const retained = data.assignments.filter((a) => a.cycleId !== cycle.id || a.locked);
  const problems: string[] = [];
  for (const locked of retained.filter((a) => a.cycleId === cycle.id)) {
    const problem = assignmentProblem(data, locked, retained);
    if (problem) problems.push(`Locked assignment ${locked.slotId}: ${problem}`);
  }
  if (problems.length && !continueWithInvalidLocks) return { assignments: data.assignments, problems };
  const slots = [...cycle.slots].sort((a, b) => a.month.localeCompare(b.month) ||
    satisfactionDebt(data, b.clubId) - satisfactionDebt(data, a.clubId) || a.clubId.localeCompare(b.clubId) || a.id.localeCompare(b.id));
  for (const slot of slots) {
    if (retained.some((a) => a.cycleId === cycle.id && a.slotId === slot.id)) continue;
    const club = data.clubs.find((c) => c.id === slot.clubId);
    if (!club) {
      problems.push(`Slot ${slot.id}: club not found.`);
      continue;
    }
    const meeting = meetingFor(slot);
    if (!validDate(meeting)) {
      problems.push(`${club.name}: meeting month ${slot.month} is invalid.`);
      continue;
    }
    const choices = preferences(data, cycle, club.id);
    let found = false;
    for (const titleId of choices) {
      const kits = data.kits.filter((kit) => kit.titleId === titleId)
        .sort((a, b) => Number(b.branch === club.branch) - Number(a.branch === club.branch) || a.id.localeCompare(b.id));
      for (const kit of kits) {
        const candidate: Assignment = { id: id(), cycleId: cycle.id, slotId: slot.id, clubId: club.id, kitId: kit.id, ...windowFor(data, meeting), locked: false };
        if (!assignmentProblem(data, candidate, retained)) {
          retained.push(candidate);
          found = true;
          break;
        }
      }
      if (found) break;
    }
    if (!found) problems.push(`${club.name} in ${slot.month}: no feasible preferred kit.`);
  }
  return { assignments: retained, problems };
}

const transitions: Record<Event['action'], Kit['status'][]> = {
  reserved: ['available'],
  'picked up': ['reserved', 'available'],
  delivered: ['reserved', 'available'],
  returned: ['out'],
  inspected: ['inspection'],
  resolved: ['unavailable'],
};

export function circulate(data: Data, kitId: string, action: Event['action'], notes: string, complete: boolean,
  inspection?: { returnedCopies: number; missingComponents: string[] }): Data {
  const kit = data.kits.find((item) => item.id === kitId);
  if (!kit || !transitions[action].includes(kit.status)) throw new Error('This circulation action is not valid for the kit’s current status.');
  if (inspection && (!Number.isInteger(inspection.returnedCopies) || inspection.returnedCopies < 0 ||
      inspection.returnedCopies > kit.copies || inspection.missingComponents.some((part) => !kit.components.includes(part)))) {
    throw new Error('Inspection counts or missing copy barcodes are invalid.');
  }
  if (action === 'inspected' && inspection && (inspection.returnedCopies < kit.copies || inspection.missingComponents.length > 0)) complete = false;
  const status: Kit['status'] = action === 'reserved' ? 'reserved'
    : action === 'picked up' || action === 'delivered' ? 'out'
      : action === 'returned' ? 'inspection'
        : action === 'resolved' || complete ? 'available' : 'unavailable';
  return {
    ...data,
    kits: data.kits.map((item) => item.id === kitId ? { ...item, status } : item),
    events: [...data.events, { id: id(), kitId, action, at: new Date().toISOString(), notes, ...(action === 'inspected' ? inspection : undefined) }],
  };
}
