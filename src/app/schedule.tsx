import React, { useState } from 'react';
import { Text } from 'react-native';
import { Action, Actions, Card, Label, Note, Page } from '../components/ui';
import { assignmentProblem, draft } from '../domain/logic';
import type { Assignment } from '../domain/model';
import { saveSchedule } from '../state/api';
import { useShared } from '../state/shared';
import { useStore } from '../state/store';

export default function Schedule() {
  const { data } = useStore();
  const shared = useShared();
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  const [selectedId, setSelectedId] = useState(data.cycles[0]?.id ?? '');
  const [messages, setMessages] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [replacement, setReplacement] = useState<{ assignmentId: string; kitId: string } | null>(null);
  const [swap, setSwap] = useState<{ firstId: string; secondId: string } | null>(null);
  const cycle = data.cycles.find((c) => c.id === selectedId) ?? data.cycles[0];
  if (!person) return <Page title="Schedule"><Note>No demo user is selected on this device. Choose a user and club in Settings.</Note></Page>;
  if (!cycle) return <Page title="Schedule"><Note>No shared cycle is available. Staff can create one, or an administrator can run the explicit server demo seed.</Note></Page>;
  const staff = person.role === 'staff' || person.role === 'admin';
  const isMember = data.memberships.some((membership) =>
    membership.personId === person.id && membership.clubId === data.selectedClubId);
  const assignments = data.assignments.filter((a) => a.cycleId === cycle.id &&
    (staff || (cycle.status === 'published' && isMember && a.clubId === data.selectedClubId)));
  const cycleAssignments = data.assignments.filter((assignment) => assignment.cycleId === cycle.id);

  function persist(assignmentsToSave: Assignment[], publish: boolean, success: string, problems: string[] = []) {
    setMessage('');
    void shared.mutate(() => saveSchedule(cycle.id, assignmentsToSave.filter((a) => a.cycleId === cycle.id), cycle.revision, publish))
      .then(() => { setMessages(problems); setMessage(success); })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Unable to save schedule.'));
  }

  function generate() {
    if (cycle.status !== 'collecting' && cycle.status !== 'drafted') return;
    const result = draft(data, cycle);
    setMessages(result.problems);
    if (result.problems.some((problem) => problem.startsWith('Locked assignment'))) return;
    persist(result.assignments, false, 'Shared schedule draft saved.', result.problems);
  }

  function publish() {
    const errors = cycleAssignments.map((assignment) => assignmentProblem(data, assignment, data.assignments))
      .filter((value): value is string => !!value);
    if (cycle.slots.length === 0 || cycleAssignments.length !== cycle.slots.length ||
        new Set(cycleAssignments.map((assignment) => assignment.slotId)).size !== cycle.slots.length) {
      errors.push('Every meeting slot must have exactly one assignment before publishing.');
    }
    if (errors.length) { setMessages(errors); return; }
    persist(cycleAssignments, true, 'Shared schedule published.');
  }

  return <Page title="Schedule">
    <Card><Label>Choose a cycle</Label><Actions>{data.cycles.map((value) => <Action key={value.id} title={`${value.name}${value.id === cycle.id ? ' ✓' : ''}`} onPress={() => {
      setSelectedId(value.id); setMessages([]); setReplacement(null); setSwap(null);
    }} />)}</Actions></Card>
    <Card><Label>{cycle.name} · {cycle.status}</Label>
      <Note>Schedule proposals use shared preferences, reading history, kit availability and lending settings. Drafts and publication are checked again by the server; revisions reject stale writes. Loans include a {data.library.bufferDays}-day turnaround buffer.</Note>
      {staff && <Actions>
        <Action title="Generate / re-run shared draft" disabled={shared.saving || (cycle.status !== 'collecting' && cycle.status !== 'drafted')} onPress={generate} />
        <Action title="Publish schedule" disabled={shared.saving || cycle.status !== 'drafted'} onPress={publish} />
        <Action title="Refresh shared schedule" disabled={shared.saving} onPress={() => { void shared.refresh().catch((error: unknown) => setMessages([error instanceof Error ? error.message : 'Unable to refresh.'])); }} />
      </Actions>}
      {!staff && !isMember && <Note>This user is not a member of the selected club. Choose a club membership in Settings.</Note>}
      {messages.map((message, index) => <Text key={`${message}-${index}`} style={{ color: '#a22525' }}>{message}</Text>)}
      {message ? <Text>{message}</Text> : null}
    </Card>
    {assignments.length === 0 && <Note>{staff ? 'No assignments yet.' : cycle.status === 'published' && isMember ? 'No published schedule for this club.' : 'Only published schedules are visible to members.'}</Note>}
    {assignments.map((assignment) => {
      const kit = data.kits.find((item) => item.id === assignment.kitId);
      const title = data.titles.find((item) => item.id === kit?.titleId);
      const club = data.clubs.find((item) => item.id === assignment.clubId);
      const problem = assignmentProblem(data, assignment, data.assignments);
      return <Card key={assignment.id}><Label>{club?.name ?? 'Unavailable club'} · {title?.name ?? 'Unavailable title'}</Label>
        <Text>{kit?.barcode ?? 'Unavailable kit'} · Ready {assignment.ready} · Meeting {assignment.meeting} · Due {assignment.due}</Text>
        {problem && <Text style={{ color: '#a22525' }}>Needs review: {problem}</Text>}
        {staff && (cycle.status === 'drafted' || (cycle.status === 'published' && !!problem && assignment.locked)) && <Actions>
          <Action title={assignment.locked ? 'Unlock' : 'Lock'} disabled={shared.saving} onPress={() => {
            const next = data.assignments.map((item) => item.id === assignment.id ? { ...item, locked: !item.locked } : item);
            persist(next, cycle.status === 'published', 'Assignment lock saved.');
          }} />
        </Actions>}
        {staff && !assignment.locked && (cycle.status === 'drafted' || (cycle.status === 'published' && !!problem)) && <>
          <Note>Choose a feasible replacement kit:</Note><Actions>{data.kits.filter((kitOption) => kitOption.id !== assignment.kitId &&
            !assignmentProblem(data, { ...assignment, kitId: kitOption.id }, data.assignments)).map((kitOption) => <Action key={kitOption.id}
              title={`${kitOption.barcode} · ${data.titles.find((item) => item.id === kitOption.titleId)?.name ?? 'Unavailable title'}`}
              onPress={() => setReplacement({ assignmentId: assignment.id, kitId: kitOption.id })} />)}</Actions>
          {replacement?.assignmentId === assignment.id && <Actions><Action title="Confirm replacement" disabled={shared.saving} onPress={() => {
            const changed = { ...assignment, kitId: replacement.kitId };
            const next = data.assignments.map((item) => item.id === assignment.id ? changed : item);
            const conflict = assignmentProblem(data, changed, next);
            if (conflict) { setMessages([conflict]); return; }
            persist(next, cycle.status === 'published', 'Kit replacement saved.');
            setReplacement(null);
          }} /><Action title="Cancel replacement" onPress={() => setReplacement(null)} /></Actions>}
          {cycle.status === 'drafted' && <><Note>Swap with another unlocked meeting:</Note><Actions>{assignments.filter((other) =>
            other.id !== assignment.id && !other.locked && other.kitId !== assignment.kitId).map((other) => <Action key={other.id}
              title={`${data.clubs.find((item) => item.id === other.clubId)?.name ?? 'Club'} · ${other.meeting}`}
              onPress={() => setSwap({ firstId: assignment.id, secondId: other.id })} />)}</Actions>
            {swap?.firstId === assignment.id && <Actions><Action title="Confirm swap" disabled={shared.saving} onPress={() => {
              const first = data.assignments.find((item) => item.id === swap.firstId);
              const second = data.assignments.find((item) => item.id === swap.secondId);
              if (!first || !second || first.locked || second.locked) { setMessages(['Assignments no longer exist or are locked. Refresh and retry.']); return; }
              const firstChanged = { ...first, kitId: second.kitId };
              const secondChanged = { ...second, kitId: first.kitId };
              const next = data.assignments.map((item) => item.id === first.id ? firstChanged : item.id === second.id ? secondChanged : item);
              const conflict = assignmentProblem(data, firstChanged, next) || assignmentProblem(data, secondChanged, next);
              if (conflict) { setMessages([conflict]); return; }
              persist(next, false, 'Kit swap saved.');
              setSwap(null);
            }} /><Action title="Cancel swap" onPress={() => setSwap(null)} /></Actions>}
          </>}
        </>}
      </Card>;
    })}
  </Page>;
}
