export type Role = 'admin' | 'staff' | 'member';
export type CycleStatus = 'open' | 'collecting' | 'drafted' | 'published';
export type KitStatus = 'available' | 'reserved' | 'out' | 'inspection' | 'unavailable';
export type Mark = 'selected' | 'read' | 'wont';

export interface Person {
  id: string;
  name: string;
  role: Role;
  revision: number;
}

export interface Membership {
  personId: string;
  clubId: string;
  leader: boolean;
}

export interface Title {
  id: string;
  name: string;
  author: string;
  isbn: string;
  pages: number;
  genres: string;
  notes: string;
  largePrint: boolean;
  audio: boolean;
}

export interface Kit {
  id: string;
  titleId: string;
  barcode: string;
  branch: string;
  copies: number;
  extras: string;
  components: string[];
  status: KitStatus;
}

export interface Club {
  id: string;
  name: string;
  branch: string;
  leaderId: string;
  size: number;
  cadence: string;
  pickup: 'pickup' | 'delivery';
  address: string;
  history: string[];
  revision: number;
  membershipRevision: number;
}

export interface Ballot {
  cycleId: string;
  clubId: string;
  personId: string;
  marks: Record<string, Mark>;
  ranking: string[];
  revision: number;
}

export interface Slot {
  id: string;
  clubId: string;
  meeting: string;
}

export interface Cycle {
  id: string;
  name: string;
  deadline: string;
  status: CycleStatus;
  slots: Slot[];
  finalized: Record<string, string[]>;
  revision: number;
}

export interface Assignment {
  id: string;
  cycleId: string;
  slotId: string;
  clubId: string;
  kitId: string;
  ready: string;
  meeting: string;
  due: string;
  locked: boolean;
}

export interface Event {
  id: string;
  kitId: string;
  action: 'reserved' | 'picked up' | 'delivered' | 'returned' | 'inspected' | 'resolved';
  at: string;
  notes: string;
  returnedCopies?: number;
  missingComponents?: string[];
}

export interface Library {
  name: string;
  branches: string[];
  loanDays: number;
  bufferDays: number;
  revision: number;
}

export interface Data {
  version: 1;
  library: Library;
  people: Person[];
  memberships: Membership[];
  titles: Title[];
  kits: Kit[];
  clubs: Club[];
  cycles: Cycle[];
  ballots: Ballot[];
  assignments: Assignment[];
  events: Event[];
  selectedPersonId: string;
}
