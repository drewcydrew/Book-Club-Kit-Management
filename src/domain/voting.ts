import type { CycleStatus } from './model';

export interface VotingStatus {
  open: boolean;
  label: string;
  detail: string;
}

export function votingStatus(cycle: { status: CycleStatus; deadline: string }, day: string): VotingStatus {
  if (cycle.status === 'open') {
    return { open: false, label: 'Voting has not opened yet', detail: 'Staff open member voting from Cycles.' };
  }
  if (cycle.status !== 'collecting') {
    return { open: false, label: 'Voting is closed', detail: 'Voting has ended for this cycle.' };
  }
  if (day > cycle.deadline) {
    return { open: false, label: 'Voting is closed', detail: `The deadline was ${cycle.deadline}.` };
  }
  const daysLeft = Math.round((Date.parse(`${cycle.deadline}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000);
  const remaining = daysLeft === 0 ? 'closes today' : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`;
  return { open: true, label: 'Voting is open', detail: `Closes ${cycle.deadline} · ${remaining}` };
}
