import type { Data } from '../domain/model';
import type { SharedData } from './api';

export type LocalData = Pick<Data, 'version' | 'selectedPersonId'>;

export function initialLocalData(): LocalData {
  return { version: 1, selectedPersonId: '' };
}

export function combineData(local: LocalData, shared: SharedData): Data {
  const clubs = shared.clubs.map((club) => {
    const membership = shared.memberships.find((item) => item.clubId === club.id && item.leader);
    const history = shared.history.find((item) => item.clubId === club.id);
    const membershipRevision = shared.membershipRevisions.find((item) => item.clubId === club.id);
    return {
      ...club,
      leaderId: membership?.personId ?? '',
      history: history?.titles ?? [],
      membershipRevision: membershipRevision?.revision ?? 0,
    };
  });
  return {
    version: 1,
    library: shared.library,
    people: shared.people,
    memberships: shared.memberships,
    titles: shared.titles,
    kits: shared.kits,
    kitLabels: shared.kitLabels,
    clubs,
    cycles: shared.cycles,
    ballots: shared.ballots,
    assignments: shared.assignments,
    events: shared.events,
    selectedPersonId: local.selectedPersonId,
  };
}
