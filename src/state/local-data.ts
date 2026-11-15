import type { Club, Data, Kit } from '../domain/model';
import { seed } from '../domain/seed';
import type { SharedData } from './api';

type LocalKit = Pick<Kit, 'id' | 'status'>;
type LocalClub = Pick<Club, 'id' | 'leaderId' | 'history'>;
export type LocalData = Omit<Data, 'titles' | 'kits' | 'clubs'> & { kits: LocalKit[]; clubs: LocalClub[] };

export function initialLocalData(): LocalData {
  const { titles: _titles, kits, clubs, ...rest } = seed();
  return {
    ...rest,
    kits: kits.map(({ id, status }) => ({ id, status })),
    clubs: clubs.map(({ id, leaderId, history }) => ({ id, leaderId, history })),
  };
}

export function combineData(local: LocalData, shared: SharedData): Data {
  return {
    ...local,
    titles: shared.titles,
    kits: shared.kits.map((kit) => ({ ...kit, status: local.kits.find((item) => item.id === kit.id)?.status ?? 'available' })),
    clubs: shared.clubs.map((club) => {
      const current = local.clubs.find((item) => item.id === club.id);
      return { ...club, leaderId: current?.leaderId ?? '', history: current?.history ?? [] };
    }),
  };
}

export function localFromData(data: Data, previous: LocalData): LocalData {
  const { titles: _titles, kits, clubs, ...rest } = data;
  const kitIds = new Set(kits.map((kit) => kit.id));
  const clubIds = new Set(clubs.map((club) => club.id));
  return {
    ...rest,
    kits: [...previous.kits.filter((kit) => !kitIds.has(kit.id)), ...kits.map(({ id, status }) => ({ id, status }))],
    clubs: [...previous.clubs.filter((club) => !clubIds.has(club.id)), ...clubs.map(({ id, leaderId, history }) => ({ id, leaderId, history }))],
  };
}
