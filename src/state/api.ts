import type { Assignment, Ballot, Club, Cycle, Event, Kit, Library, Mark, Membership, Person, Title } from '../domain/model';

export type SharedTitle = Title & { revision: number };
export type SharedKit = Kit & { revision: number };
export type SharedClub = Omit<Club, 'leaderId' | 'history' | 'membershipRevision'>;
export type ClubKit = { clubId: string; kitId: string };
export type ClubHistory = { clubId: string; titles: string[] };
export type MembershipRevision = { clubId: string; revision: number };
export type SharedData = {
  people: Person[];
  memberships: Membership[];
  membershipRevisions: MembershipRevision[];
  cycles: Cycle[];
  ballots: Ballot[];
  assignments: Assignment[];
  library: Library;
  events: Event[];
  history: ClubHistory[];
  titles: SharedTitle[];
  kits: SharedKit[];
  clubs: SharedClub[];
  links: ClubKit[];
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isString(value: unknown): value is string { return typeof value === 'string'; }
function isNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function isStringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every(isString); }
function isNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || isString(value);
}
function isTitle(value: unknown): value is SharedTitle {
  return isObject(value) && isString(value.id) && isString(value.name) && isString(value.author) &&
    isString(value.isbn) && isNumber(value.pages) && isString(value.genres) && isString(value.notes) &&
    typeof value.largePrint === 'boolean' && typeof value.audio === 'boolean' && isNumber(value.revision) &&
    isNullableString(value.publisher) && isNullableString(value.synopsis) && isNullableString(value.datePublished) &&
    isNullableString(value.binding) && isNullableString(value.language);
}
function isKit(value: unknown): value is SharedKit {
  return isObject(value) && isString(value.id) && isString(value.titleId) && isString(value.barcode) &&
    isString(value.branch) && isNumber(value.copies) && isString(value.extras) && isStringArray(value.components) &&
    ['available', 'reserved', 'out', 'inspection', 'unavailable'].includes(String(value.status)) && isNumber(value.revision);
}
function isClub(value: unknown): value is SharedClub {
  return isObject(value) && isString(value.id) && isString(value.name) && isString(value.branch) &&
    isNumber(value.size) && isString(value.cadence) &&
    (value.pickup === 'pickup' || value.pickup === 'delivery') && isString(value.address) && isNumber(value.revision);
}
function isLink(value: unknown): value is ClubKit {
  return isObject(value) && isString(value.clubId) && isString(value.kitId);
}
function isPerson(value: unknown): value is Person {
  return isObject(value) && isString(value.id) && isString(value.name) &&
    (value.role === 'admin' || value.role === 'staff' || value.role === 'member') && isNumber(value.revision);
}
function isMembership(value: unknown): value is Membership {
  return isObject(value) && isString(value.personId) && isString(value.clubId) && typeof value.leader === 'boolean';
}
function isMembershipRevision(value: unknown): value is MembershipRevision {
  return isObject(value) && isString(value.clubId) && isNumber(value.revision);
}
function isMark(value: unknown): value is Mark { return value === 'selected' || value === 'read' || value === 'wont'; }
function isMarks(value: unknown): value is Record<string, Mark> {
  return isObject(value) && Object.values(value).every(isMark);
}
function isSlot(value: unknown): boolean {
  return isObject(value) && isString(value.id) && isString(value.clubId) && isString(value.month) &&
    (value.meeting === null || isString(value.meeting));
}
function isStringMap(value: unknown): value is Record<string, string[]> {
  return isObject(value) && Object.values(value).every(isStringArray);
}
function isCycle(value: unknown): value is Cycle {
  return isObject(value) && isString(value.id) && isString(value.name) && isString(value.deadline) &&
    isString(value.startsOn) && isString(value.endsOn) &&
    ['open', 'collecting', 'drafted', 'published'].includes(String(value.status)) && isNumber(value.revision) &&
    Array.isArray(value.slots) && value.slots.every(isSlot) && isStringMap(value.finalized);
}
function isBallot(value: unknown): value is Ballot {
  return isObject(value) && isString(value.cycleId) && isString(value.clubId) && isString(value.personId) &&
    isMarks(value.marks) && isStringArray(value.ranking) && isNumber(value.revision);
}
function isAssignment(value: unknown): value is Assignment {
  return isObject(value) && isString(value.id) && isString(value.cycleId) && isString(value.slotId) &&
    isString(value.clubId) && isString(value.kitId) && isString(value.ready) && isString(value.meeting) &&
    isString(value.due) && typeof value.locked === 'boolean';
}
function isLibrary(value: unknown): value is Library {
  return isObject(value) && isString(value.name) && isStringArray(value.branches) &&
    isNumber(value.loanDays) && isNumber(value.bufferDays) && isNumber(value.revision);
}
function isEvent(value: unknown): value is Event {
  return isObject(value) && isString(value.id) && isString(value.kitId) &&
    ['reserved', 'picked up', 'delivered', 'returned', 'inspected', 'resolved'].includes(String(value.action)) &&
    isString(value.at) && isString(value.notes) &&
    (value.returnedCopies === undefined || isNumber(value.returnedCopies)) &&
    (value.missingComponents === undefined || isStringArray(value.missingComponents));
}
function isHistory(value: unknown): value is ClubHistory {
  return isObject(value) && isString(value.clubId) && isStringArray(value.titles);
}

async function request(path: string, method = 'GET', body?: unknown, revision?: number): Promise<unknown> {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (!configured) throw new Error('EXPO_PUBLIC_API_URL is not configured.');
  let base: URL;
  try { base = new URL(configured); } catch { throw new Error('EXPO_PUBLIC_API_URL must be an absolute URL.'); }
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error('EXPO_PUBLIC_API_URL must use HTTP or HTTPS.');
  let response: Response;
  try {
    response = await fetch(`${configured.replace(/\/+$/, '')}${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(revision === undefined ? {} : { 'If-Match': String(revision) }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch { throw new Error('Unable to reach the shared-data server. Check your connection and API URL.'); }
  if (response.status === 204) return null;
  let value: unknown;
  try { value = await response.json(); } catch { throw new Error(`Server returned an invalid response (HTTP ${response.status}).`); }
  if (!response.ok) {
    const message = isObject(value) && typeof value.error === 'string' ? value.error : `Request failed (HTTP ${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return value;
}

export async function loadShared(): Promise<SharedData> {
  const shared = await request('/api/shared');
  if (!isObject(shared) || !Array.isArray(shared.people) || !shared.people.every(isPerson) ||
      !Array.isArray(shared.memberships) || !shared.memberships.every(isMembership) ||
      !Array.isArray(shared.membershipRevisions) || !shared.membershipRevisions.every(isMembershipRevision) ||
      !Array.isArray(shared.cycles) || !shared.cycles.every(isCycle) ||
      !Array.isArray(shared.ballots) || !shared.ballots.every(isBallot) ||
      !Array.isArray(shared.assignments) || !shared.assignments.every(isAssignment) ||
      !isLibrary(shared.library) || !Array.isArray(shared.events) || !shared.events.every(isEvent) ||
      !Array.isArray(shared.history) || !shared.history.every(isHistory) ||
      !Array.isArray(shared.titles) || !shared.titles.every(isTitle) ||
      !Array.isArray(shared.kits) || !shared.kits.every(isKit) ||
      !Array.isArray(shared.clubs) || !shared.clubs.every(isClub) ||
      !Array.isArray(shared.links) || !shared.links.every(isLink)) {
    throw new Error('Server returned invalid data for /api/shared.');
  }
  return {
    people: shared.people, memberships: shared.memberships, membershipRevisions: shared.membershipRevisions,
    cycles: shared.cycles, ballots: shared.ballots, assignments: shared.assignments, library: shared.library,
    events: shared.events, history: shared.history, titles: shared.titles, kits: shared.kits,
    clubs: shared.clubs, links: shared.links,
  };
}

export async function saveRecord(kind: 'titles' | 'kits' | 'clubs', record: SharedTitle | SharedClub |
  Omit<SharedTitle, 'revision'> | Omit<SharedKit, 'status' | 'revision'> & { revision?: number } | Omit<SharedClub, 'revision'>): Promise<SharedTitle | SharedKit | SharedClub> {
  const exists = 'revision' in record;
  const value = await request(`/api/${kind}${exists ? `/${encodeURIComponent(record.id)}` : ''}`, exists ? 'PUT' : 'POST', record);
  const guard = kind === 'titles' ? isTitle : kind === 'kits' ? isKit : isClub;
  if (!guard(value)) throw new Error('Server saved the record but returned an invalid response; refresh before retrying.');
  return value;
}

export async function deleteRecord(kind: 'titles' | 'kits' | 'clubs', id: string, revision: number): Promise<void> {
  await request(`/api/${kind}/${encodeURIComponent(id)}`, 'DELETE', undefined, revision);
}

export async function setClubKit(clubId: string, kitId: string, linked: boolean): Promise<void> {
  await request(`/api/clubs/${encodeURIComponent(clubId)}/kits/${encodeURIComponent(kitId)}`, linked ? 'PUT' : 'DELETE');
}

function requireRevision(value: unknown): number {
  if (isObject(value) && isNumber(value.revision)) return value.revision;
  throw new Error('Server returned an invalid revision; refresh before retrying.');
}

export async function saveUser(person: Pick<Person, 'id' | 'name' | 'role'> & Partial<Pick<Person, 'revision'>>): Promise<Person> {
  const exists = person.revision !== undefined;
  const value = await request(`/api/users${exists ? `/${encodeURIComponent(person.id)}` : ''}`, exists ? 'PUT' : 'POST', exists
    ? { name: person.name, role: person.role, revision: person.revision }
    : person);
  if (!isPerson(value)) throw new Error('Server returned an invalid user; refresh before retrying.');
  return value;
}

export async function deleteUser(id: string, revision: number): Promise<void> {
  await request(`/api/users/${encodeURIComponent(id)}`, 'DELETE', undefined, revision);
}

export async function saveMemberships(clubId: string, members: Membership[], revision: number): Promise<number> {
  return requireRevision(await request(`/api/clubs/${encodeURIComponent(clubId)}/memberships`, 'PUT', {
    revision, members: members.map(({ personId, leader }) => ({ personId, leader })),
  }));
}

export async function enrolInClub(personId: string, clubId: string, revision: number): Promise<number> {
  return requireRevision(await request(`/api/users/${encodeURIComponent(personId)}/clubs/${encodeURIComponent(clubId)}`, 'PUT', { revision }));
}

export async function leaveClub(personId: string, clubId: string, revision: number): Promise<number> {
  return requireRevision(await request(`/api/users/${encodeURIComponent(personId)}/clubs/${encodeURIComponent(clubId)}`, 'DELETE', undefined, revision));
}

export async function fetchIsbnCover(isbn: string): Promise<string | null> {
  const body = (await request(`/api/covers?isbn=${encodeURIComponent(isbn)}`, 'GET')) as { imageUrl?: unknown } | null;
  return typeof body?.imageUrl === 'string' ? body.imageUrl : null;
}

export type IsbnLookup = {
  title: string | null;
  author: string | null;
  pages: number | null;
  genres: string | null;
  coverUrl: string | null;
  publisher: string | null;
  synopsis: string | null;
  datePublished: string | null;
  binding: string | null;
  language: string | null;
};

function isIsbnLookup(value: unknown): value is IsbnLookup {
  const nullable = (check: (item: unknown) => boolean) => (item: unknown) => item === null || check(item);
  return isObject(value) && nullable(isString)(value.title) && nullable(isString)(value.author) &&
    nullable(isNumber)(value.pages) && nullable(isString)(value.genres) && nullable(isString)(value.coverUrl) &&
    nullable(isString)(value.publisher) && nullable(isString)(value.synopsis) && nullable(isString)(value.datePublished) &&
    nullable(isString)(value.binding) && nullable(isString)(value.language);
}

export async function lookupIsbn(isbn: string): Promise<IsbnLookup> {
  const value = await request(`/api/isbn-lookup?isbn=${encodeURIComponent(isbn)}`, 'GET');
  if (!isIsbnLookup(value)) throw new Error('Server returned an invalid ISBN lookup.');
  return value;
}

export type TitleSearchResult = {
  isbn: string;
  title: string | null;
  author: string | null;
  datePublished: string | null;
};

function isTitleSearchResult(value: unknown): value is TitleSearchResult {
  const nullable = (check: (item: unknown) => boolean) => (item: unknown) => item === null || check(item);
  return isObject(value) && isString(value.isbn) && nullable(isString)(value.title) &&
    nullable(isString)(value.author) && nullable(isString)(value.datePublished);
}

export async function searchIsbns(title: string): Promise<TitleSearchResult[]> {
  const value = await request(`/api/isbn-search?title=${encodeURIComponent(title)}`, 'GET');
  if (!isObject(value) || !Array.isArray(value.results) || !value.results.every(isTitleSearchResult)) {
    throw new Error('Server returned an invalid ISBN search.');
  }
  return value.results;
}

export async function saveCycle(cycle: Omit<Cycle, 'revision'> & Partial<Pick<Cycle, 'revision'>>): Promise<Cycle> {
  const exists = cycle.revision !== undefined;
  const value = await request(`/api/cycles${exists ? `/${encodeURIComponent(cycle.id)}` : ''}`, exists ? 'PUT' : 'POST',
    exists ? { name: cycle.name, deadline: cycle.deadline, startsOn: cycle.startsOn, endsOn: cycle.endsOn, status: cycle.status, slots: cycle.slots, revision: cycle.revision }
      : { id: cycle.id, name: cycle.name, deadline: cycle.deadline, startsOn: cycle.startsOn, endsOn: cycle.endsOn, status: cycle.status, slots: cycle.slots });
  if (!isCycle(value)) throw new Error('Server returned an invalid cycle; refresh before retrying.');
  return value;
}

export async function deleteCycle(id: string, revision: number): Promise<void> {
  await request(`/api/cycles/${encodeURIComponent(id)}`, 'DELETE', undefined, revision);
}

export async function saveBallot(ballot: Ballot): Promise<Ballot> {
  const value = await request(`/api/cycles/${encodeURIComponent(ballot.cycleId)}/clubs/${encodeURIComponent(ballot.clubId)}/ballots/${encodeURIComponent(ballot.personId)}`,
    'PUT', { marks: ballot.marks, ranking: ballot.ranking, revision: ballot.revision });
  if (!isBallot(value)) throw new Error('Server returned an invalid ballot; refresh before retrying.');
  return value;
}

export async function finalizeRanking(cycleId: string, clubId: string, ranking: string[], revision: number): Promise<number> {
  return requireRevision(await request(`/api/cycles/${encodeURIComponent(cycleId)}/clubs/${encodeURIComponent(clubId)}/ranking`, 'PUT', { ranking, revision }));
}

export async function saveSchedule(cycleId: string, assignments: Assignment[], revision: number, publish: boolean): Promise<number> {
  return requireRevision(await request(`/api/cycles/${encodeURIComponent(cycleId)}/schedule`, 'PUT', { assignments, revision, publish }));
}

export async function saveSettings(library: Library): Promise<number> {
  return requireRevision(await request('/api/settings', 'PUT', library));
}

export async function saveHistory(clubId: string, titles: string[], revision: number): Promise<number> {
  return requireRevision(await request(`/api/clubs/${encodeURIComponent(clubId)}/history`, 'PUT', { titles, revision }));
}

export async function saveEvent(kitId: string, event: Event, revision: number, complete: boolean): Promise<void> {
  const value = await request(`/api/kits/${encodeURIComponent(kitId)}/events`, 'POST', {
    id: event.id, action: event.action, at: event.at, notes: event.notes,
    ...(event.returnedCopies === undefined ? {} : { returnedCopies: event.returnedCopies }),
    ...(event.missingComponents === undefined ? {} : { missingComponents: event.missingComponents }),
    revision, complete,
  });
  if (!isObject(value) || !isNumber(value.revision) ||
      !['available', 'reserved', 'out', 'inspection', 'unavailable'].includes(String(value.status))) {
    throw new Error('Server returned an invalid circulation result; refresh before retrying.');
  }
}
