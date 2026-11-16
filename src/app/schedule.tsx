import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
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
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAllMessages, setShowAllMessages] = useState(false);
  const staff = person?.role === 'staff' || person?.role === 'admin';
  const personId = person?.id;
  const enrolledClubIds = useMemo(() => data.memberships.filter((membership) => membership.personId === personId).map((membership) => membership.clubId), [data.memberships, personId]);
  const cycleId = cycle?.id;
  const cycleStatus = cycle?.status;
  const assignments = useMemo(() => data.assignments
    .filter((a) => a.cycleId === cycleId && (staff || (cycleStatus === 'published' && enrolledClubIds.includes(a.clubId))))
    .sort((a, b) => a.meeting.localeCompare(b.meeting) || a.id.localeCompare(b.id)),
  [data.assignments, cycleId, cycleStatus, enrolledClubIds, staff]);
  const problems = useMemo(() => new Map(assignments.map((a) => [a.id, assignmentProblem(data, a, data.assignments) ?? null] as const)), [assignments, data]);
  const groups = useMemo(() => {
    const byMonth = new Map<string, Assignment[]>();
    for (const assignment of assignments) {
      const month = assignment.meeting.slice(0, 7);
      byMonth.set(month, [...(byMonth.get(month) ?? []), assignment]);
    }
    return [...byMonth.entries()];
  }, [assignments]);
  const firstReviewMonth = groups.find(([, items]) => items.some((a) => problems.get(a.id)))?.[0];
  const kitById = useMemo(() => new Map(data.kits.map((kit) => [kit.id, kit] as const)), [data.kits]);
  const titleById = useMemo(() => new Map(data.titles.map((title) => [title.id, title] as const)), [data.titles]);
  const clubById = useMemo(() => new Map(data.clubs.map((club) => [club.id, club] as const)), [data.clubs]);
  if (!person) return <Page title="Schedule"><Note>No demo user is selected on this device. Choose a user in Settings.</Note></Page>;
  if (!cycle) return <Page title="Schedule"><Note>No shared cycle is available. Staff can create one, or an administrator can run the explicit server demo seed.</Note></Page>;
  const cycleAssignments = data.assignments.filter((assignment) => assignment.cycleId === cycle.id);

  function renderRow(assignment: Assignment) {
    const kit = kitById.get(assignment.kitId);
    const title = kit ? titleById.get(kit.titleId) : undefined;
    const club = clubById.get(assignment.clubId);
    const problem = problems.get(assignment.id) ?? null;
    const expanded = expandedId === assignment.id;
    return <View key={assignment.id} style={{ marginTop: 8 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpandedId(expanded ? null : assignment.id)}>
        <Text style={{ fontWeight: '600' }}>{expanded ? '▾' : '▸'} {club?.name ?? 'Unavailable club'} · {title?.name ?? 'Unavailable title'} · {assignment.meeting}</Text>
        {problem && <Text style={{ color: '#a22525' }}>Needs review: {problem}</Text>}
      </Pressable>
      {expanded && <>
        <Text>{kit?.barcode ?? 'Unavailable kit'} · Ready {assignment.ready} · Meeting {assignment.meeting} · Due {assignment.due}</Text>
        {staff && (cycle.status === 'drafted' || (cycle.status === 'published' && !!problem && assignment.locked)) && <Actions>
          <Action title={assignment.locked ? 'Unlock' : 'Lock'} disabled={shared.saving} onPress={() => {
            const next = data.assignments.map((item) => item.id === assignment.id ? { ...item, locked: !item.locked } : item);
            persist(next, cycle.status === 'published', 'Assignment lock saved.');
          }} />
        </Actions>}
        {staff && !assignment.locked && (cycle.status === 'drafted' || (cycle.status === 'published' && !!problem)) && <>
          <Note>Choose a feasible replacement kit:</Note><Actions>{data.kits.filter((kitOption) => kitOption.id !== assignment.kitId &&
            !assignmentProblem(data, { ...assignment, kitId: kitOption.id }, data.assignments)).map((kitOption) => <Action key={kitOption.id} selected={replacement?.assignmentId === assignment.id && replacement.kitId === kitOption.id}
              title={`${kitOption.barcode} · ${titleById.get(kitOption.titleId)?.name ?? 'Unavailable title'}`}
              onPress={() => setReplacement({ assignmentId: assignment.id, kitId: kitOption.id })} />)}</Actions>
          {replacement?.assignmentId === assignment.id && <Actions><Action tone="primary" title="Confirm replacement" disabled={shared.saving} onPress={() => {
            const changed = { ...assignment, kitId: replacement.kitId };
            const next = data.assignments.map((item) => item.id === assignment.id ? changed : item);
            const conflict = assignmentProblem(data, changed, next);
            if (conflict) { setMessages([conflict]); return; }
            persist(next, cycle.status === 'published', 'Kit replacement saved.');
            setReplacement(null);
          }} /><Action title="Cancel replacement" onPress={() => setReplacement(null)} /></Actions>}
          {cycle.status === 'drafted' && <><Note>Swap with another unlocked meeting:</Note><Actions>{assignments.filter((other) =>
            other.id !== assignment.id && !other.locked && other.kitId !== assignment.kitId).map((other) => <Action key={other.id} selected={swap?.firstId === assignment.id && swap.secondId === other.id}
              title={`${clubById.get(other.clubId)?.name ?? 'Club'} · ${other.meeting}`}
              onPress={() => setSwap({ firstId: assignment.id, secondId: other.id })} />)}</Actions>
            {swap?.firstId === assignment.id && <Actions><Action tone="primary" title="Confirm swap" disabled={shared.saving} onPress={() => {
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
      </>}
    </View>;
  }

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
    <Card><Label>Choose a cycle</Label><Actions>{data.cycles.map((value) => <Action key={value.id} selected={value.id === cycle.id} title={`${value.name}${value.id === cycle.id ? ' ✓' : ''}`} onPress={() => {
      setSelectedId(value.id); setMessages([]); setReplacement(null); setSwap(null); setExpandedId(null); setShowAllMessages(false);
    }} />)}</Actions></Card>
    <Card><Label>{cycle.name} · {cycle.status}</Label>
      <Note>Schedule proposals use shared preferences, reading history, kit availability and lending settings. Drafts and publication are checked again by the server; revisions reject stale writes. Loans include a {data.library.bufferDays}-day turnaround buffer.</Note>
      {staff && <Actions>
        <Action title="Generate / re-run shared draft" disabled={shared.saving || (cycle.status !== 'collecting' && cycle.status !== 'drafted')} onPress={generate} />
        <Action tone="primary" title="Publish schedule" disabled={shared.saving || cycle.status !== 'drafted'} onPress={publish} />
        <Action title="Refresh shared schedule" disabled={shared.saving} onPress={() => { void shared.refresh().catch((error: unknown) => setMessages([error instanceof Error ? error.message : 'Unable to refresh.'])); }} />
      </Actions>}
      {!staff && enrolledClubIds.length === 0 && <Note>You are not enrolled in any clubs. Enrol in a club in Settings.</Note>}
      {(showAllMessages ? messages : messages.slice(0, 5)).map((message, index) => <Text key={`${message}-${index}`} style={{ color: '#a22525' }}>{message}</Text>)}
      {messages.length > 5 && <Actions><Action title={showAllMessages ? 'Show fewer messages' : `Show all messages (${messages.length})`} onPress={() => setShowAllMessages(!showAllMessages)} /></Actions>}
      {message ? <Text>{message}</Text> : null}
    </Card>
    {assignments.length === 0 && <Note>{staff ? 'No assignments yet.' : cycle.status === 'published' && enrolledClubIds.length > 0 ? 'No published schedule for your clubs.' : 'Only published schedules are visible to members.'}</Note>}
    {groups.map(([month, items]) => {
      const open = openGroups[month] ?? month === firstReviewMonth;
      const reviewCount = items.filter((assignment) => problems.get(assignment.id)).length;
      return <Card key={month}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpenGroups((current) => ({ ...current, [month]: !open }))}>
          <Label>{open ? '▾' : '▸'} {month} · {items.length} meetings{reviewCount ? ` · ${reviewCount} need review` : ''}</Label>
        </Pressable>
        {open && items.map((assignment) => renderRow(assignment))}
      </Card>;
    })}
  </Page>;
}
