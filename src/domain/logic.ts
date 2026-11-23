import { addDays, daysBetween, today, validDate } from './dates';
import type { Assignment, Club, Cycle, Data, Event, Kit, Slot } from './model';
import { meetingDate, pickupDate, previousMonth, returnDate } from './meeting-rule';

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

export function meetingFor(slot: Slot, club: Club, stagedMeeting?: string): string {
  return slot.meeting ?? stagedMeeting ?? meetingDate(slot.month, club);
}

// The meeting one cadence period before this slot, which pickup is measured from. Undefined when there is none,
// for example the cycle's first meeting or a monthly meeting after a skipped month.
export function previousMeetingFor(cycle: Cycle, slot: Slot, club: Club, stagedMeeting: (slotId: string) => string | undefined): string | undefined {
  const [previous] = cycle.slots.filter((item) => item.clubId === slot.clubId && item.month < slot.month)
    .sort((a, b) => b.month.localeCompare(a.month));
  if (!previous) return undefined;
  if (club.cadence === 1 && previous.month !== previousMonth(slot.month)) return undefined;
  return meetingFor(previous, club, stagedMeeting(previous.id));
}

export function windowFor(data: Data, club: Club, meeting: string, previousMeeting?: string): Pick<Assignment, 'ready' | 'meeting' | 'due'> {
  return { ready: pickupDate(meeting, club, previousMeeting), meeting, due: returnDate(meeting) };
}

// Overruns are reported as warnings rather than blocking problems, so generation does not treat them as conflicts.
// The allowance is the loan period plus the turnaround buffer.
export function loanOverrun(data: Data, window: Pick<Assignment, 'ready' | 'due'>): string | null {
  if (!validDate(window.ready) || !validDate(window.due)) return null;
  const days = daysBetween(window.ready, window.due);
  const allowed = data.library.loanDays + data.library.bufferDays;
  return days > allowed ? `Checkout runs ${days} days, longer than the ${data.library.loanDays}-day loan period plus ${data.library.bufferDays}-day turnaround buffer.` : null;
}

export function assignmentProblem(data: Data, assignment: Assignment, others: Assignment[]): string | null {
  return assignmentProblems(data, assignment, others)[0] ?? null;
}

export function assignmentProblems(data: Data, assignment: Assignment, others: Assignment[], kitsById?: ReadonlyMap<string, Kit>): string[] {
  const problems: string[] = [];
  const findKit = (kitId: string) => kitsById ? kitsById.get(kitId) : data.kits.find((item) => item.id === kitId);
  const kit = findKit(assignment.kitId);
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
    else if (!validDate(active.ready) || !validDate(active.due)) problems.push('The current published kit loan has invalid dates.');
    else if (active.id !== assignment.id && (assignment.ready <= addDays(active.due, data.library.bufferDays) ||
      (active.due < today() && assignment.ready <= addDays(today(), data.library.bufferDays)))) problems.push('A checked-out or overdue kit blocks this assignment.');
  }
  if (club.history.includes(kit.titleId)) problems.push('The club has already read this title.');
  for (const other of others) {
    if (other.id === assignment.id) continue;
    if (other.cycleId === assignment.cycleId && other.slotId === assignment.slotId) problems.push('Meeting already has an assignment.');
    if (other.cycleId === assignment.cycleId && other.clubId === assignment.clubId &&
      findKit(other.kitId)?.titleId === kit.titleId) {
      problems.push('The club already has this title in the cycle.');
    }
    if (other.kitId === assignment.kitId) {
      if (!validDate(other.ready) || !validDate(other.due)) {
        problems.push(`Kit loan dates are invalid for slot ${other.slotId} in cycle ${other.cycleId}.`);
      } else if (assignment.ready <= addDays(other.due, data.library.bufferDays) &&
          other.ready <= addDays(assignment.due, data.library.bufferDays)) {
        problems.push(`Kit loan windows conflict with slot ${other.slotId} in cycle ${other.cycleId}, including the turnaround buffer.`);
      }
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

type DraftResult = { assignments: Assignment[]; problems: string[] };

// A scoped run only fills empty slots of one club. Existing assignments are kept, and no other club's assignment is displaced.
export type DraftScope = { clubId: string };

// Both modes preserve coverage; utilisation then favours kit reuse, popular titles and fairness.
export type DraftMode = 'clubs' | 'utilisation';

export function generationClubScope(data: Data, cycle: Cycle, assignments: readonly Assignment[], shownClubIds: readonly string[]) {
  const known = new Set(data.clubs.map((club) => club.id));
  const shown = new Set(shownClubIds);
  const missing = new Set([
    ...cycle.slots.map((slot) => slot.clubId),
    ...assignments.filter((assignment) => assignment.cycleId === cycle.id).map((assignment) => assignment.clubId),
  ].filter((clubId) => !known.has(clubId)));
  return {
    shownCount: data.clubs.filter((club) => shown.has(club.id)).length,
    excludedClubIds: data.clubs.filter((club) => !shown.has(club.id)).map((club) => club.id),
    missingClubIds: [...missing],
  };
}

export function prepareDraftExclusions(data: Data, cycle: Cycle, excludedClubIds: readonly string[]) {
  const excluded = new Set(excludedClubIds);
  if (!excluded.size) return { data, cycle, removed: [] as Assignment[] };
  const removed = data.assignments.filter((assignment) => assignment.cycleId === cycle.id && excluded.has(assignment.clubId));
  return {
    data: { ...data, assignments: data.assignments.filter((assignment) => assignment.cycleId !== cycle.id || !excluded.has(assignment.clubId)) },
    cycle: { ...cycle, slots: cycle.slots.filter((slot) => !excluded.has(slot.clubId)) },
    removed,
  };
}

export function exclusionUnlockIds(baseAssignments: Assignment[], removed: Assignment[], existingUnlockIds: string[]): string[] {
  const removedIds = new Set(removed.map((assignment) => assignment.id));
  return [...new Set([...existingUnlockIds, ...baseAssignments
    .filter((assignment) => assignment.locked && removedIds.has(assignment.id))
    .map((assignment) => assignment.id)])];
}

function* draftSteps(data: Data, cycle: Cycle, continueWithInvalidLocks = false, scope?: DraftScope, mode: DraftMode = 'clubs'): Generator<void, DraftResult, void> {
  const retained = scope ? [...data.assignments] : data.assignments.filter((a) => a.cycleId !== cycle.id || a.locked);
  const problems: string[] = [];
  for (const locked of retained.filter((a) => a.cycleId === cycle.id && a.locked && (!scope || a.clubId === scope.clubId))) {
    const problem = assignmentProblem(data, locked, retained);
    if (problem) problems.push(`Locked assignment ${locked.slotId}: ${problem}`);
  }
  if (problems.length && !continueWithInvalidLocks) return { assignments: data.assignments, problems };
  const clubs = new Map(data.clubs.map((club) => [club.id, club]));
  const kits = new Map(data.kits.map((kit) => [kit.id, kit]));
  const debts = new Map(data.clubs.map((club) => [club.id, satisfactionDebt(data, club.id)]));
  const slots = [...cycle.slots].sort((a, b) => a.month.localeCompare(b.month) ||
    (debts.get(b.clubId) ?? 0) - (debts.get(a.clubId) ?? 0) || a.clubId.localeCompare(b.clubId) || a.id.localeCompare(b.id));
  const targets = scope ? slots.filter((slot) => slot.clubId === scope.clubId) : slots;
  const slotById = new Map(slots.map((slot) => [slot.id, slot]));
  const choices = new Map<string, Kit[]>();
  const priorities = new Map<string, string[]>();
  const preferenceByClub = new Map(data.clubs.map((club) => [club.id, preferences(data, cycle, club.id)]));
  // Each club's vote is weighted by position, so a first choice counts for more than a last choice.
  const demand = new Map<string, number>();
  const participatingClubs = new Set(slots.map((slot) => slot.clubId));
  for (const [clubId, preference] of preferenceByClub) {
    if (!participatingClubs.has(clubId)) continue;
    preference.forEach((titleId, index) => demand.set(titleId, (demand.get(titleId) ?? 0) + (preference.length - index) / preference.length));
  }
  for (const club of data.clubs) {
    const ranked = preferenceByClub.get(club.id) ?? [];
    const preference = mode === 'utilisation'
      ? [...ranked].sort((a, b) => (demand.get(b) ?? 0) - (demand.get(a) ?? 0))
      : ranked;
    // A scoped run may also use unranked titles the club has not read, after its ranked choices.
    const fallback = scope?.clubId === club.id
      ? data.titles.map((title) => title.id).filter((titleId) => !preference.includes(titleId) && !club.history.includes(titleId))
      : [];
    choices.set(club.id, [...preference, ...fallback].flatMap((titleId) => data.kits.filter((kit) => kit.titleId === titleId)
      .sort((a, b) => Number(b.branch === club.branch) - Number(a.branch === club.branch) || a.id.localeCompare(b.id))));
    priorities.set(club.id, cycle.finalized[club.id] ?? rankings(data, cycle, club.id, true));
  }
  const windows = new Map<string, Pick<Assignment, 'ready' | 'meeting' | 'due'>>();
  const slotErrors = new Map<string, string>();
  const candidateIds = new Map<string, string>();
  const stagedMeetings = new Map(data.assignments.filter((assignment) => assignment.cycleId === cycle.id)
    .map((assignment) => [assignment.slotId, assignment.meeting]));
  for (const slot of slots) {
    const club = clubs.get(slot.clubId);
    if (!club) {
      slotErrors.set(slot.id, `Slot ${slot.id}: club not found.`);
      continue;
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(slot.month)) {
      slotErrors.set(slot.id, `${club.name}: meeting month ${slot.month} is invalid.`);
      continue;
    }
    let meeting: string;
    let previousMeeting: string | undefined;
    let pickup: string;
    try {
      meeting = meetingFor(slot, club, stagedMeetings.get(slot.id));
      previousMeeting = previousMeetingFor(cycle, slot, club, (id) => stagedMeetings.get(id));
      pickup = pickupDate(meeting, club, previousMeeting);
    }
    catch {
      slotErrors.set(slot.id, `${club.name} in ${slot.month}: the club meeting or pickup rule is invalid. Check the club details.`);
      continue;
    }
    if (!validDate(meeting)) {
      slotErrors.set(slot.id, `${club.name}: meeting month ${slot.month} is invalid.`);
      continue;
    }
    if (!slot.meeting && meeting <= cycle.deadline) {
      slotErrors.set(slot.id, `${club.name} in ${slot.month}: the meeting date ${meeting} must be after the preference deadline. Adjust the meeting date or deadline.`);
      continue;
    }
    if (pickup <= cycle.deadline) {
      slotErrors.set(slot.id, `${club.name} in ${slot.month}: the pickup date ${pickup} must be after the preference deadline. Adjust the pickup rule or deadline.`);
      continue;
    }
    const slotWindow = windowFor(data, club, meeting, previousMeeting);
    if (slotWindow.due < meeting) {
      slotErrors.set(slot.id, `${club.name} in ${slot.month}: the return date ${slotWindow.due} falls before the meeting ${meeting}. Adjust the pickup rule or loan length.`);
      continue;
    }
    windows.set(slot.id, slotWindow);
    candidateIds.set(slot.id, id());
  }

  const current = new Map<string, Assignment>();
  const byKit = new Map<string, Set<Assignment>>();
  const byClub = new Map<string, Set<Assignment>>();
  function index(map: Map<string, Set<Assignment>>, key: string, value: Assignment, add: boolean) {
    if (add) {
      const entries = map.get(key) ?? new Set<Assignment>();
      entries.add(value);
      map.set(key, entries);
    } else {
      const entries = map.get(key);
      entries?.delete(value);
      if (!entries?.size) map.delete(key);
    }
  }
  function insert(value: Assignment) {
    if (value.cycleId === cycle.id) current.set(value.slotId, value);
    index(byKit, value.kitId, value, true);
    index(byClub, value.clubId, value, true);
  }
  function remove(value: Assignment) {
    if (value.cycleId === cycle.id) current.delete(value.slotId);
    index(byKit, value.kitId, value, false);
    index(byClub, value.clubId, value, false);
  }
  function related(value: Assignment): Assignment[] {
    return [...new Set([...(byKit.get(value.kitId) ?? []), ...(byClub.get(value.clubId) ?? [])])];
  }
  function candidate(slot: Slot, kit: Kit): Assignment {
    return { id: candidateIds.get(slot.id)!, cycleId: cycle.id, slotId: slot.id, clubId: slot.clubId,
      kitId: kit.id, ...windows.get(slot.id)!, locked: false };
  }
  for (const assignment of retained) insert(assignment);

  function orderedChoices(slot: Slot): Kit[] {
    const options = choices.get(slot.clubId) ?? [];
    if (mode !== 'utilisation' || scope) return options;
    const used = new Set([...current.values()].map((assignment) => assignment.kitId));
    return [...options].sort((a, b) => Number(used.has(b.id)) - Number(used.has(a.id)));
  }

  // Keep the original greedy solution as the lower bound on coverage.
  for (const slot of targets) {
    if (current.has(slot.id) || !windows.has(slot.id)) continue;
    for (const kit of orderedChoices(slot)) {
      yield;
      const value = candidate(slot, kit);
      if (!assignmentProblems(data, value, related(value), kits).length) { insert(value); break; }
    }
  }

  const maxDisplacements = scope ? 0 : 3;
  type Budget = { remaining: number; limited: boolean };
  // A branch succeeds only after every displaced slot has been reassigned.
  function* search(pending: Slot[], protectedSlots: Set<string>, displaced: number, budget: Budget,
    accept: () => boolean, skipKit?: string): Generator<void, boolean, void> {
    if (!pending.length) return accept();
    const [slot, ...rest] = pending;
    if (!windows.has(slot.id)) return false;
    for (const kit of orderedChoices(slot)) {
      if (skipKit === kit.id) continue;
      if (budget.remaining <= 0) { budget.limited = true; return false; }
      budget.remaining--;
      yield;
      const value = candidate(slot, kit);
      const blockers = related(value).filter((other) =>
        (other.cycleId === cycle.id && other.clubId === value.clubId && kits.get(other.kitId)?.titleId === kit.titleId) ||
        (other.kitId === value.kitId && (!validDate(other.ready) || !validDate(other.due) ||
          (value.ready <= addDays(other.due, data.library.bufferDays) &&
            other.ready <= addDays(value.due, data.library.bufferDays)))));
      if (blockers.some((other) => other.cycleId !== cycle.id || other.locked || protectedSlots.has(other.slotId))) continue;
      if (displaced + blockers.length > maxDisplacements) {
        if (maxDisplacements > 0) budget.limited = true;
        continue;
      }
      for (const blocker of blockers) remove(blocker);
      const valid = !assignmentProblems(data, value, related(value), kits).length;
      if (valid) {
        insert(value);
        const nextProtected = new Set(protectedSlots);
        nextProtected.add(slot.id);
        const nextSlots = blockers.map((blocker) => slotById.get(blocker.slotId)).filter((item): item is Slot => !!item);
        if (nextSlots.length === blockers.length &&
            (yield* search([...rest, ...nextSlots], nextProtected, displaced + blockers.length, budget, accept))) return true;
        remove(value);
      }
      for (const blocker of blockers) insert(blocker);
    }
    return false;
  }

  const repairBudget: Budget = { remaining: 20000, limited: false };
  function* repairGaps(): Generator<void, void, void> {
    let repaired = true;
    while (repaired && repairBudget.remaining > 0) {
      repaired = false;
      for (const slot of targets) {
        if (current.has(slot.id) || !windows.has(slot.id)) continue;
        const attempt: Budget = { remaining: Math.min(512, repairBudget.remaining), limited: false };
        const initialBudget = attempt.remaining;
        if (yield* search([slot], new Set(), 0, attempt, () => true)) repaired = true;
        repairBudget.remaining -= initialBudget - attempt.remaining;
        repairBudget.limited ||= attempt.limited;
        if (repairBudget.remaining <= 0) break;
      }
    }
  }
  yield* repairGaps();

  const scoringSlots = new Map<string, Slot[]>();
  for (const slot of [...slots].sort((a, b) => a.month.localeCompare(b.month) || a.id.localeCompare(b.id))) {
    const group = scoringSlots.get(slot.clubId) ?? [];
    group.push(slot);
    scoringSlots.set(slot.clubId, group);
  }
  function scores(): { sorted: number[]; byClub: Map<string, number> } {
    const result = new Map<string, number>();
    for (const [clubId, clubSlots] of scoringSlots) {
      const priority = priorities.get(clubId) ?? [];
      if (!priority.length) continue;
      const seen = new Set<string>();
      let total = 0;
      for (const slot of clubSlots) {
        const titleId = kits.get(current.get(slot.id)?.kitId ?? '')?.titleId;
        if (!titleId || seen.has(titleId)) continue;
        seen.add(titleId);
        const rank = priority.indexOf(titleId);
        if (rank >= 0) total += (priority.length - rank) / priority.length;
      }
      result.set(clubId, 100 * total / clubSlots.length);
    }
    const fairnessScores = [...result.values()].sort((a, b) => a - b);
    if (mode === 'utilisation') {
      const assignments = [...current.values()];
      const usedKits = new Set(assignments.map((assignment) => assignment.kitId));
      const popularity = assignments.reduce((total, assignment) =>
        total + (demand.get(kits.get(assignment.kitId)?.titleId ?? '') ?? 0), 0);
      return { sorted: [-usedKits.size, popularity, ...fairnessScores], byClub: result };
    }
    return { sorted: fairnessScores, byClub: result };
  }
  function improves(next: number[], previous: number[]): boolean {
    for (let i = 0; i < next.length; i++) {
      if (Math.abs(next[i] - previous[i]) > 1e-9) return next[i] > previous[i];
    }
    return false;
  }
  const qualityBudget: Budget = { remaining: scope ? 0 : 5000, limited: false };
  let improved = true;
  let qualityChanged = false;
  while (improved && qualityBudget.remaining > 0) {
    improved = false;
    const baseline = scores();
    const qualitySlots = [...slots].sort((a, b) =>
      (baseline.byClub.get(a.clubId) ?? Infinity) - (baseline.byClub.get(b.clubId) ?? Infinity) ||
      (debts.get(b.clubId) ?? 0) - (debts.get(a.clubId) ?? 0) ||
      a.month.localeCompare(b.month) || a.clubId.localeCompare(b.clubId) || a.id.localeCompare(b.id));
    for (const slot of qualitySlots) {
      const original = current.get(slot.id);
      if (!original || original.locked || !windows.has(slot.id)) continue;
      remove(original);
      const attempt: Budget = { remaining: Math.min(256, qualityBudget.remaining), limited: false };
      const initialBudget = attempt.remaining;
      const accepted = yield* search([slot], new Set(), 0, attempt, () => improves(scores().sorted, baseline.sorted), original.kitId);
      qualityBudget.remaining -= initialBudget - attempt.remaining;
      qualityBudget.limited ||= attempt.limited;
      if (accepted) {
        improved = true;
        qualityChanged = true;
        break;
      }
      insert(original);
      if (qualityBudget.remaining <= 0) break;
    }
  }
  if (qualityChanged) yield* repairGaps();

  for (const assignment of current.values()) {
    if (assignment.locked) continue;
    const problem = assignmentProblems(data, assignment, related(assignment), kits)[0];
    if (problem) throw new Error(`Generated assignment ${assignment.slotId} is invalid: ${problem}`);
  }
  const assignments = [...retained.filter((item) => item.cycleId !== cycle.id || !slotById.has(item.slotId)),
    ...slots.map((slot) => current.get(slot.id)).filter((item): item is Assignment => !!item)];
  for (const slot of targets) {
    if (current.has(slot.id)) continue;
    const name = clubs.get(slot.clubId)?.name ?? slot.clubId;
    const reason = (choices.get(slot.clubId) ?? []).length === 0
      ? 'no ranked or available title to choose from.'
      : 'no available kit fits the loan dates, turnaround buffer or club history.';
    problems.push(slotErrors.get(slot.id) ?? (scope ? `${name} in ${slot.month}: ${reason}` : `${name} in ${slot.month}: no feasible preferred kit found.`));
  }
  if ((repairBudget.limited || repairBudget.remaining <= 0) && targets.some((slot) => !current.has(slot.id) && windows.has(slot.id))) {
    problems.push('Schedule search was limited; further rearrangements may fill additional slots.');
  }
  if (!scope && (qualityBudget.limited || qualityBudget.remaining <= 0)) {
    problems.push(`${mode === 'clubs' ? 'Fairness' : 'Utilisation'} improvement was limited; further improvements may be possible.`);
  }
  return { assignments, problems };
}

export function draft(data: Data, cycle: Cycle, continueWithInvalidLocks = false, scope?: DraftScope, mode: DraftMode = 'clubs'): DraftResult {
  const steps = draftSteps(data, cycle, continueWithInvalidLocks, scope, mode);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

export async function draftAsync(data: Data, cycle: Cycle, continueWithInvalidLocks = false, scope?: DraftScope, mode: DraftMode = 'clubs'): Promise<DraftResult> {
  const steps = draftSteps(data, cycle, continueWithInvalidLocks, scope, mode);
  for (;;) {
    for (let i = 0; i < 128; i++) {
      const step = steps.next();
      if (step.done) return step.value;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
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
