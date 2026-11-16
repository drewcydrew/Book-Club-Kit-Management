import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Action, Actions, Card, Label, Note, Page } from '../components/ui';
import { TitleCover } from '../components/title-cover';
import { assignmentProblem, draft } from '../domain/logic';
import type { Assignment } from '../domain/model';
import { saveSchedule } from '../state/api';
import { useShared } from '../state/shared';
import { useStore } from '../state/store';

const TILE_WIDTH = 110;

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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAllMessages, setShowAllMessages] = useState(false);
  const [selectedClubId, setSelectedClubId] = useState('');
  const staff = person?.role === 'staff' || person?.role === 'admin';
  const personId = person?.id;
  const enrolledClubIds = useMemo(() => data.memberships.filter((membership) => membership.personId === personId).map((membership) => membership.clubId), [data.memberships, personId]);
  const cycleId = cycle?.id;
  const clubChoices = useMemo(() => staff ? data.clubs : data.clubs.filter((club) => enrolledClubIds.includes(club.id)), [data.clubs, enrolledClubIds, staff]);
  const clubId = clubChoices.find((club) => club.id === selectedClubId)?.id ?? clubChoices[0]?.id;
  const visibleAssignments = useMemo(() => data.assignments.filter((a) => staff
    ? a.cycleId === cycleId
    : enrolledClubIds.includes(a.clubId) && data.cycles.some((c) => c.id === a.cycleId && c.status === 'published')),
  [data.assignments, data.cycles, cycleId, enrolledClubIds, staff]);
  const assignments = useMemo(() => visibleAssignments
    .filter((a) => a.clubId === clubId)
    .sort((a, b) => a.meeting.localeCompare(b.meeting) || a.cycleId.localeCompare(b.cycleId) || a.id.localeCompare(b.id)),
  [visibleAssignments, clubId]);
  const problems = useMemo(() => new Map(assignments.map((a) => [a.id, assignmentProblem(data, a, data.assignments) ?? null] as const)), [assignments, data]);
  const kitById = useMemo(() => new Map(data.kits.map((kit) => [kit.id, kit] as const)), [data.kits]);
  const titleById = useMemo(() => new Map(data.titles.map((title) => [title.id, title] as const)), [data.titles]);
  const clubById = useMemo(() => new Map(data.clubs.map((club) => [club.id, club] as const)), [data.clubs]);
  if (!person) return <Page title="Schedule"><Note>No demo user is selected on this device. Choose a user on the User tab.</Note></Page>;
  if (!cycle) return <Page title="Schedule"><Note>No shared cycle is available. Staff can create one, or an administrator can run the explicit server demo seed.</Note></Page>;
  const cycleAssignments = data.assignments.filter((assignment) => assignment.cycleId === cycle.id);

  function renderTile(assignment: Assignment) {
    const kit = kitById.get(assignment.kitId);
    const title = kit ? titleById.get(kit.titleId) : undefined;
    const problem = problems.get(assignment.id) ?? null;
    const expanded = expandedId === assignment.id;
    return <Pressable key={assignment.id} accessibilityRole="button" accessibilityLabel={`${title?.name ?? 'Unavailable title'}, ${assignment.meeting}`} accessibilityState={{ expanded }}
      onPress={() => setExpandedId(expanded ? null : assignment.id)} style={{ width: TILE_WIDTH, marginRight: 12, marginBottom: 12 }}>
      {title && <TitleCover coverUrl={title.coverUrl} isbn={title.isbn} style={{ width: TILE_WIDTH, height: TILE_WIDTH * 1.5, marginRight: 0, marginBottom: 6 }} />}
      <Text style={{ fontSize: 12, color: '#374151' }}>{assignment.meeting}</Text>
      <Text numberOfLines={2} style={{ fontWeight: '600' }}>{expanded ? '▾ ' : ''}{title?.name ?? 'Unavailable title'}</Text>
      {problem && <Text style={{ color: '#a22525', fontSize: 12 }}>Needs review</Text>}
    </Pressable>;
  }

  function renderDetail(assignment: Assignment) {
    const kit = kitById.get(assignment.kitId);
    const problem = problems.get(assignment.id) ?? null;
    return <View style={{ width: '100%', marginBottom: 12, padding: 12, borderRadius: 8, backgroundColor: '#f3f4f6' }}>
      <Text style={{ fontWeight: '600' }}>{clubById.get(assignment.clubId)?.name ?? 'Unavailable club'} · {titleById.get(kit?.titleId ?? '')?.name ?? 'Unavailable title'}</Text>
      {problem && <Text style={{ color: '#a22525' }}>Needs review: {problem}</Text>}
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
          {cycle.status === 'drafted' && <><Note>Swap with another unlocked meeting:</Note><Actions>{cycleAssignments.filter((other) =>
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
    {staff && <Card><Label>Choose a cycle</Label><Actions>{data.cycles.map((value) => <Action key={value.id} selected={value.id === cycle.id} title={`${value.name}${value.id === cycle.id ? ' ✓' : ''}`} onPress={() => {
      setSelectedId(value.id); setMessages([]); setReplacement(null); setSwap(null); setExpandedId(null); setShowAllMessages(false);
    }} />)}</Actions></Card>}
    <Card><Label>Choose a club</Label>
      {clubChoices.length === 0
        ? <Note>{staff ? 'No clubs exist yet.' : 'You are not enrolled in any clubs. Enrol in a club on the My clubs tab.'}</Note>
        : <Actions>{clubChoices.map((value) => <Action key={value.id} selected={value.id === clubId} title={value.name} onPress={() => {
          setSelectedClubId(value.id); setExpandedId(null);
        }} />)}</Actions>}
    </Card>
    {staff && <Card><Label>{cycle.name} · {cycle.status}</Label>
      <Note>Schedule proposals use shared preferences, reading history, kit availability and lending settings. Drafts and publication are checked again by the server; revisions reject stale writes. Loans include a {data.library.bufferDays}-day turnaround buffer.</Note>
      {staff && <Actions>
        <Action title="Generate / re-run shared draft" disabled={shared.saving || (cycle.status !== 'collecting' && cycle.status !== 'drafted')} onPress={generate} />
        <Action tone="primary" title="Publish schedule" disabled={shared.saving || cycle.status !== 'drafted'} onPress={publish} />
        <Action title="Refresh shared schedule" disabled={shared.saving} onPress={() => { void shared.refresh().catch((error: unknown) => setMessages([error instanceof Error ? error.message : 'Unable to refresh.'])); }} />
      </Actions>}
      {(showAllMessages ? messages : messages.slice(0, 5)).map((message, index) => <Text key={`${message}-${index}`} style={{ color: '#a22525' }}>{message}</Text>)}
      {messages.length > 5 && <Actions><Action title={showAllMessages ? 'Show fewer messages' : `Show all messages (${messages.length})`} onPress={() => setShowAllMessages(!showAllMessages)} /></Actions>}
      {message ? <Text>{message}</Text> : null}
    </Card>}
    {clubId && assignments.length === 0 && <Note>{staff ? 'No assignments for this club in this cycle yet.' : 'No published assignments for this club yet.'}</Note>}
    {assignments.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
      {assignments.map((assignment) => <React.Fragment key={assignment.id}>
        {renderTile(assignment)}
        {expandedId === assignment.id && renderDetail(assignment)}
      </React.Fragment>)}
    </View>}
  </Page>;
}
