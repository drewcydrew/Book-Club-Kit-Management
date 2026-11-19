import { ballotKey, sameBallotChoices } from '../domain/ballot-draft';
import type { Ballot } from '../domain/model';
import { ApiError } from './api';

export type StagedBallot = { ballot: Ballot; baseline: Ballot; issue?: string };
export type StagedBallots = Record<string, StagedBallot>;

export function stageBallot(drafts: StagedBallots, next: Ballot, baseline: Ballot): StagedBallots {
  const key = ballotKey(next);
  const previous = drafts[key];
  const original = previous?.baseline ?? baseline;
  const updated = { ...drafts };
  if (sameBallotChoices(next, original) && !previous?.issue) delete updated[key];
  else updated[key] = { ballot: { ...next, revision: original.revision }, baseline: original, issue: previous?.issue };
  return updated;
}

export function reconcileBallot(entry: StagedBallot, latest: Ballot): 'saved' | 'retry' | 'conflict' {
  if (sameBallotChoices(latest, entry.ballot) && latest.revision > entry.baseline.revision) return 'saved';
  if (latest.revision === entry.baseline.revision && sameBallotChoices(latest, entry.baseline)) return 'retry';
  return 'conflict';
}

export async function saveStagedBallots(
  keys: string[],
  getDrafts: () => StagedBallots,
  updateDrafts: (drafts: StagedBallots) => void,
  save: (ballot: Ballot) => Promise<unknown>,
  refresh: () => Promise<{ ballots: Ballot[] }>,
): Promise<{ savedCount: number; problem?: { ballot: Ballot; issue: string } }> {
  let savedCount = 0;
  for (const key of keys) {
    const entry = getDrafts()[key];
    if (!entry) continue;
    if (entry.issue) return { savedCount, problem: { ballot: entry.ballot, issue: entry.issue } };
    let issue: string | undefined;
    try {
      await save(entry.ballot);
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : 'Unable to save draft.';
      issue = reason instanceof ApiError && reason.status < 500
        ? `Save rejected: ${message} Refresh to reconcile before retrying.`
        : `Save outcome is uncertain: ${message} Refresh to reconcile before retrying.`;
    }
    if (!issue) {
      savedCount += 1;
      try {
        const refreshed = await refresh();
        const latest = refreshed.ballots.find((item) => ballotKey(item) === key);
        if (!latest || !sameBallotChoices(latest, entry.ballot)) {
          issue = 'The shared ballot changed after saving. Refresh to reconcile or discard this draft.';
        }
      } catch (reason: unknown) {
        const message = reason instanceof Error ? reason.message : 'Unable to refresh.';
        issue = `The save succeeded, but refresh failed: ${message} Refresh to reconcile before retrying.`;
      }
    }
    if (issue) {
      updateDrafts({ ...getDrafts(), [key]: { ...entry, issue } });
      return { savedCount, problem: { ballot: entry.ballot, issue } };
    }
    const remaining = { ...getDrafts() };
    delete remaining[key];
    updateDrafts(remaining);
  }
  return { savedCount };
}
