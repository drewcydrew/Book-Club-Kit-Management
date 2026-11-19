import type { Ballot, Mark } from './model';

export function ballotKey(ballot: Pick<Ballot, 'cycleId' | 'clubId' | 'personId'>): string {
  return `${ballot.cycleId}:${ballot.clubId}:${ballot.personId}`;
}

export function emptyBallot(cycleId: string, clubId: string, personId: string): Ballot {
  return { cycleId, clubId, personId, marks: {}, ranking: [], revision: 0 };
}

export function sameBallotChoices(a: Ballot, b: Ballot): boolean {
  const keys = Object.keys(a.marks);
  return keys.length === Object.keys(b.marks).length
    && keys.every((id) => a.marks[id] === b.marks[id])
    && a.ranking.length === b.ranking.length
    && a.ranking.every((id, index) => id === b.ranking[index]);
}

export function setMark(ballot: Ballot, titleId: string, value: Mark | null): Ballot {
  const marks = { ...ballot.marks };
  if (value) marks[titleId] = value;
  else delete marks[titleId];
  const ranking = ballot.ranking.filter((id) => id !== titleId);
  if (value === 'selected') ranking.push(titleId);
  return { ...ballot, marks, ranking };
}

export function moveInRanking(ballot: Ballot, from: number, to: number): Ballot {
  const last = ballot.ranking.length - 1;
  if (from === to || from < 0 || to < 0 || from > last || to > last) return ballot;
  const ranking = [...ballot.ranking];
  const [item] = ranking.splice(from, 1);
  ranking.splice(to, 0, item);
  return { ...ballot, ranking };
}

export function undoDismissal(ballot: Ballot, titleId: string, dismissedAs: 'wont' | 'read', previous: Mark | null, previousIndex: number): Ballot {
  if (ballot.marks[titleId] !== dismissedAs) return ballot;
  const restored = setMark(ballot, titleId, previous);
  if (previous !== 'selected') return restored;
  return moveInRanking(restored, restored.ranking.length - 1, Math.max(0, Math.min(previousIndex, restored.ranking.length - 1)));
}
