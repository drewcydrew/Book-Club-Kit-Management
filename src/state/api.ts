import type { Club, Kit, Title } from '../domain/model';

export type SharedTitle = Title & { revision: number };
export type SharedKit = Omit<Kit, 'status'> & { revision: number };
export type SharedClub = Omit<Club, 'leaderId' | 'history'> & { revision: number };
export type ClubKit = { clubId: string; kitId: string };
export type SharedData = { titles: SharedTitle[]; kits: SharedKit[]; clubs: SharedClub[]; links: ClubKit[] };

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isTitle(value: unknown): value is SharedTitle {
  return isObject(value) && typeof value.id === 'string' && typeof value.name === 'string' &&
    typeof value.author === 'string' && typeof value.isbn === 'string' && typeof value.pages === 'number' &&
    typeof value.genres === 'string' && typeof value.notes === 'string' && typeof value.largePrint === 'boolean' &&
    typeof value.audio === 'boolean' && typeof value.revision === 'number';
}
function isKit(value: unknown): value is SharedKit {
  return isObject(value) && typeof value.id === 'string' && typeof value.titleId === 'string' &&
    typeof value.barcode === 'string' && typeof value.branch === 'string' && typeof value.copies === 'number' &&
    typeof value.extras === 'string' && Array.isArray(value.components) && value.components.every((item: unknown) => typeof item === 'string') &&
    typeof value.revision === 'number';
}
function isClub(value: unknown): value is SharedClub {
  return isObject(value) && typeof value.id === 'string' && typeof value.name === 'string' &&
    typeof value.branch === 'string' && typeof value.size === 'number' && typeof value.cadence === 'string' &&
    (value.pickup === 'pickup' || value.pickup === 'delivery') && typeof value.address === 'string' && typeof value.revision === 'number';
}
function isLink(value: unknown): value is ClubKit {
  return isObject(value) && typeof value.clubId === 'string' && typeof value.kitId === 'string';
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

async function list<T>(path: string, guard: (value: unknown) => value is T): Promise<T[]> {
  const value = await request(path);
  if (!Array.isArray(value) || !value.every(guard)) throw new Error(`Server returned invalid data for ${path}.`);
  return value;
}

export async function loadShared(): Promise<SharedData> {
  const [titles, kits, clubs, links] = await Promise.all([
    list('/api/titles', isTitle), list('/api/kits', isKit), list('/api/clubs', isClub), list('/api/club-kits', isLink),
  ]);
  return { titles, kits, clubs, links };
}

export async function saveRecord(kind: 'titles' | 'kits' | 'clubs', record: SharedTitle | SharedKit | SharedClub | Omit<SharedTitle, 'revision'> | Omit<SharedKit, 'revision'> | Omit<SharedClub, 'revision'>): Promise<SharedTitle | SharedKit | SharedClub> {
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
