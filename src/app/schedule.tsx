import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Action, Actions, Card, Label, Note, Page } from '../components/ui';
import { ScheduleGridView } from '../components/schedule-grid';
import { TitleCover } from '../components/title-cover';
import { memberSchedule, scheduleGrid } from '../domain/cycle-overview';
import { today } from '../domain/dates';
import { assignmentProblem, draft } from '../domain/logic';
import type { Assignment } from '../domain/model';
import { saveSchedule } from '../state/api';
import { useShared } from '../state/shared';
import { useStore } from '../state/store';

const TILE_WIDTH = 110;

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = key(item);
    groups.set(group, [...(groups.get(group) ?? []), item]);
  }
  return groups;
}

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
  const [viewMode, setViewMode] = useState<'overview' | 'upcoming' | 'past' | 'grid' | 'list'>(person?.role === 'member' ? 'upcoming' : 'overview');
  const [preview, setPreview] = useState<{ cycleId: string; revision: number; assignments: Assignment[]; problems: string[] } | null>(null);
  const [gridClubIds, setGridClubIds] = useState<string[] | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cycleOpen, setCycleOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [expandedClubs, setExpandedClubs] = useState<string[]>([]);
  const staff = person?.role === 'staff' || person?.role === 'admin';
  const mode = staff ? (viewMode === 'upcoming' || viewMode === 'past' ? 'overview' : viewMode) : (viewMode === 'overview' ? 'upcoming' : viewMode);
  const personId = person?.id;
  const enrolledClubIds = data.memberships.filter((membership) => membership.personId === personId).map((membership) => membership.clubId);
  const cycleId = cycle?.id;
  const clubChoices = staff ? data.clubs : data.clubs.filter((club) => enrolledClubIds.includes(club.id));
  const clubId = clubChoices.find((club) => club.id === selectedClubId)?.id ?? clubChoices[0]?.id;
  const visibleAssignments = data.assignments.filter((a) => staff
    ? a.cycleId === cycleId
    : enrolledClubIds.includes(a.clubId) && data.cycles.some((c) => c.id === a.cycleId && c.status === 'published'));
  const assignments = visibleAssignments
    .filter((a) => a.clubId === clubId)
    .sort((a, b) => a.meeting.localeCompare(b.meeting) || a.cycleId.localeCompare(b.cycleId) || a.id.localeCompare(b.id));
  const kitById = new Map(data.kits.map((kit) => [kit.id, kit] as const));
  const titleById = new Map(data.titles.map((title) => [title.id, title] as const));
  const clubById = new Map(data.clubs.map((club) => [club.id, club] as const));
  const publishedCycles = data.cycles.filter((c) => c.status === 'published' &&
    (c.slots.some((slot) => enrolledClubIds.includes(slot.clubId)) ||
      data.assignments.some((a) => a.cycleId === c.id && enrolledClubIds.includes(a.clubId))));
  const gridCycle = staff ? cycle : publishedCycles.find((c) => c.id === selectedId) ?? publishedCycles[0];
  const gridClubs = gridClubIds ? clubChoices.filter((club) => gridClubIds.includes(club.id)) : clubChoices;
  const problemClubs = new Set(mode === 'list' ? [clubId] : gridClubs.map((club) => club.id));
  const problems = new Map((staff ? visibleAssignments.filter((assignment) => problemClubs.has(assignment.clubId)) : [])
    .map((assignment) => [assignment.id, assignmentProblem(data, assignment, data.assignments) ?? null] as const));
  const gridClubKey = gridClubs.map((club) => club.id).join('|');
  const grid = mode === 'grid' && gridCycle
    ? scheduleGrid(data, gridCycle, gridClubKey ? gridClubKey.split('|') : [], data.assignments.filter((a) => a.cycleId === gridCycle.id))
    : null;
  const previewGrid = preview && cycle && staff ? scheduleGrid(data, cycle, gridClubKey ? gridClubKey.split('|') : [], preview.assignments) : null;
  const memberMeetings = !staff && (mode === 'upcoming' || mode === 'past')
    ? memberSchedule(data, gridClubKey ? gridClubKey.split('|') : [], today(), mode) : [];
  if (!person) return <Page title="Schedule"><Note>No demo user is selected on this device. Choose a user on the User tab.</Note></Page>;
  if (!cycle) return <Page title="Schedule"><Note>No shared cycle is available. Staff can create one, or an administrator can run the explicit server demo seed.</Note></Page>;
  const cycleAssignments = data.assignments.filter((assignment) => assignment.cycleId === cycle.id);
  const assignedSlotIds = new Set(assignments.map((assignment) => assignment.slotId));
  const unassignedSlots = staff && clubId ? cycle.slots.filter((slot) => slot.clubId === clubId && !assignedSlotIds.has(slot.id)) : [];
  const assignmentsByMonth = groupBy(assignments, (assignment) => assignment.meeting.slice(0, 7));
  const unassignedByMonth = groupBy(unassignedSlots, (slot) => slot.month);
  const monthKeys = [...new Set([...assignmentsByMonth.keys(), ...unassignedByMonth.keys()])].sort();

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

  function persist(assignmentsToSave: Assignment[], publish: boolean, success: string, problems: string[] = []): Promise<boolean> {
    setMessage('');
    return shared.mutate(() => saveSchedule(cycle.id, assignmentsToSave.filter((a) => a.cycleId === cycle.id), cycle.revision, publish))
      .then(() => { setMessages(problems); setMessage(success); return true; })
      .catch((error: unknown) => { setMessage(error instanceof Error ? error.message : 'Unable to save schedule.'); return false; });
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
    <Card>
      <Label>{staff ? `${cycle.name} · ${cycle.status}` : 'Your published schedule'}</Label>
      <Actions>
        {staff && data.cycles.length > 1 && <Action title={cycleOpen ? 'Close cycles' : 'Change cycle'} onPress={() => setCycleOpen(!cycleOpen)} />}
        {staff && <Action title={toolsOpen ? 'Hide schedule actions' : 'Schedule actions'} onPress={() => setToolsOpen(!toolsOpen)} />}
      </Actions>
      {staff && cycleOpen && <Actions>{data.cycles.map((value) => <Action key={value.id} selected={value.id === cycle.id} disabled={shared.saving} title={value.name} onPress={() => {
        if (value.id !== cycle.id) {
          setSelectedId(value.id); setMessages([]); setMessage(preview ? 'Preview discarded after changing cycle.' : '');
          setPreview(null); setReplacement(null); setSwap(null); setExpandedId(null); setShowAllMessages(false);
        }
        setCycleOpen(false);
      }} />)}</Actions>}
      {staff && toolsOpen && <>
        <Note>Preview uses current preferences and availability. Changes are checked by the server; loans include a {data.library.bufferDays}-day turnaround buffer.</Note>
        {cycle.status === 'collecting' && cycleAssignments.length > 0 && <Note>
          Existing assignments may be provisional. Generating a draft can replace unlocked assignments; locked assignments are retained and may need attention. Checked-out kits or reading history can prevent drafting or publication.
        </Note>}
        <Actions>
          <Action title="Preview schedule" disabled={shared.saving || (cycle.status !== 'collecting' && cycle.status !== 'drafted')} onPress={() => {
            const result = draft(data, cycle);
            setPreview({ cycleId: cycle.id, revision: cycle.revision, assignments: result.assignments, problems: result.problems });
            setMessages([]); setMessage('');
          }} />
          <Action title="Generate / re-run shared draft" disabled={!!preview || shared.saving || (cycle.status !== 'collecting' && cycle.status !== 'drafted')} onPress={generate} />
          <Action tone="primary" title="Publish schedule" disabled={!!preview || shared.saving || cycle.status !== 'drafted'} onPress={publish} />
          <Action title="Refresh shared schedule" disabled={shared.saving} onPress={() => { void shared.refresh().catch((error: unknown) => setMessages([error instanceof Error ? error.message : 'Unable to refresh.'])); }} />
        </Actions>
      </>}
      {staff && preview && <>
        <Note>{preview.revision !== cycle.revision || preview.cycleId !== cycle.id ? 'This preview is out of date. Discard it and preview again.' : 'Preview only: nothing is saved until you confirm.'}</Note>
        <Actions>
          <Action tone="primary" title="Confirm and save draft" disabled={shared.saving || preview.revision !== cycle.revision || preview.cycleId !== cycle.id || preview.problems.some((problem) => problem.startsWith('Locked assignment'))} onPress={() => {
            void persist(preview.assignments, false, 'Shared schedule draft saved.', preview.problems).then((saved) => { if (saved) setPreview(null); });
          }} />
          <Action title="Discard preview" disabled={shared.saving} onPress={() => setPreview(null)} />
        </Actions>
        {preview.problems.map((problem, index) => <Text key={`${problem}-${index}`} style={{ color: '#a22525' }}>{problem}</Text>)}
      </>}
      {staff && (showAllMessages ? messages : messages.slice(0, 5)).map((item, index) => <Text key={`${item}-${index}`} style={{ color: '#a22525' }}>{item}</Text>)}
      {staff && messages.length > 5 && <Action title={showAllMessages ? 'Show fewer messages' : `Show all messages (${messages.length})`} onPress={() => setShowAllMessages(!showAllMessages)} />}
      {staff && message ? <Text>{message}</Text> : null}
      <Actions>
        {staff ? <Action selected={mode === 'overview'} title="Overview" onPress={() => setViewMode('overview')} /> : <>
          <Action selected={mode === 'upcoming'} title="Upcoming" onPress={() => setViewMode('upcoming')} />
          <Action selected={mode === 'past'} title="Past" onPress={() => setViewMode('past')} />
        </>}
        <Action selected={mode === 'grid'} title="Grid" onPress={() => setViewMode('grid')} />
        <Action selected={mode === 'list'} title="List by club" onPress={() => setViewMode('list')} />
      </Actions>
    </Card>
    {mode !== 'list' ? <Card>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: filtersOpen }} onPress={() => setFiltersOpen(!filtersOpen)}>
        <Label>{filtersOpen ? '▾' : '▸'} {staff ? 'Clubs shown' : 'Your clubs'} · {gridClubs.length} of {clubChoices.length}</Label>
      </Pressable>
      {clubChoices.length === 0
        ? <Note>{staff ? 'No clubs exist yet.' : 'You are not enrolled in any clubs. Enrol in a club on the My clubs tab.'}</Note>
        : filtersOpen && <>
          <Actions>
            <Action title={gridClubs.length === clubChoices.length ? 'Hide all' : 'Show all'} onPress={() => {
              setGridClubIds(gridClubs.length === clubChoices.length ? [] : clubChoices.map((club) => club.id));
            }} />
          </Actions>
          <Actions>{clubChoices.map((value) => <Action key={value.id} selected={gridClubs.some((club) => club.id === value.id)} title={value.name} onPress={() => {
            const current = gridClubs.map((club) => club.id);
            setGridClubIds(current.includes(value.id) ? current.filter((id) => id !== value.id) : [...current, value.id]);
          }} />)}</Actions>
        </>}
    </Card> : <Card><Label>Choose a club</Label>
      {clubChoices.length === 0
        ? <Note>{staff ? 'No clubs exist yet.' : 'You are not enrolled in any clubs. Enrol in a club on the My clubs tab.'}</Note>
        : <Actions>{clubChoices.map((value) => <Action key={value.id} selected={value.id === clubId} title={value.name} onPress={() => {
          setSelectedClubId(value.id); setExpandedId(null);
        }} />)}</Actions>}
    </Card>}
    {staff && preview && previewGrid && <>
        <Label>Proposed schedule</Label>
        <ScheduleGridView grid={previewGrid} clubNameFor={(clubId) => clubById.get(clubId)?.name ?? 'Unavailable club'}
          titleFor={(assignment) => titleById.get(kitById.get(assignment.kitId)?.titleId ?? '')}
          expandedId={null} showProblems onToggle={() => undefined} renderDetail={() => null} />
    </>}
    {!staff && (mode === 'upcoming' || mode === 'past') && <Card>
      <Label>{mode === 'upcoming' ? 'Upcoming meetings' : 'Past meetings'}</Label>
      {clubChoices.length > 0 && gridClubs.length === 0 ? <Note>Select clubs to see meetings.</Note>
        : clubChoices.length > 0 && publishedCycles.length === 0 ? <Note>No published schedules are available for your clubs yet.</Note>
          : clubChoices.length > 0 && memberMeetings.length === 0 ? <Note>No {mode} meetings for the selected clubs.</Note> : null}
      {memberMeetings.map((assignment) => {
        const kit = kitById.get(assignment.kitId);
        const title = titleById.get(kit?.titleId ?? '');
        const expanded = expandedId === assignment.id;
        return <View key={assignment.id}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpandedId(expanded ? null : assignment.id)} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#d6ddd9' }}>
            <Text style={{ fontWeight: '700', color: '#183a36' }}>{assignment.meeting} · {title?.name ?? 'Unavailable title'}</Text>
            <Text>{clubById.get(assignment.clubId)?.name ?? 'Unavailable club'} · Ready {assignment.ready} · Due {assignment.due}</Text>
          </Pressable>
          {expanded && renderDetail(assignment)}
        </View>;
      })}
    </Card>}
    {staff && mode === 'overview' && <Card>
      <Label>Schedule overview</Label>
      {gridClubs.length === 0 && <Note>Select clubs to see the schedule.</Note>}
      {gridClubs.map((club) => {
        const clubAssignments = cycleAssignments.filter((a) => a.clubId === club.id).sort((a, b) => a.meeting.localeCompare(b.meeting) || a.id.localeCompare(b.id));
        const assigned = new Set(clubAssignments.map((a) => a.slotId));
        const missing = cycle.slots.filter((slot) => slot.clubId === club.id && !assigned.has(slot.id));
        const expanded = expandedClubs.includes(club.id);
        const needsReview = clubAssignments.filter((assignment) => problems.get(assignment.id)).length;
        const visible = expanded ? clubAssignments : clubAssignments.slice(0, 3);
        return <View key={club.id} style={{ gap: 4 }}>
          <Text style={{ fontWeight: '700', color: '#183a36' }}>{club.name} · {clubAssignments.length} assigned{missing.length ? ` · ${missing.length} unassigned` : ''}{needsReview ? ` · ${needsReview} need review` : ''}</Text>
          {visible.map((assignment) => {
            const kit = kitById.get(assignment.kitId);
            const expanded = expandedId === assignment.id;
            return <View key={assignment.id}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpandedId(expanded ? null : assignment.id)} style={{ paddingVertical: 8 }}>
                <Text>{assignment.meeting} · {titleById.get(kit?.titleId ?? '')?.name ?? 'Unavailable title'}{problems.get(assignment.id) ? ' · Needs review' : ''}</Text>
              </Pressable>
              {expanded && renderDetail(assignment)}
            </View>;
          })}
          {(expanded ? missing : missing.slice(0, Math.max(0, 3 - visible.length))).map((slot) => <Text key={slot.id}>{slot.meeting ?? slot.month} · Not assigned</Text>)}
          {clubAssignments.length + missing.length > 3 && <Action title={expanded ? `Show fewer meetings for ${club.name}` : `Show all meetings for ${club.name}`} onPress={() =>
            setExpandedClubs(expanded ? expandedClubs.filter((id) => id !== club.id) : [...expandedClubs, club.id])} />}
          {!clubAssignments.length && !missing.length && <Note>No meetings for this club in this cycle.</Note>}
        </View>;
      })}
    </Card>}
    {!staff && mode === 'grid' && gridCycle && <Card>
      <Label>Published cycle · {gridCycle.name}</Label>
      {publishedCycles.length > 1 && <Actions>{publishedCycles.map((value) => <Action key={value.id} selected={value.id === gridCycle.id} title={value.name} onPress={() => { setSelectedId(value.id); setExpandedId(null); }} />)}</Actions>}
    </Card>}
    {mode === 'grid' && (grid
      ? (grid.rows.length === 0
        ? <Note>Select at least one club to show the grid.</Note>
        : <ScheduleGridView grid={grid} clubNameFor={(clubId) => clubById.get(clubId)?.name ?? 'Unavailable club'}
          titleFor={(assignment) => titleById.get(kitById.get(assignment.kitId)?.titleId ?? '')}
          expandedId={expandedId} showProblems={staff} onToggle={(assignmentId) => setExpandedId(expandedId === assignmentId ? null : assignmentId)}
          renderDetail={renderDetail} />)
      : <Note>No published schedule is available for your clubs yet.</Note>)}
    {mode === 'list' && <>
    {clubId && assignments.length === 0 && unassignedSlots.length === 0 && <Note>{staff ? 'No assignments for this club in this cycle yet.' : 'No published assignments for this club yet.'}</Note>}
    {monthKeys.map((month) => <View key={month} style={{ marginTop: 8 }}>
      <Label>{month}</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {(assignmentsByMonth.get(month) ?? []).map((assignment) => <React.Fragment key={assignment.id}>
          {renderTile(assignment)}
          {expandedId === assignment.id && renderDetail(assignment)}
        </React.Fragment>)}
        {(unassignedByMonth.get(month) ?? []).map((slot) => <View key={slot.id} accessibilityLabel={`${month}, not yet assigned`}
          style={{ width: TILE_WIDTH, marginRight: 12, marginBottom: 12 }}>
          <View style={{ width: TILE_WIDTH, height: TILE_WIDTH * 1.5, marginBottom: 6, borderRadius: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: '#9ca3af', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#6b7280', textAlign: 'center', fontSize: 12 }}>Not assigned</Text>
          </View>
          <Text style={{ fontSize: 12, color: '#374151' }}>{slot.meeting ?? 'No meeting date set'}</Text>
        </View>)}
      </View>
    </View>)}
    </>}
  </Page>;
}
