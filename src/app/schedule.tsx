import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, LayoutAnimation, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Action, Actions, Card, Label, Note, Page } from '../components/ui';
import { ScheduleGridView } from '../components/schedule-grid';
import { SCHEDULE_DESKTOP_WIDTH } from '../components/schedule-layout';
import { ScheduleInstructions } from '../components/schedule-instructions';
import { useScheduleWorkspace } from '../components/schedule-workspace';
import { TitleCover } from '../components/title-cover';
import { memberSchedule, scheduleByKit, scheduleGrid } from '../domain/cycle-overview';
import { today } from '../domain/dates';
import { scheduleWarning } from '../domain/schedule-warning';
import { assignmentProblem, fairness } from '../domain/logic';
import type { Assignment } from '../domain/model';
import { saveValidatedSchedule, validateSchedule, type ScheduleValidation } from '../state/api';
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
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = Platform.OS === 'web' && width >= SCHEDULE_DESKTOP_WIDTH;
  const { data } = useStore();
  const shared = useShared();
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  const [selectedId, setSelectedId] = useState(data.cycles[0]?.id ?? '');
  const [messages, setMessages] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const selectedCycle = data.cycles.find((c) => c.id === selectedId) ?? data.cycles[0];
  const editor = useScheduleWorkspace(data, selectedCycle);
  const hadModalConfirmation = useRef(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [highlightTitleId, setHighlightTitleId] = useState<string | null>(null);
  const [showAllMessages, setShowAllMessages] = useState(false);
  const [selectedClubId, setSelectedClubId] = useState('');
  const [memberViewMode, setMemberViewMode] = useState<'upcoming' | 'past' | 'grid' | 'list'>('upcoming');
  const [staffViewMode, setStaffViewMode] = useState<'grid' | 'meetings' | 'kits'>('grid');
  const [publication, setPublication] = useState<{ cycleId: string; revision: number; assignments: Assignment[]; validation: ScheduleValidation } | null>(null);
  const [validating, setValidating] = useState(false);
  const [gridClubIds, setGridClubIds] = useState<string[] | null>(null);
  const [staffClubIds, setStaffClubIds] = useState<string[] | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [staffFiltersOpen, setStaffFiltersOpen] = useState(false);
  const [cycleOpen, setCycleOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [expandedClubs, setExpandedClubs] = useState<string[]>([]);
  const staff = person?.role === 'staff' || person?.role === 'admin';
  const viewData = staff && editor.proposalData ? editor.proposalData : data;
  const cycle = staff && editor.workspace && (editor.dirty || editor.selectedSlotId) ? editor.workspace.cycle : selectedCycle;
  const [previousStaff, setPreviousStaff] = useState(staff);
  if (staff !== previousStaff) {
    setPreviousStaff(staff);
    if (staff) setStaffViewMode('grid');
  }
  const mode = staff ? staffViewMode : memberViewMode;
  const personId = person?.id;
  const enrolledClubIds = data.memberships.filter((membership) => membership.personId === personId).map((membership) => membership.clubId);
  const cycleId = cycle?.id;
  const clubChoices = staff ? viewData.clubs : data.clubs.filter((club) => enrolledClubIds.includes(club.id));
  const clubId = clubChoices.find((club) => club.id === selectedClubId)?.id ?? clubChoices[0]?.id;
  const visibleAssignments = viewData.assignments.filter((a) => staff
    ? a.cycleId === cycleId
    : enrolledClubIds.includes(a.clubId) && data.cycles.some((c) => c.id === a.cycleId && c.status === 'published'));
  const assignments = visibleAssignments
    .filter((a) => a.clubId === clubId)
    .sort((a, b) => a.meeting.localeCompare(b.meeting) || a.cycleId.localeCompare(b.cycleId) || a.id.localeCompare(b.id));
  const kitById = new Map(viewData.kits.map((kit) => [kit.id, kit] as const));
  const titleById = new Map(viewData.titles.map((title) => [title.id, title] as const));
  const clubById = new Map(viewData.clubs.map((club) => [club.id, club] as const));
  const publishedCycles = data.cycles.filter((c) => c.status === 'published' &&
    (c.slots.some((slot) => enrolledClubIds.includes(slot.clubId)) ||
      data.assignments.some((a) => a.cycleId === c.id && enrolledClubIds.includes(a.clubId))));
  const gridCycle = staff ? cycle : publishedCycles.find((c) => c.id === selectedId) ?? publishedCycles[0];
  const selectedClubIds = staff ? staffClubIds : gridClubIds;
  const gridClubs = selectedClubIds ? clubChoices.filter((club) => selectedClubIds.includes(club.id)) : clubChoices;
  const problemClubs = new Set(gridClubs.map((club) => club.id));
  const problems = new Map((staff ? visibleAssignments.filter((assignment) => problemClubs.has(assignment.clubId)) : [])
    .map((assignment) => [assignment.id, assignmentProblem(viewData, assignment, viewData.assignments) ?? null] as const));
  const gridClubKey = gridClubs.map((club) => club.id).join('|');
  const grid = mode === 'grid' && gridCycle
    ? scheduleGrid(viewData, gridCycle, gridClubKey ? gridClubKey.split('|') : [], viewData.assignments.filter((a) => a.cycleId === gridCycle.id))
    : null;
  const memberMeetings = !staff && (mode === 'upcoming' || mode === 'past')
    ? memberSchedule(data, gridClubKey ? gridClubKey.split('|') : [], today(), mode) : [];
  const kits = staff && mode === 'kits' && cycle ? scheduleByKit(viewData, cycle.id, gridClubs.map((club) => club.id)) : [];
  const pendingConfirmation = editor.pendingAction && <Card>
    <Note>{editor.pendingAction.description}</Note>
    <Actions><Action tone="danger" title={editor.pendingAction.confirmLabel} onPress={editor.confirmAction} />
      <Action title="Keep editing" onPress={editor.cancelAction} /></Actions>
  </Card>;
  const modalOpen = staff && !!editor.selectedSlotId;
  const modalSlot = editor.workspace?.cycle.slots.find((slot) => slot.id === editor.selectedSlotId);
  const modalClub = editor.workspace?.base.clubs.find((club) => club.id === modalSlot?.clubId);
  const modalAssignment = editor.workspace?.assignments.find((item) => item.slotId === editor.selectedSlotId);
  const modalTitleId = editor.workspace?.base.kits.find((kit) => kit.id === modalAssignment?.kitId)?.titleId;
  const highlightTitle = highlightTitleId ? titleById.get(highlightTitleId) : undefined;
  const countTitleClubs = (titleId: string | null | undefined) => new Set(grid?.rows.filter((row) => row.cells.some((cell) => cell.assignment && kitById.get(cell.assignment.kitId)?.titleId === titleId)).map((row) => row.clubId)).size;
  const highlightCount = countTitleClubs(highlightTitleId);
  const modalTitleCount = countTitleClubs(modalTitleId);
  function setHighlight(titleId: string | null) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setHighlightTitleId(titleId);
  }
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (modalOpen && editor.pendingAction) {
      hadModalConfirmation.current = true;
      const buttons = document.querySelectorAll<HTMLElement>('[role="dialog"] [role="button"]');
      [...buttons].find((button) => button.textContent === editor.pendingAction?.confirmLabel)?.focus();
    } else if (hadModalConfirmation.current) {
      hadModalConfirmation.current = false;
      if (modalOpen) {
        const selector = editor.activePicker ? '[role="dialog"] input' : '[aria-label="Close editor"]';
        document.querySelector<HTMLElement>(selector)?.focus();
      }
    }
  }, [modalOpen, editor.pendingAction, editor.activePicker]);
  const discardUnavailableProposal = editor.dirty && <Card>
    <Note>Unsaved staff schedule changes are held on this device.</Note>
    <Action title="Discard unsaved staff changes" disabled={editor.busy} onPress={editor.requestDiscard} />
  </Card>;
  if (!person) return <Page title="Schedule" wide={wide}>{pendingConfirmation}{discardUnavailableProposal}<Note>No demo user is selected on this device. Choose a user on the User tab.</Note></Page>;
  if (!cycle) return <Page title="Schedule" wide={wide}>{pendingConfirmation}{discardUnavailableProposal}{staff && <Actions><ScheduleInstructions /></Actions>}<Note>No shared cycle is available. Staff can create one, or an administrator can run the explicit server demo seed.</Note></Page>;
  const cycleAssignments = viewData.assignments.filter((assignment) => assignment.cycleId === cycle.id);
  const assignedSlotIds = new Set(assignments.map((assignment) => assignment.slotId));
  const unassignedSlots = staff && clubId ? cycle.slots.filter((slot) => slot.clubId === clubId && !assignedSlotIds.has(slot.id)) : [];
  const assignmentsByMonth = groupBy(assignments, (assignment) => assignment.meeting.slice(0, 7));
  const unassignedByMonth = groupBy(unassignedSlots, (slot) => slot.month);
  const monthKeys = [...new Set([...assignmentsByMonth.keys(), ...unassignedByMonth.keys()])].sort();

  function updateStaffClubs(ids: string[]) {
    setStaffClubIds(ids);
    if (expandedId && !viewData.assignments.some((assignment) => assignment.id === expandedId && ids.includes(assignment.clubId))) {
      setExpandedId(null);
    }
    if (editor.selectedSlotId && !cycle.slots.some((slot) => slot.id === editor.selectedSlotId && ids.includes(slot.clubId))) editor.closeSlot();
  }

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
    </View>;
  }

  async function publishValidated(candidate: { cycleId: string; revision: number; assignments: Assignment[]; validation: ScheduleValidation }) {
    try {
      await shared.mutate(() => saveValidatedSchedule(candidate.cycleId, candidate.assignments, candidate.revision, true, [], candidate.validation.token));
      setPublication(null); setMessages([]); setMessage('Shared schedule published.');
    } catch (error: unknown) {
      setPublication(null); setMessage(error instanceof Error ? error.message : 'Unable to publish schedule.');
    }
  }

  async function publish() {
    if (editor.dirty || editor.busy) return;
    editor.closeSlot();
    setValidating(true); setMessage(''); setMessages([]);
    try {
      const validation = await validateSchedule(cycle.id, cycleAssignments, cycle.revision, true, []);
      const candidate = { cycleId: cycle.id, revision: cycle.revision, assignments: cycleAssignments, validation };
      if (validation.warnings.length) setPublication(candidate);
      else await publishValidated(candidate);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'Unable to validate publication.');
    } finally { setValidating(false); }
  }

  return <Page title="Schedule" wide={wide}>
    {!staff && editor.dirty && <Card>
      <Note>Unsaved staff schedule changes are still held on this device. Discard them before leaving or return to a staff user.</Note>
      <Action title="Discard unsaved staff changes" disabled={editor.busy} onPress={editor.requestDiscard} />
    </Card>}
    <Card>
      <Label>{staff ? `${cycle.name} · ${cycle.status}` : 'Your published schedule'}</Label>
      <Actions>
        {staff && data.cycles.length > 1 && <Action title={cycleOpen ? 'Close cycles' : 'Change cycle'} onPress={() => setCycleOpen(!cycleOpen)} />}
        {staff && <Action title={toolsOpen ? 'Hide schedule actions' : 'Schedule actions'} onPress={() => setToolsOpen(!toolsOpen)} />}
        {staff && <ScheduleInstructions />}
      </Actions>
      {staff && cycleOpen && <Actions>{data.cycles.map((value) => <Action key={value.id} selected={value.id === cycle.id} disabled={editor.busy || validating} title={value.name} onPress={() => {
        if (value.id !== cycle.id) {
          editor.requestCycleChange(() => {
            setSelectedId(value.id); setMessages([]); setMessage('');
            setPublication(null); setExpandedId(null); setShowAllMessages(false); setCycleOpen(false);
          });
        } else {
          setCycleOpen(false);
        }
      }} />)}</Actions>}
      {staff && toolsOpen && <>
        <Note>Loans include a {viewData.library.bufferDays}-day turnaround buffer.</Note>
        {cycle.status === 'collecting' && cycleAssignments.length > 0 && <Note>
          Existing assignments may be provisional. Generating a draft can replace unlocked assignments; locked assignments are retained and may need attention. Checked-out kits or reading history can prevent drafting or publication.
        </Note>}
        <Actions>
          <Action tone="primary" title="Publish schedule" disabled={validating || editor.busy || editor.dirty || !!publication || cycle.status !== 'drafted'} onPress={() => { void publish(); }} />
          <Action title="Refresh shared schedule" disabled={editor.busy || validating} onPress={() => { void shared.refresh().catch((error: unknown) => setMessages([error instanceof Error ? error.message : 'Unable to refresh.'])); }} />
        </Actions>
      </>}
      {staff && publication && <>
        <Note>Publishing these warnings can create impossible or unsafe schedules and affect other cycles. Review every issue before confirming.</Note>
        {publication.validation.warnings.map((warning, index) => <Text key={`${warning.slotId}-${index}`} style={{ color: '#a22525' }}>{scheduleWarning(data, cycle, warning)}</Text>)}
        <Actions><Action tone="danger" title="Publish despite warnings" disabled={editor.busy || editor.dirty || validating || publication.cycleId !== cycle.id || publication.revision !== cycle.revision}
          onPress={() => { void publishValidated(publication); }} /><Action title="Cancel publication" disabled={shared.saving} onPress={() => setPublication(null)} /></Actions>
      </>}
      {staff && (showAllMessages ? messages : messages.slice(0, 5)).map((item, index) => <Text key={`${item}-${index}`} style={{ color: '#a22525' }}>{item}</Text>)}
      {staff && messages.length > 5 && <Action title={showAllMessages ? 'Show fewer messages' : `Show all messages (${messages.length})`} onPress={() => setShowAllMessages(!showAllMessages)} />}
      {staff && message ? <Text>{message}</Text> : null}
      {staff && editor.message ? <Text>{editor.message}</Text> : null}
      <Actions>
        {staff ? <>
          <Action selected={mode === 'grid'} title="Grid" onPress={() => { editor.closeSlot(); setStaffViewMode('grid'); }} />
          <Action selected={mode === 'meetings'} title="Meetings" onPress={() => { editor.closeSlot(); setStaffViewMode('meetings'); }} />
          <Action selected={mode === 'kits'} title="Kits" onPress={() => { editor.closeSlot(); setStaffViewMode('kits'); }} />
        </> : <>
          <Action selected={mode === 'upcoming'} title="Upcoming" onPress={() => setMemberViewMode('upcoming')} />
          <Action selected={mode === 'past'} title="Past" onPress={() => setMemberViewMode('past')} />
          <Action selected={mode === 'grid'} title="Grid" onPress={() => setMemberViewMode('grid')} />
          <Action selected={mode === 'list'} title="List by club" onPress={() => setMemberViewMode('list')} />
        </>}
      </Actions>
    </Card>
    {!modalOpen && pendingConfirmation}
    {modalOpen && <Modal transparent visible onRequestClose={editor.requestCloseSlot} accessibilityLabel={`Edit ${modalClub?.name ?? 'club'} meeting, ${modalSlot?.month ?? ''}`}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined} style={scheduleStyles.modalBackdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close meeting editor" onPress={editor.requestCloseSlot} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={[scheduleStyles.modalDialog, { maxHeight: Math.max(100, height - insets.top - insets.bottom - 32) }]}>
          <View style={scheduleStyles.modalHeader}>
            <Label>Edit meeting · {modalClub?.name ?? 'Unavailable club'} · {modalSlot?.month}</Label>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {modalTitleId && <Action title={`Highlight title (${modalTitleCount} ${modalTitleCount === 1 ? 'club' : 'clubs'})`} accessibilityLabel={`Highlight title across the schedule, assigned to ${modalTitleCount} ${modalTitleCount === 1 ? 'club' : 'clubs'}`} onPress={() => { setHighlight(modalTitleId); editor.requestCloseSlot(); }} />}
              <Action title="Close" accessibilityLabel="Close editor" onPress={editor.requestCloseSlot} />
            </View>
          </View>
          {editor.pendingAction ? pendingConfirmation : editor.activePicker
            ? editor.renderSelectedSlot()
            : <ScrollView keyboardShouldPersistTaps="handled" style={scheduleStyles.modalScroll}>{editor.renderSelectedSlot()}</ScrollView>}
        </View>
      </KeyboardAvoidingView>
    </Modal>}
    {staff && <Card>
      <Label>{editor.dirty ? 'Unsaved local schedule' : 'Shared schedule'}</Label>
      {editor.dirty
        ? <Note>Changes are visible only on this device until saved. Saving creates a shared draft; publishing is separate.</Note>
        : (cycle.status === 'collecting' || cycle.status === 'drafted') && <Note>Select a meeting in Grid to edit it locally. Nothing changes for other users until you save a draft.</Note>}
      {cycle.status === 'published' && <Note>Published schedules are read-only here. Reopen or discard the schedule for this cycle on Cycles before editing; reopening affects member visibility and circulation.</Note>}
      {cycle.status === 'open' && <Note>Start collecting preferences on Cycles before editing this schedule.</Note>}
      {editor.stale && editor.dirty && <Text style={{ color: '#a22525' }}>Shared data has changed. Refresh if needed, then discard these changes and start again before saving.</Text>}
      <Actions>
        <Action title={editor.dirty ? 'Regenerate locally' : 'Generate locally'} disabled={editor.busy || validating || !!publication || (editor.stale && editor.dirty) || (cycle.status !== 'collecting' && cycle.status !== 'drafted')} onPress={editor.requestGenerate} />
        <Action tone="primary" title="Save draft" disabled={!editor.dirty || editor.busy || validating || editor.stale} onPress={() => { void editor.validate(); }} />
        <Action title="Discard changes" disabled={!editor.dirty || editor.busy || validating} onPress={editor.requestDiscard} />
      </Actions>
      {(!editor.stale || editor.dirty) && editor.workspace?.generationProblems.map((problem, index) => <Text key={`${problem}-${index}`} style={{ color: '#a22525' }}>{problem}</Text>)}
      {editor.validation && editor.workspace && <>
        <Label>Review before saving</Label>
        <Note>These overrides can create impossible or unsafe schedules and affect other cycles. Save only if you accept every warning.</Note>
        {editor.validation.warnings.map((warning, index) => <Text key={`${warning.slotId}-${index}`} style={{ color: '#a22525' }}>{scheduleWarning(editor.workspace!.base, editor.workspace!.cycle, warning)}</Text>)}
        <Actions><Action tone="danger" title="Save draft despite warnings" disabled={editor.busy || editor.stale} onPress={() => { if (editor.validation) void editor.confirmSave(editor.validation.token); }} />
          <Action title="Cancel save" disabled={editor.busy} onPress={editor.cancelValidation} /></Actions>
      </>}
    </Card>}
    {staff ? <Card>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: staffFiltersOpen }}
        accessibilityLabel={`Clubs shown, ${gridClubs.length} of ${clubChoices.length}`} onPress={() => setStaffFiltersOpen(!staffFiltersOpen)}
        style={{ minHeight: 44, justifyContent: 'center' }}>
        <Label>{staffFiltersOpen ? '▾' : '▸'} Clubs shown · {gridClubs.length} of {clubChoices.length}</Label>
      </Pressable>
      {clubChoices.length === 0 ? <Note>No clubs exist yet.</Note> : staffFiltersOpen && <>
        <Actions>
          <Action title="Show all" disabled={gridClubs.length === clubChoices.length} onPress={() => updateStaffClubs(clubChoices.map((club) => club.id))} />
          <Action title="Hide all" disabled={gridClubs.length === 0} onPress={() => updateStaffClubs([])} />
        </Actions>
        <Actions>{clubChoices.map((value) => <Action key={value.id} selected={gridClubs.some((club) => club.id === value.id)} title={value.name} onPress={() => {
          const current = gridClubs.map((club) => club.id);
          updateStaffClubs(current.includes(value.id) ? current.filter((id) => id !== value.id) : [...current, value.id]);
        }} />)}</Actions>
      </>}
    </Card> : mode !== 'list' ? <Card>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: filtersOpen }} onPress={() => setFiltersOpen(!filtersOpen)}>
        <Label>{filtersOpen ? '▾' : '▸'} Your clubs · {gridClubs.length} of {clubChoices.length}</Label>
      </Pressable>
      {clubChoices.length === 0
        ? <Note>You are not enrolled in any clubs. Enrol in a club on the My clubs tab.</Note>
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
    {!staff && (mode === 'upcoming' || mode === 'past') && <Card>
      <Label>{mode === 'upcoming' ? 'Upcoming meetings' : 'Past meetings'}</Label>
      {clubChoices.length > 0 && gridClubs.length === 0 ? <Note>Select clubs to see meetings.</Note>
        : clubChoices.length > 0 && publishedCycles.length === 0 ? <Note>No published schedules are available for your clubs yet.</Note>
          : clubChoices.length > 0 && memberMeetings.length === 0 ? <Note>No {mode} meetings for the selected clubs.</Note> : null}
      <View style={wide ? scheduleStyles.columns : scheduleStyles.singleColumn}>{memberMeetings.map((assignment) => {
        const kit = kitById.get(assignment.kitId);
        const title = titleById.get(kit?.titleId ?? '');
        const expanded = expandedId === assignment.id;
        return <View key={assignment.id} style={wide ? scheduleStyles.column : undefined}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpandedId(expanded ? null : assignment.id)} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#d6ddd9' }}>
            <Text style={{ fontWeight: '700', color: '#183a36' }}>{assignment.meeting} · {title?.name ?? 'Unavailable title'}</Text>
            <Text>{clubById.get(assignment.clubId)?.name ?? 'Unavailable club'} · Ready {assignment.ready} · Due {assignment.due}</Text>
          </Pressable>
          {expanded && renderDetail(assignment)}
        </View>;
      })}</View>
    </Card>}
    {staff && mode === 'meetings' && <Card>
      <Label>Meetings</Label>
      {clubChoices.length > 0 && gridClubs.length === 0 && <Note>Select clubs to see meetings.</Note>}
      <View style={wide ? scheduleStyles.columns : scheduleStyles.singleColumn}>{gridClubs.map((club) => {
        const clubAssignments = cycleAssignments.filter((a) => a.clubId === club.id).sort((a, b) => a.meeting.localeCompare(b.meeting) || a.id.localeCompare(b.id));
        const assigned = new Set(clubAssignments.map((a) => a.slotId));
        const missing = cycle.slots.filter((slot) => slot.clubId === club.id && !assigned.has(slot.id));
        const expanded = expandedClubs.includes(club.id);
        const needsReview = clubAssignments.filter((assignment) => problems.get(assignment.id)).length;
        const visible = expanded ? clubAssignments : clubAssignments.slice(0, 3);
        return <View key={club.id} style={[{ gap: 4, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#d6ddd9' }, wide && scheduleStyles.column]}>
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
      })}</View>
    </Card>}
    {!staff && mode === 'grid' && gridCycle && <Card>
      <Label>Published cycle · {gridCycle.name}</Label>
      {publishedCycles.length > 1 && <Actions>{publishedCycles.map((value) => <Action key={value.id} selected={value.id === gridCycle.id} title={value.name} onPress={() => { setSelectedId(value.id); setExpandedId(null); }} />)}</Actions>}
    </Card>}
    {staff && mode === 'grid' && <Note>Fairness averages priority weights across all club slots: first choice is 100%, last is 1/N, and unranked, repeated and unassigned slots score zero. No priorities or slots: N/A.</Note>}
    {mode === 'grid' && staff && highlightTitle && grid && <Card>
      <Label>Highlighting · {highlightTitle.name}</Label>
      <Note>{highlightCount} {highlightCount === 1 ? 'club' : 'clubs'} in {gridCycle?.name ?? 'this cycle'}. Other clubs are hidden.</Note>
      <Actions><Action title="Clear highlight" onPress={() => setHighlight(null)} /></Actions>
    </Card>}
    {mode === 'grid' && (grid
      ? (grid.rows.length === 0
        ? (staff && clubChoices.length === 0 ? null : <Note>Select at least one club to show the grid.</Note>)
        : <ScheduleGridView grid={grid} wide={wide} clubNameFor={(clubId) => clubById.get(clubId)?.name ?? 'Unavailable club'}
          titleFor={(assignment) => titleById.get(kitById.get(assignment.kitId)?.titleId ?? '')}
          sharedLayout={staff} highlightTitleId={staff ? highlightTitleId : null}
          expandedId={expandedId} showProblems={staff} onToggle={(assignmentId) => setExpandedId(expandedId === assignmentId ? null : assignmentId)}
          renderDetail={renderDetail}
          selectedSlotId={staff ? editor.selectedSlotId : undefined}
          onSelectSlot={staff && (cycle.status === 'collecting' || cycle.status === 'drafted') && !validating && !publication ? editor.selectSlot : undefined}
          onAddSlot={staff && (cycle.status === 'collecting' || cycle.status === 'drafted') && !validating && !publication ? editor.toggleSlot : undefined}
          onGenerateClub={staff && (cycle.status === 'collecting' || cycle.status === 'drafted') && !validating && !publication ? (clubId, months) => editor.requestGenerateClub({ clubId, months }) : undefined}
          clubSummaryFor={staff ? (clubId) => { const result = fairness(viewData, cycle, clubId, cycleAssignments); return `Fairness ${result.score === null ? 'N/A' : `${Math.round(result.score)}%`} · ${result.assigned}/${result.slots} assigned`; } : undefined}
          onHideClub={staff ? (clubId) => updateStaffClubs(gridClubs.filter((club) => club.id !== clubId).map((club) => club.id)) : undefined} />)
      : <Note>No published schedule is available for your clubs yet.</Note>)}
    {staff && mode === 'kits' && <Card>
      <Label>Kits</Label>
      {clubChoices.length > 0 && gridClubs.length === 0 ? <Note>Select clubs to see their assigned kits.</Note>
        : gridClubs.length > 0 && kits.length === 0 ? <Note>No kits are assigned to the selected clubs in this cycle.</Note> : null}
      <View style={wide ? scheduleStyles.columns : scheduleStyles.singleColumn}>{kits.map((group) => {
        const kit = kitById.get(group.kitId);
        const title = titleById.get(kit?.titleId ?? '');
        return <View key={group.kitId} style={[{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#d6ddd9', gap: 8 }, wide && scheduleStyles.column]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            {title && <TitleCover coverUrl={title.coverUrl} isbn={title.isbn} style={{ width: 64, height: 96, marginRight: 0, marginBottom: 0 }} />}
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontWeight: '700', color: '#183a36' }}>{title?.name ?? 'Unavailable title'}</Text>
              <Text>{kit?.barcode ?? `Unavailable kit (${group.kitId})`}</Text>
              <Text>{group.assignments.length} {group.assignments.length === 1 ? 'meeting' : 'meetings'}</Text>
            </View>
          </View>
          {group.assignments.map((assignment) => {
            const expanded = expandedId === assignment.id;
            return <View key={assignment.id}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded }}
                onPress={() => setExpandedId(expanded ? null : assignment.id)}
                style={{ minHeight: 44, justifyContent: 'center', paddingVertical: 6 }}>
                <Text style={{ fontWeight: '600' }}>{assignment.meeting} · {clubById.get(assignment.clubId)?.name ?? 'Unavailable club'}</Text>
                <Text>Ready {assignment.ready} · Due {assignment.due}{problems.get(assignment.id) ? ' · Needs review' : ''}</Text>
              </Pressable>
              {expanded && renderDetail(assignment)}
            </View>;
          })}
        </View>;
      })}</View>
    </Card>}
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

const scheduleStyles = StyleSheet.create({
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modalDialog: { width: '100%', maxWidth: 650, flexShrink: 1, backgroundColor: '#fffefa', padding: 16, gap: 12 },
  modalHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  modalScroll: { flexShrink: 1 },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' },
  column: { width: '32%' },
  singleColumn: { gap: 12 },
});
