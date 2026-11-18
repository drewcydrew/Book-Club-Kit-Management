import type { CycleStatus } from './model';

export interface VotingStatus {
  open: boolean;
  label: string;
  detail: string;
}

export interface PreferenceStatus extends VotingStatus {
  editable: boolean;
}

export function preferenceStatus(cycle: { status: CycleStatus; deadline: string }, day: string): PreferenceStatus {
  if (cycle.status === 'drafted' || cycle.status === 'published') {
    return {
      open: true,
      editable: true,
      label: `Schedule ${cycle.status}`,
      detail: 'Choices can still be updated. Existing assignments are not changed.',
    };
  }
  const voting = votingStatus(cycle, day);
  return { ...voting, editable: voting.open };
}

export function memberCycleStatus(cycle: { status: CycleStatus; deadline: string }, day: string): { label: string; detail: string; editable: boolean } {
  const status = preferenceStatus(cycle, day);
  if (cycle.status === 'open') return {
    label: 'Voting not open', detail: 'You can browse titles, but choices cannot be changed until voting opens.', editable: status.editable,
  };
  if (cycle.status === 'collecting') return {
    label: status.editable ? 'Collecting votes' : 'Collecting votes · deadline passed',
    detail: `${status.detail} ${status.editable ? 'You can add and rank titles.' : 'You can browse, but choices cannot be changed.'}`,
    editable: status.editable,
  };
  return {
    label: cycle.status === 'drafted' ? 'Schedule drafted' : 'Schedule published',
    detail: 'You can still change preferences. Existing schedule assignments will not change; changes clear any finalized club ranking.',
    editable: status.editable,
  };
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
