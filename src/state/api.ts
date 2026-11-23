import type { Assignment, Ballot, Club, Cycle, Event, Kit, KitLabel, Library, Mark, Membership, Person, Title } from '../domain/model';

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
  kitLabels: KitLabel[];
  clubs: SharedClub[];
  links: ClubKit[];
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

let tokenProvider: (() => Promise<string | null>) | null = null;
let onUnauthorized: ((token: string) => void) | null = null;
let libraryServiceId = '';
export function setApiLibraryService(id: string): void { libraryServiceId = id; }
export function setApiAuthentication(provider: (() => Promise<string | null>) | null, unauthorized: ((token: string) => void) | null): void {
  tokenProvider = provider;
  onUnauthorized = unauthorized;
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
    isString(value.isbn) && isNumber(value.pages) && isString(value.genres) && isStringArray(value.labelIds) && isString(value.notes) &&
    typeof value.largePrint === 'boolean' && typeof value.audio === 'boolean' && isNumber(value.revision) &&
    isNullableString(value.publisher) && isNullableString(value.synopsis) && isNullableString(value.datePublished) &&
    isNullableString(value.binding) && isNullableString(value.language);
}
function isKit(value: unknown): value is SharedKit {
  return isObject(value) && isString(value.id) && isString(value.titleId) && isString(value.barcode) &&
    isString(value.branch) && isNumber(value.copies) && isString(value.extras) && isStringArray(value.components) && isStringArray(value.labelIds) &&
    ['available', 'reserved', 'out', 'inspection', 'unavailable'].includes(String(value.status)) && isNumber(value.revision);
}
function isKitLabel(value: unknown): value is KitLabel {
  return isObject(value) && isString(value.id) && (value.category === 'genre' || value.category === 'vibe') &&
    isString(value.name) && isNumber(value.revision);
}
function isClub(value: unknown): value is SharedClub {
  return isObject(value) && isString(value.id) && isString(value.name) && isString(value.branch) &&
    isNumber(value.size) && (value.cadence === 1 || value.cadence === 2) &&
    isNumber(value.meetingWeekday) && Number.isInteger(value.meetingWeekday) && value.meetingWeekday >= 0 && value.meetingWeekday <= 6 &&
    (value.meetingOccurrence === -1 || value.meetingOccurrence === 1 || value.meetingOccurrence === 2 || value.meetingOccurrence === 3 || value.meetingOccurrence === 4) &&
    isNumber(value.pickupOffsetDays) && Number.isInteger(value.pickupOffsetDays) && value.pickupOffsetDays >= -7 && value.pickupOffsetDays <= 7 &&
    isNumber(value.skipMonths) && Number.isInteger(value.skipMonths) && value.skipMonths >= 0 && value.skipMonths <= 4095 &&
    (value.pickup === 'pickup' || value.pickup === 'delivery') && isString(value.address) && isNumber(value.revision);
}
function isLink(value: unknown): value is ClubKit {
  return isObject(value) && isString(value.clubId) && isString(value.kitId);
}
function isPerson(value: unknown): value is Person {
  return isObject(value) && isString(value.id) && isString(value.name) &&
    (value.role === 'admin' || value.role === 'staff' || value.role === 'member') && isNumber(value.revision) &&
    (value.firebaseManaged === undefined || typeof value.firebaseManaged === 'boolean');
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

async function request(path: string, method = 'GET', body?: unknown, revision?: number, signal?: AbortSignal, serviceOverride?: string): Promise<unknown> {
  const serviceId = serviceOverride ?? libraryServiceId;
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (!configured) throw new Error('EXPO_PUBLIC_API_URL is not configured.');
  let base: URL;
  try { base = new URL(configured); } catch { throw new Error('EXPO_PUBLIC_API_URL must be an absolute URL.'); }
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error('EXPO_PUBLIC_API_URL must use HTTP or HTTPS.');
  const token = tokenProvider ? await tokenProvider() : null;
  if (token && base.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
    throw new Error('Firebase sign-in requires an HTTPS API URL.');
  }
  let response: Response;
  try {
    response = await fetch(`${configured.replace(/\/+$/, '')}${path}`, {
      method,
      signal,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(revision === undefined ? {} : { 'If-Match': String(revision) }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(serviceId ? { 'X-Library-Service-Id': serviceId } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch { throw new Error('Unable to reach the shared-data server. Check your connection and API URL.'); }
  if (response.status === 204) return null;
  let value: unknown;
  try { value = await response.json(); } catch { throw new Error(`Server returned an invalid response (HTTP ${response.status}).`); }
  if (!response.ok) {
    if (response.status === 401 && token) onUnauthorized?.(token);
    const message = isObject(value) && typeof value.error === 'string' ? value.error : `Request failed (HTTP ${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return value;
}

export type LibraryService = { id: string; name: string };
export type LibrarySetup = {
  requestId: string;
  name: string;
  branches: string[];
  cycle: { name: string; deadline: string; startsOn: string; endsOn: string };
  titles: { name: string; author: string; isbn: string; copies: number }[];
  club: { name: string; branch: string; size: number } | null;
  member: { name: string } | null;
};
export type ServiceDeletionPreview = {
  service: LibraryService;
  counts: Record<string, number>;
  token: string;
};
function isLibraryService(value: unknown): value is LibraryService {
  return isObject(value) && isString(value.id) && isString(value.name);
}
function isCountMap(value: unknown): value is Record<string, number> {
  return isObject(value) && Object.values(value).every((count) => typeof count === 'number' && Number.isSafeInteger(count) && count >= 0);
}
export async function loadLibraryServices(): Promise<LibraryService[]> {
  const value = await request('/api/library-services');
  if (!Array.isArray(value) || !value.every(isLibraryService)) throw new Error('Server returned invalid library services.');
  return value;
}
export async function createLibraryService(name: string, branch: string): Promise<LibraryService> {
  const value = await request('/api/library-services', 'POST', { name, branch });
  if (!isLibraryService(value)) throw new Error('Server returned an invalid library service.');
  return value;
}

export async function createGuidedLibraryService(setup: LibrarySetup): Promise<LibraryService> {
  const value = await request('/api/library-services/setup', 'POST', setup);
  if (!isLibraryService(value)) throw new Error('Server returned an invalid library service.');
  return value;
}

export async function findLibrarySetup(requestId: string): Promise<LibraryService> {
  const value = await request(`/api/library-services/setup/${encodeURIComponent(requestId)}`);
  if (!isLibraryService(value)) throw new Error('Server returned an invalid library service.');
  return value;
}

export async function previewLibraryServiceDeletion(serviceId: string): Promise<ServiceDeletionPreview> {
  const value = await request(`/api/library-services/${encodeURIComponent(serviceId)}/deletion-preview`, 'POST', {});
  if (!isObject(value) || !isLibraryService(value.service) || value.service.id !== serviceId ||
      !isCountMap(value.counts) ||
      typeof value.token !== 'string' || !/^[a-f0-9]{64}$/.test(value.token)) {
    throw new Error('Server returned an invalid service deletion preview.');
  }
  return { service: value.service, counts: value.counts, token: value.token };
}

export async function deleteLibraryService(preview: ServiceDeletionPreview): Promise<void> {
  await request(`/api/library-services/${encodeURIComponent(preview.service.id)}`, 'DELETE',
    { name: preview.service.name, token: preview.token, acknowledge: true });
}

export async function loadSession(): Promise<Person> {
  const value = await request('/api/session');
  if (!isPerson(value) || value.role !== 'admin') throw new Error('Server returned an invalid session.');
  return value;
}

function parseShared(shared: unknown, path: string): SharedData {
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
      !Array.isArray(shared.kitLabels) || !shared.kitLabels.every(isKitLabel) ||
      !Array.isArray(shared.clubs) || !shared.clubs.every(isClub) ||
      !Array.isArray(shared.links) || !shared.links.every(isLink)) {
    throw new Error(`Server returned invalid data for ${path}.`);
  }
  return {
    people: shared.people, memberships: shared.memberships, membershipRevisions: shared.membershipRevisions,
    cycles: shared.cycles, ballots: shared.ballots, assignments: shared.assignments, library: shared.library,
    events: shared.events, history: shared.history, titles: shared.titles, kits: shared.kits, kitLabels: shared.kitLabels,
    clubs: shared.clubs, links: shared.links,
  };
}

export async function loadShared(): Promise<SharedData> {
  return parseShared(await request('/api/shared'), '/api/shared');
}

export async function loadUsers(signal?: AbortSignal): Promise<Person[]> {
  const users = await request('/api/users', 'GET', undefined, undefined, signal);
  if (!Array.isArray(users) || !users.every(isPerson)) throw new Error('Server returned invalid data for /api/users.');
  return users;
}

export type ViewScope = 'home' | 'preferences' | 'schedule' | 'catalog' | 'clubs' | 'cycles' | 'circulation' | 'admin';

export async function loadView(personId: string, scope: ViewScope, signal?: AbortSignal): Promise<SharedData> {
  const path = `/api/users/${encodeURIComponent(personId)}/views/${scope}`;
  const data = parseShared(await request(path, 'GET', undefined, undefined, signal), path);
  if (data.people.length !== 1 || data.people[0].id !== personId) throw new Error(`Server returned invalid user for ${path}.`);
  return data;
}

export type ClubSchedule = {
  club: SharedClub;
  cycles: Cycle[];
  assignments: Assignment[];
  kits: SharedKit[];
  titles: SharedTitle[];
  kitLabels: KitLabel[];
  // Club priority rank per cycle and title. Only returned to verified staff.
  priorities?: Record<string, Record<string, number>>;
};
export type ClubIndexItem = { id: string; name: string; branch: string };

export async function loadClubSchedule(clubId: string, signal?: AbortSignal, serviceId?: string): Promise<ClubSchedule> {
  const path = `/api/club-schedules/${encodeURIComponent(clubId)}`;
  const value = await request(path, 'GET', undefined, undefined, signal, serviceId);
  if (!isObject(value) || !isClub(value.club) || value.club.id !== clubId ||
      !Array.isArray(value.cycles) || !value.cycles.every(isCycle) ||
      !Array.isArray(value.assignments) || !value.assignments.every(isAssignment) ||
      !Array.isArray(value.kits) || !value.kits.every(isKit) ||
      !Array.isArray(value.titles) || !value.titles.every(isTitle) ||
      !Array.isArray(value.kitLabels) || !value.kitLabels.every(isKitLabel) ||
      (value.priorities !== undefined && !isPriorities(value.priorities))) {
    throw new Error(`Server returned invalid data for ${path}.`);
  }
  return {
    club: value.club, cycles: value.cycles, assignments: value.assignments,
    kits: value.kits, titles: value.titles, kitLabels: value.kitLabels,
    priorities: value.priorities,
  };
}

function isPriorities(value: unknown): value is Record<string, Record<string, number>> {
  return isObject(value) && Object.values(value).every((ranks) =>
    isObject(ranks) && Object.values(ranks).every((rank) => typeof rank === 'number'));
}

export async function loadClubIndex(signal?: AbortSignal, serviceId?: string): Promise<ClubIndexItem[]> {
  const value = await request('/api/club-schedules', 'GET', undefined, undefined, signal, serviceId);
  if (!Array.isArray(value) || !value.every((club) => isObject(club) && isString(club.id) && isString(club.name) && isString(club.branch))) {
    throw new Error('Server returned invalid data for /api/club-schedules.');
  }
  return value as ClubIndexItem[];
}

export async function loadLeaderReview(personId: string, clubId: string, cycleId: string, signal?: AbortSignal): Promise<Ballot[]> {
  const path = `/api/users/${encodeURIComponent(personId)}/clubs/${encodeURIComponent(clubId)}/cycles/${encodeURIComponent(cycleId)}/review`;
  const value = await request(path, 'GET', undefined, undefined, signal);
  if (!Array.isArray(value) || !value.every(isBallot) || value.some((ballot) => ballot.clubId !== clubId || ballot.cycleId !== cycleId)) {
    throw new Error('Server returned invalid leader review data.');
  }
  return value;
}

export type EnrolmentClub = { id: string; name: string; revision: number; enrolled: boolean };
export async function loadEnrolment(personId: string, signal?: AbortSignal): Promise<EnrolmentClub[]> {
  const path = `/api/users/${encodeURIComponent(personId)}/enrolment`;
  const value = await request(path, 'GET', undefined, undefined, signal);
  if (!Array.isArray(value) || !value.every((club) => isObject(club) && isString(club.id) && isString(club.name) &&
      Number.isSafeInteger(club.revision) && typeof club.revision === 'number' && club.revision >= 0 && typeof club.enrolled === 'boolean')) {
    throw new Error('Server returned invalid enrolment data.');
  }
  return value;
}

export async function saveRecord(kind: 'titles' | 'kits' | 'clubs', record: SharedTitle | SharedClub |
  Omit<SharedTitle, 'revision'> | Omit<SharedKit, 'status' | 'revision' | 'labelIds'> & { revision?: number } | Omit<SharedClub, 'revision'>): Promise<SharedTitle | SharedKit | SharedClub> {
  const exists = 'revision' in record;
  const value = await request(`/api/${kind}${exists ? `/${encodeURIComponent(record.id)}` : ''}`, exists ? 'PUT' : 'POST', record);
  const guard = kind === 'titles' ? isTitle : kind === 'kits' ? isKit : isClub;
  if (!guard(value)) throw new Error('Server saved the record but returned an invalid response; refresh before retrying.');
  return value;
}

export type DiscussionNotes = { notes: string; revision: number };
function isDiscussionNotes(value: unknown): value is DiscussionNotes {
  return isObject(value) && isString(value.notes) && isNumber(value.revision) && value.revision >= 1;
}

export async function loadDiscussionNotes(titleId: string, signal?: AbortSignal): Promise<DiscussionNotes> {
  const value = await request(`/api/titles/${encodeURIComponent(titleId)}/discussion-notes`, 'GET', undefined, undefined, signal);
  if (!isDiscussionNotes(value)) throw new Error('Server returned invalid discussion notes.');
  return value;
}

export async function saveDiscussionNotes(titleId: string, notes: string, revision: number): Promise<DiscussionNotes> {
  const value = await request(`/api/titles/${encodeURIComponent(titleId)}/discussion-notes`, 'PUT', { notes, revision });
  if (!isDiscussionNotes(value)) throw new Error('Server saved the notes but returned an invalid response; reload before retrying.');
  return value;
}

export async function deleteRecord(kind: 'titles' | 'kits', id: string, revision: number): Promise<void> {
  await request(`/api/${kind}/${encodeURIComponent(id)}`, 'DELETE', undefined, revision);
}

export async function saveKitLabel(value: Pick<KitLabel, 'category' | 'name'> | KitLabel): Promise<KitLabel> {
  const editing = 'id' in value;
  const result = await request(`/api/kit-labels${editing ? `/${encodeURIComponent(value.id)}` : ''}`, editing ? 'PUT' : 'POST', value);
  if (!isKitLabel(result)) throw new Error('Server returned an invalid label; refresh before retrying.');
  return result;
}

export type KitLabelDeletionPreview = { label: KitLabel; titleCount: number; kitCount: number; token: string };

export async function previewKitLabelDeletion(label: KitLabel): Promise<KitLabelDeletionPreview> {
  const value = await request(`/api/kit-labels/${encodeURIComponent(label.id)}/deletion-preview`, 'POST', { revision: label.revision });
  if (!isObject(value) || !isKitLabel(value.label) || value.label.id !== label.id || value.label.revision !== label.revision ||
      !isCount(value.titleCount) || !isCount(value.kitCount) || !isString(value.token) || !/^[a-f0-9]{64}$/.test(value.token)) {
    throw new Error('Server returned an invalid label deletion preview. Refresh before retrying.');
  }
  return { label: value.label, titleCount: value.titleCount, kitCount: value.kitCount, token: value.token };
}

export async function deleteKitLabel(preview: KitLabelDeletionPreview): Promise<void> {
  await request(`/api/kit-labels/${encodeURIComponent(preview.label.id)}`, 'DELETE',
    { token: preview.token, acknowledge: true }, preview.label.revision);
}

export type ClubDeletionPreview = {
  token: string;
  club: { id: string; name: string; revision: number };
  counts: { memberships: number; kitLinks: number; history: number; ballots: number; ballotMarks: number;
    finalizedGroups: number; finalizedRankings: number; slots: number; assignments: number; lockedAssignments: number };
  cycles: { id: string; name: string; status: Cycle['status']; slots: number; assignments: number; remainingSlots: number }[];
  affectedKits: { id: string; barcode: string; status: 'out' | 'reserved' }[];
};

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value >= 0;
}

function isClubDeletionPreview(value: unknown): value is ClubDeletionPreview {
  if (!isObject(value) || typeof value.token !== 'string' || !/^[a-f0-9]{64}$/.test(value.token) ||
      !isObject(value.club) || !isString(value.club.id) || !isString(value.club.name) || !isCount(value.club.revision) ||
      value.club.revision < 1 || !isObject(value.counts)) return false;
  const counts = value.counts;
  return ['memberships', 'kitLinks', 'history', 'ballots', 'ballotMarks', 'finalizedGroups', 'finalizedRankings', 'slots', 'assignments', 'lockedAssignments']
    .every((key) => isCount(counts[key])) &&
    Array.isArray(value.cycles) && value.cycles.every((cycle) => isObject(cycle) && isString(cycle.id) && isString(cycle.name) &&
      ['open', 'collecting', 'drafted', 'published'].includes(String(cycle.status)) &&
      isCount(cycle.slots) && isCount(cycle.assignments) && isCount(cycle.remainingSlots)) &&
    Array.isArray(value.affectedKits) && value.affectedKits.every((kit) => isObject(kit) && isString(kit.id) && isString(kit.barcode) &&
      (kit.status === 'out' || kit.status === 'reserved'));
}

export async function previewClubDeletion(id: string, revision: number): Promise<ClubDeletionPreview> {
  const value = await request(`/api/clubs/${encodeURIComponent(id)}/deletion-preview`, 'POST', { revision });
  if (!isClubDeletionPreview(value) || value.club.id !== id || value.club.revision !== revision) {
    throw new Error('Server returned an invalid club deletion preview. Refresh before retrying.');
  }
  return value;
}

export async function deleteClub(id: string, revision: number, token: string): Promise<void> {
  await request(`/api/clubs/${encodeURIComponent(id)}`, 'DELETE', { token, acknowledge: true }, revision);
}

export type ClubRuleUpdate = Pick<SharedClub, 'id' | 'revision' | 'cadence' | 'meetingWeekday' | 'meetingOccurrence' | 'pickupOffsetDays' | 'skipMonths'>;

export async function importClubDefinitions(rows: ClubRuleUpdate[]): Promise<SharedClub[]> {
  const value = await request('/api/clubs/import', 'POST', { rows });
  if (!Array.isArray(value) || value.length !== rows.length || !value.every(isClub) ||
      value.some((club, index) => club.id !== rows[index].id || club.revision !== rows[index].revision + 1)) {
    throw new Error('Server applied the import but returned an invalid response; refresh before retrying.');
  }
  return value;
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

export async function reopenCycle(id: string, revision: number): Promise<Cycle> {
  const value = await request(`/api/cycles/${encodeURIComponent(id)}/reopen`, 'POST', { revision, acknowledge: true });
  if (!isCycle(value)) throw new Error('Server returned an invalid cycle; refresh before retrying.');
  return value;
}

export async function discardCycleSchedule(id: string, revision: number): Promise<Cycle> {
  const value = await request(`/api/cycles/${encodeURIComponent(id)}/discard-schedule`, 'POST', { revision, acknowledge: true });
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

export async function finalizeRanking(cycleId: string, clubId: string, ranking: string[], revision: number, personId?: string): Promise<number> {
  return requireRevision(await request(`/api/cycles/${encodeURIComponent(cycleId)}/clubs/${encodeURIComponent(clubId)}/ranking`, 'PUT', { ranking, revision, ...(personId ? { personId } : {}) }));
}

export async function saveSchedule(cycleId: string, assignments: Assignment[], revision: number, publish: boolean): Promise<number> {
  return requireRevision(await request(`/api/cycles/${encodeURIComponent(cycleId)}/schedule`, 'PUT', { assignments, revision, publish }));
}

export type ScheduleValidation = { token: string; warnings: { slotId: string; message: string }[] };
export type ScheduleBasis = { cycles: { id: string; revision: number }[]; kits: { id: string; revision: number }[]; clubs: { id: string; revision: number }[]; settings: number };
export type SlotChanges = { newSlots: { id: string; clubId: string; month: string }[]; removedSlotIds: string[]; datedSlots: { id: string; meeting: string }[] };
export const noSlotChanges: SlotChanges = { newSlots: [], removedSlotIds: [], datedSlots: [] };

export async function validateSchedule(cycleId: string, assignments: Assignment[], revision: number, publish: boolean, unlockIds: string[], basis?: ScheduleBasis, slotChanges: SlotChanges = noSlotChanges): Promise<ScheduleValidation> {
  const value = await request(`/api/cycles/${encodeURIComponent(cycleId)}/schedule/validate`, 'POST', { assignments, revision, publish, unlockIds, ...slotChanges, ...(basis ? { basis } : {}) });
  if (!isObject(value) || !isString(value.token) || !Array.isArray(value.warnings) ||
      !value.warnings.every((warning: unknown) => isObject(warning) && isString(warning.slotId) && isString(warning.message))) {
    throw new Error('Server returned invalid schedule validation; refresh before retrying.');
  }
  return { token: value.token, warnings: value.warnings };
}

export async function saveValidatedSchedule(cycleId: string, assignments: Assignment[], revision: number, publish: boolean, unlockIds: string[], token: string, basis?: ScheduleBasis, slotChanges: SlotChanges = noSlotChanges): Promise<number> {
  return requireRevision(await request(`/api/cycles/${encodeURIComponent(cycleId)}/schedule`, 'PUT',
    { assignments, revision, publish, unlockIds, ...slotChanges, validationToken: token, acknowledge: true, ...(basis ? { basis } : {}) }));
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
