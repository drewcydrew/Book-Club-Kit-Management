import { useEffect, useState } from 'react';
import { ballotKey } from '../domain/ballot-draft';
import type { Ballot } from '../domain/model';

export type SyncStatus = { state: 'idle' | 'saving' | 'saved' | 'error'; message: string | null; key?: string };

export class BallotSync {
  private pending = new Map<string, Ballot>();
  private revisions = new Map<string, number>();
  private inFlight = new Set<string>();
  private running: Promise<void> | null = null;
  private failure: Error | null = null;
  private save: (ballot: Ballot) => Promise<Ballot> = async () => { throw new Error('Choices cannot be saved yet.'); };
  private onIdle: () => void = () => undefined;

  constructor(private report: (status: SyncStatus) => void) {}

  configure(save: (ballot: Ballot) => Promise<Ballot>, onIdle: () => void): void {
    this.save = save;
    this.onIdle = onIdle;
  }

  enqueue(ballot: Ballot): void {
    const key = ballotKey(ballot);
    this.revisions.set(key, Math.max(this.revisions.get(key) ?? 0, ballot.revision));
    this.pending.set(key, ballot);
    this.report({ state: 'saving', message: null });
    void this.drain().catch(() => undefined);
  }

  flush(): Promise<void> {
    return this.drain();
  }

  private drain(): Promise<void> {
    if (this.running) return this.running;
    this.failure = null;
    this.running = this.run().finally(() => { this.running = null; });
    return this.running;
  }

  private async run(): Promise<void> {
    while (this.pending.size > 0) {
      const [key, ballot] = this.pending.entries().next().value as [string, Ballot];
      this.pending.delete(key);
      this.inFlight.add(key);
      try {
        const saved = await this.save({ ...ballot, revision: this.revisions.get(key) ?? ballot.revision });
        this.revisions.set(key, saved.revision);
      } catch (reason: unknown) {
        this.failure = reason instanceof Error ? reason : new Error('Unable to save choices.');
        if (!this.pending.has(key)) this.pending.set(key, ballot);
        this.report({ state: 'error', message: `${this.failure.message} Refresh before retrying.`, key });
        throw this.failure;
      } finally {
        this.inFlight.delete(key);
      }
    }
    this.report({ state: 'saved', message: null });
    this.onIdle();
  }
}

export function useBallotSync(save: (ballot: Ballot) => Promise<Ballot>, onIdle: () => void, onFailure: () => void) {
  const [status, setStatus] = useState<SyncStatus>({ state: 'idle', message: null });
  const [sync] = useState(() => new BallotSync((next) => {
    setStatus(next);
    if (next.state === 'error') onFailure();
  }));
  useEffect(() => { sync.configure(save, onIdle); });
  return { status, enqueue: (ballot: Ballot) => sync.enqueue(ballot), flush: () => sync.flush() };
}
