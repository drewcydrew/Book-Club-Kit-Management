import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, LayoutAnimation, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Action, Actions, Card, Label, Note, Page } from '../components/ui';
import { ClubFilterCard } from '../components/club-filter';
import { ScheduleGridView } from '../components/schedule-grid';
import { NativeScheduleGridView } from '../components/schedule-grid-native';
import { SCHEDULE_DESKTOP_WIDTH } from '../components/schedule-layout';
import { ScheduleInstructions } from '../components/schedule-instructions';
import { ScheduleExportActions } from '../components/schedule-export';
import { ScheduleHandouts } from '../components/schedule-handouts';
import { KitCalendarList } from '../components/kit-calendar-list';
import { buildKitCalendar } from '../domain/kit-calendar';
import { useScheduleWorkspace } from '../components/schedule-workspace';
import { MemberSchedule, type MemberView } from '../components/member-schedule';
import { focusedScheduleClub, memberScheduleMeetings, memberVisibleCycle, monthsInRange, scheduleByKit, scheduleClubsMatchingTitle, scheduleGrid, selectMemberScheduleCycle } from '../domain/cycle-overview';
import { today } from '../domain/dates';
import { scheduleWarning } from '../domain/schedule-warning';
import { makeMemberScheduleExport, makeScheduleExport, type StaffScheduleView } from '../domain/schedule-export';
import { assignmentProblem, fairness, generationClubScope, loanOverrun, rankings } from '../domain/logic';
import type { Assignment } from '../domain/model';
import { saveValidatedSchedule, validateSchedule, type ScheduleValidation } from '../state/api';
import { useShared } from '../state/shared';
import { useStore } from '../state/store';
import { ScreenGate } from '../components/screen-gate';

const strategyDescriptions = {
  clubs: 'Fill meetings, then improve the lowest club fairness scores.',
  utilisation: 'Fill meetings, then use fewer kits, favour popular titles and consider fairness.',
};

export default function Schedule() {
  return <ScreenGate><ScheduleContent /></ScreenGate>;
}

function ScheduleContent() {
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
  const confirmationTrigger = useRef<HTMLElement | null>(null);
  const hadDialogConfirmation = useRef(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [highlightTitleId, setHighlightTitleId] = useState<string | null>(null);
  const [showAllMessages, setShowAllMessages] = useState(false);
  const [memberViewMode, setMemberViewMode] = useState<MemberView>('meetings');
  const [memberCycleId, setMemberCycleId] = useState('');
  const [memberCycleOpen, setMemberCycleOpen] = useState(false);
  const [staffViewMode, setStaffViewMode] = useState<StaffScheduleView>('grid');
  const [focusedClubId, setFocusedClubId] = useState('');
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
  const visibleAssignments = viewData.assignments.filter((a) => staff
    ? a.cycleId === cycleId
    : enrolledClubIds.includes(a.clubId) && data.cycles.some((c) => c.id === a.cycleId && memberVisibleCycle(c)));
  const kitById = new Map(viewData.kits.map((kit) => [kit.id, kit] as const));
  const titleById = new Map(viewData.titles.map((title) => [title.id, title] as const));
  const clubById = new Map(viewData.clubs.map((club) => [club.id, club] as const));
  const gridCycle = cycle;
  const selectedClubIds = staff ? staffClubIds : gridClubIds;
  const gridClubs = selectedClubIds ? clubChoices.filter((club) => selectedClubIds.includes(club.id)) : clubChoices;
  const gridClubKey = gridClubs.map((club) => club.id).join('|');
  const nativeGrid = staff && mode === 'grid' && Platform.OS !== 'web';
  const eligibleClubIds = useMemo(() => {
    const ids = gridClubKey ? gridClubKey.split('|') : [];
    return nativeGrid && gridCycle && highlightTitleId
      ? scheduleClubsMatchingTitle(viewData, gridCycle, ids, viewData.assignments, highlightTitleId)
      : ids;
  }, [gridClubKey, gridCycle, highlightTitleId, nativeGrid, viewData]);
  const focusedId = focusedScheduleClub(eligibleClubIds, focusedClubId);
  if (nativeGrid && focusedClubId !== focusedId) setFocusedClubId(focusedId);
  const grid = useMemo(() => staff && mode === 'grid' && gridCycle
    ? scheduleGrid(viewData, gridCycle, nativeGrid ? (focusedId ? [focusedId] : []) : (gridClubKey ? gridClubKey.split('|') : []), viewData.assignments)
    : null, [staff, mode, gridCycle, viewData, nativeGrid, focusedId, gridClubKey]);
  const problemClubs = new Set(gridClubs.map((club) => club.id));
  const problems = nativeGrid
    ? new Map((grid?.rows[0]?.cells ?? []).flatMap((cell) => cell.assignment ? [[cell.assignment.id, cell.problem] as const] : []))
    : new Map((staff ? visibleAssignments.filter((assignment) => problemClubs.has(assignment.clubId)) : [])
      .map((assignment) => [assignment.id, assignmentProblem(viewData, assignment, viewData.assignments) ?? null] as const));
  const gridPriorities = useMemo(() => staff && mode === 'grid' && gridCycle
    ? new Map((nativeGrid ? (focusedId ? [focusedId] : []) : (gridClubKey ? gridClubKey.split('|') : [])).map((clubId) =>
      [clubId, new Map((gridCycle.finalized[clubId] ?? rankings(viewData, gridCycle, clubId, true))
        .map((titleId, index) => [titleId, index + 1] as const))] as const))
    : null, [staff, mode, gridCycle, nativeGrid, focusedId, gridClubKey, viewData]);
  const allMemberMeetings = staff ? [] : memberScheduleMeetings(data, enrolledClubIds);
  const memberCycleIds = new Set(allMemberMeetings.map((meeting) => meeting.cycle.id));
  const memberCycles = data.cycles.filter((value) => memberCycleIds.has(value.id));
  const memberCycle = selectMemberScheduleCycle(memberCycles, memberCycleId, today());
  if (!staff && memberCycleId !== (memberCycle?.id ?? '')) setMemberCycleId(memberCycle?.id ?? '');
  const shownMemberClubs = new Set(gridClubs.map((club) => club.id));
  const memberMeetings = allMemberMeetings.filter((meeting) => meeting.cycle.id === memberCycle?.id && shownMemberClubs.has(meeting.clubId));
  const kitEntries = staff && mode === 'kits' && cycle
    ? scheduleByKit(viewData, cycle.id, gridClubs.map((club) => club.id)).map((group) => {
      const kit = kitById.get(group.kitId);
      const title = titleById.get(kit?.titleId ?? '');
      return {
        kitId: group.kitId,
        title: title?.name ?? 'Unavailable title',
        barcode: kit?.barcode ?? `Unavailable kit (${group.kitId})`,
        coverUrl: title?.coverUrl,
        isbn: title?.isbn ?? '',
        calendar: buildKitCalendar([group], monthsInRange(cycle.startsOn, cycle.endsOn), viewData.library.loanDays + viewData.library.bufferDays),
      };
    })
    : null;
  const discardPending = editor.pendingAction?.kind === 'discard';
  const regeneratePending = editor.pendingAction?.kind === 'regenerate';
  const dialogPending = discardPending || regeneratePending;
  const dialogTitle = regeneratePending ? 'Confirm regeneration' : 'Confirm discard';
  const cancelLabel = regeneratePending ? 'Keep editing instead of regenerating' : 'Keep editing instead of discarding';
  const modalOpen = staff && !!editor.selectedSlotId;
  const pendingConfirmation = editor.pendingAction && !dialogPending && <Card>
    <Note>{editor.pendingAction.description}</Note>
    <Actions><Action tone="danger" title={editor.pendingAction.confirmLabel} onPress={editor.confirmAction} />
      <Action title="Keep editing" onPress={editor.cancelAction} /></Actions>
  </Card>;
  const dialogContent = dialogPending && editor.pendingAction && <>
    <Label>{dialogTitle}</Label>
    <ScrollView style={scheduleStyles.modalScroll}><Note>{editor.pendingAction.description}</Note></ScrollView>
    <Actions><Action tone="danger" title={editor.pendingAction.confirmLabel} onPress={editor.confirmAction} />
      <Action title="Keep editing" accessibilityLabel={cancelLabel} onPress={editor.cancelAction} /></Actions>
  </>;
  const dialogConfirmation = dialogPending && !modalOpen && <Modal transparent visible onRequestClose={editor.cancelAction} accessibilityLabel={dialogTitle}>
    <View style={scheduleStyles.modalBackdrop}>
      <Pressable accessibilityRole="button" accessibilityLabel={regeneratePending ? 'Cancel regeneration' : 'Cancel discard'} onPress={editor.cancelAction} style={StyleSheet.absoluteFill} />
      <View accessibilityViewIsModal style={[scheduleStyles.modalDialog, { maxHeight: Math.max(100, height - insets.top - insets.bottom - 32) }]}>
        {dialogContent}
      </View>
    </View>
  </Modal>;
  const modalSlot = editor.workspace?.cycle.slots.find((slot) => slot.id === editor.selectedSlotId);
  const modalClub = editor.workspace?.base.clubs.find((club) => club.id === modalSlot?.clubId);
  const modalAssignment = editor.workspace?.assignments.find((item) => item.slotId === editor.selectedSlotId);
  const modalTitleId = editor.workspace?.base.kits.find((kit) => kit.id === modalAssignment?.kitId)?.titleId;
  const highlightTitle = highlightTitleId ? titleById.get(highlightTitleId) : undefined;
  const countTitleClubs = (titleId: string | null | undefined) => nativeGrid && gridCycle && titleId
    ? scheduleClubsMatchingTitle(viewData, gridCycle, gridClubs.map((club) => club.id), viewData.assignments, titleId).length
    : new Set(grid?.rows.filter((row) => row.cells.some((cell) => cell.assignment && kitById.get(cell.assignment.kitId)?.titleId === titleId)).map((row) => row.clubId)).size;
  const highlightCount = nativeGrid && highlightTitleId ? eligibleClubIds.length : countTitleClubs(highlightTitleId);
  const modalTitleCount = countTitleClubs(modalTitleId);
  function setHighlight(titleId: string | null) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setHighlightTitleId(titleId);
  }
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (modalOpen && editor.pendingAction && !dialogPending) {
      hadModalConfirmation.current = true;
      const buttons = document.querySelectorAll<HTMLElement>('[role="dialog"] [role="button"]');
      [...buttons].find((button) => button.textContent === editor.pendingAction?.confirmLabel)?.focus();
    } else if (hadModalConfirmation.current) {
      hadModalConfirmation.current = false;
      if (modalOpen && !dialogPending) {
        const selector = editor.activePicker ? '[role="dialog"] input' : '[aria-label="Close editor"]';
        document.querySelector<HTMLElement>(selector)?.focus();
      }
    }
  }, [modalOpen, editor.pendingAction, editor.activePicker, dialogPending]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (dialogPending) {
      hadDialogConfirmation.current = true;
      if (!confirmationTrigger.current && document.activeElement instanceof HTMLElement) confirmationTrigger.current = document.activeElement;
      document.querySelector<HTMLElement>(`[aria-label="${cancelLabel}"]`)?.focus();
    } else if (hadDialogConfirmation.current) {
      hadDialogConfirmation.current = false;
      const trigger = confirmationTrigger.current;
      if (trigger?.isConnected && trigger.getAttribute('aria-disabled') !== 'true' && !(trigger instanceof HTMLButtonElement && trigger.disabled)) trigger.focus();
      else if (modalOpen) document.querySelector<HTMLElement>('[aria-label="Close editor"]')?.focus();
      confirmationTrigger.current = null;
    } else {
      confirmationTrigger.current = null;
    }
  }, [dialogPending, cancelLabel, modalOpen, editor.busy]);
  function requestDiscard() {
    if (Platform.OS === 'web' && document.activeElement instanceof HTMLElement) confirmationTrigger.current = document.activeElement;
    editor.requestDiscard();
  }
  function requestGenerate() {
    if (Platform.OS === 'web' && document.activeElement instanceof HTMLElement) confirmationTrigger.current = document.activeElement;
    editor.requestGenerate(gridClubs.map((club) => club.id));
  }
  const discardUnavailableProposal = editor.dirty && <Card>
    <Note>Unsaved staff schedule changes are held on this device.</Note>
    <Action title="Discard unsaved staff changes" disabled={editor.busy} onPress={requestDiscard} />
  </Card>;
  if (!person) return <Page title="Schedule" wide={wide}>{pendingConfirmation}{dialogConfirmation}{discardUnavailableProposal}<Note>No demo user is selected. Choose a user on Home.</Note></Page>;
  if (!cycle) return <Page title="Schedule" wide={wide}>{pendingConfirmation}{dialogConfirmation}{discardUnavailableProposal}{staff && <Actions><ScheduleInstructions /></Actions>}<Note>{!staff && !enrolledClubIds.length ? 'You are not enrolled in any clubs. Enrol in a club on Home.' : 'No shared cycle is available. Staff can create one, or an administrator can run the explicit server demo seed.'}</Note></Page>;
  const cycleAssignments = viewData.assignments.filter((assignment) => assignment.cycleId === cycle.id);
  const generationScope = generationClubScope(viewData, cycle, cycleAssignments, gridClubs.map((club) => club.id));
  const clubSelectionDisabled = editor.busy || validating || !!publication;
  const assignedSlots = new Set(cycleAssignments.map((assignment) => assignment.slotId));
  const unassignedMeetings = cycle.slots.filter((slot) => !assignedSlots.has(slot.id)).length;

  function updateStaffClubs(ids: string[]) {
    if (clubSelectionDisabled) return;
    setStaffClubIds(ids);
    if (expandedId && !viewData.assignments.some((assignment) => assignment.id === expandedId && ids.includes(assignment.clubId))) {
      setExpandedId(null);
    }
    if (editor.selectedSlotId && !cycle.slots.some((slot) => slot.id === editor.selectedSlotId && ids.includes(slot.clubId))) editor.closeSlot();
  }

  function renderDetail(assignment: Assignment) {
    const kit = kitById.get(assignment.kitId);
    const problem = problems.get(assignment.id) ?? null;
    return <View style={{ width: '100%', marginBottom: 12, padding: 12, borderRadius: 8, backgroundColor: '#f3f4f6' }}>
      <Text style={{ fontWeight: '600' }}>{clubById.get(assignment.clubId)?.name ?? 'Unavailable club'} · {titleById.get(kit?.titleId ?? '')?.name ?? 'Unavailable title'}</Text>
      {problem && <Text style={{ color: '#a22525' }}>Needs review: {problem}</Text>}
      {loanOverrun(viewData, assignment) && <Text style={{ color: '#9a5b00' }}>{loanOverrun(viewData, assignment)}</Text>}
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

  const gridContent = <>
    {staff && mode === 'grid' && <Note>Cover badges show club priority; — means unranked. Fairness averages priority weights across all club slots: first choice is 100%, last is 1/N, and unranked, repeated and unassigned slots score zero. No priorities or slots: N/A.</Note>}
    {mode === 'grid' && staff && highlightTitle && grid && <Card>
      <Label>Highlighting · {highlightTitle.name}</Label>
      <Note>{highlightCount} {highlightCount === 1 ? 'club' : 'clubs'} in {gridCycle?.name ?? 'this cycle'}. {nativeGrid ? 'Choose a matching club below.' : 'Other rows are temporarily hidden.'} Clubs shown still controls generation and CSV exports; the Grid PDF matches this highlight.</Note>
      <Actions><Action title="Clear highlight" onPress={() => setHighlight(null)} /></Actions>
    </Card>}
    {!nativeGrid && mode === 'grid' && (grid
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
          onGenerateClub={staff && (cycle.status === 'collecting' || cycle.status === 'drafted') && !validating && !publication ? (clubId) => editor.requestGenerateClub({ clubId }) : undefined}
          clubActionsDisabled={clubSelectionDisabled}
          priorityFor={staff ? (clubId, titleId) => gridPriorities?.get(clubId)?.get(titleId) ?? null : undefined}
          clubResult={editor.clubResult}
          clubSummaryFor={staff ? (clubId) => { const result = fairness(viewData, cycle, clubId, cycleAssignments); return `Fairness ${result.score === null ? 'N/A' : `${Math.round(result.score)}%`} · ${result.assigned}/${result.slots} assigned`; } : undefined}
          onHideClub={staff ? (clubId) => updateStaffClubs(gridClubs.filter((club) => club.id !== clubId).map((club) => club.id)) : undefined} />)
      : <Note>No drafted or published schedule is available for your clubs yet.</Note>)}
  </>;

  const content = <>
    {!staff && editor.dirty && <Card>
      <Note>Unsaved staff schedule changes are still held on this device. Discard them before leaving or return to a staff user.</Note>
      <Action title="Discard unsaved staff changes" disabled={editor.busy} onPress={requestDiscard} />
    </Card>}
    <Card>
      <Label>{staff ? `${cycle.name} · ${cycle.status}` : memberCycle ? `${memberCycle.name} · ${memberCycle.status}` : 'Your schedule'}</Label>
      <Actions>
        {staff && data.cycles.length > 1 && <Action title={cycleOpen ? 'Close cycles' : 'Change cycle'} onPress={() => setCycleOpen(!cycleOpen)} />}
        {!staff && memberCycles.length > 1 && <Action title={memberCycleOpen ? 'Close cycles' : 'Change cycle'} expanded={memberCycleOpen} onPress={() => setMemberCycleOpen(!memberCycleOpen)} />}
        {staff && <Action title={toolsOpen ? 'Hide schedule actions' : 'Schedule actions'} onPress={() => setToolsOpen(!toolsOpen)} />}
        {staff && <ScheduleInstructions />}
      </Actions>
      {!staff && memberCycleOpen && memberCycles.length > 1 && <Actions>{memberCycles.map((value) =>
        <Action key={value.id} selected={value.id === memberCycle?.id} title={`${value.name} · ${value.status}`} onPress={() => {
          setMemberCycleId(value.id); setMemberCycleOpen(false);
        }} />)}</Actions>}
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
          Existing assignments may be provisional. Full generation replaces shown clubs&apos; dates and assignments, including locked assignments after confirmation. Checked-out kits or reading history can prevent drafting or publication.
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
    </Card>
    {!modalOpen && pendingConfirmation}
    {dialogConfirmation}
    {modalOpen && <Modal transparent visible onRequestClose={dialogPending ? editor.cancelAction : editor.requestCloseSlot} accessibilityLabel={dialogPending ? dialogTitle : `Edit ${modalClub?.name ?? 'club'} meeting, ${modalSlot?.month ?? ''}`}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined} style={scheduleStyles.modalBackdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel={dialogPending ? (regeneratePending ? 'Cancel regeneration' : 'Cancel discard') : 'Close meeting editor'} onPress={dialogPending ? editor.cancelAction : editor.requestCloseSlot} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={[scheduleStyles.modalDialog, { maxHeight: Math.max(100, height - insets.top - insets.bottom - 32) }]}>
          {dialogPending ? dialogContent : <>
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
          </>}
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
      {unassignedMeetings > 0 && <Note>{unassignedMeetings} {unassignedMeetings === 1 ? 'meeting is' : 'meetings are'} unassigned. Every meeting must be assigned before publication.</Note>}
      {editor.stale && editor.dirty && <Text style={{ color: '#a22525' }}>Shared data has changed. Refresh if needed, then discard these changes and start again before saving.</Text>}
      <Note>Full-cycle generation includes {generationScope.shownCount} of {clubChoices.length} clubs selected in Clubs shown. Hiding a club does not change its assignments until you regenerate.</Note>
      {generationScope.excludedClubIds.length > 0 && <Note>After confirmation, regeneration clears hidden clubs&apos; assignments locally, including locked assignments. Their meetings and ballots remain. Saving shares these removals; every meeting must be assigned before publication.</Note>}
      <Note>Full generation creates or rebuilds meetings for all shown clubs using their current cadence, skipped-month offset and meeting-day rule, replacing existing dates. Every 6 weeks spaces meetings 42 days apart from the first meeting of the cycle. Single-club generation creates missing meetings, moves existing meetings to the club&apos;s current rule, removes assignments for removed or moved meetings after confirmation, and redrafts this club&apos;s unlocked assignments. Locked assignments and other clubs&apos; assignments are retained.</Note>
      <Note>Rule dates on or before the preference deadline remain undated and unassigned. Other rule dates are kept even when no kit is assigned. Review the local proposal before saving.</Note>
      {generationScope.shownCount === 0 && <Note>Show at least one club before generating a schedule.</Note>}
      {generationScope.missingClubIds.length > 0 && <Text style={{ color: '#a22525' }}>Some meetings or assignments reference unavailable clubs. Refresh the schedule before generating.</Text>}
      <Actions>
        <Action title="Prioritise clubs" selected={editor.generationMode === 'clubs'} accessibilityLabel={`Prioritise clubs, ${editor.generationMode === 'clubs' ? 'selected' : 'not selected'}. ${strategyDescriptions.clubs}`} description={strategyDescriptions.clubs} disabled={editor.busy || validating} onPress={() => editor.setGenerationMode('clubs')} />
        <Action title="Prioritise utilisation" selected={editor.generationMode === 'utilisation'} accessibilityLabel={`Prioritise utilisation, ${editor.generationMode === 'utilisation' ? 'selected' : 'not selected'}. ${strategyDescriptions.utilisation}`} description={strategyDescriptions.utilisation} disabled={editor.busy || validating} onPress={() => editor.setGenerationMode('utilisation')} />
      </Actions>
      <Note>{strategyDescriptions[editor.generationMode]} Choose a strategy before generating; changing it does not regenerate the schedule.</Note>
      <Actions>
        <Action title={editor.dirty ? 'Regenerate locally' : 'Generate locally'} disabled={editor.busy || validating || !!publication || !generationScope.shownCount || !!generationScope.missingClubIds.length || (editor.stale && editor.dirty) || (cycle.status !== 'collecting' && cycle.status !== 'drafted')} onPress={requestGenerate} />
        <Action tone="primary" title="Save draft" disabled={!editor.dirty || editor.busy || validating || editor.stale} onPress={() => { void editor.validate(); }} />
        <Action title="Discard changes" disabled={!editor.dirty || editor.busy || validating} onPress={requestDiscard} />
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
    {staff
      ? <ClubFilterCard title="Clubs shown" clubs={clubChoices} selectedIds={gridClubs.map((club) => club.id)}
        onChange={updateStaffClubs} open={staffFiltersOpen} onOpenChange={setStaffFiltersOpen} disabled={clubSelectionDisabled} />
      : <ClubFilterCard title="Your clubs" clubs={clubChoices} selectedIds={gridClubs.map((club) => club.id)}
        onChange={setGridClubIds} open={filtersOpen} onOpenChange={setFiltersOpen}
        emptyMessage="You are not enrolled in any clubs. Enrol in a club on Home." />}
    <Card>
      {staff && <>
        <Label>Schedule view</Label>
        <Note>Choose a view, then export its information for the clubs shown.</Note>
        <Actions>
          <Action selected={mode === 'grid'} title="Grid" onPress={() => { editor.closeSlot(); setStaffViewMode('grid'); }} />
          <Action selected={mode === 'meetings'} title="Meetings" onPress={() => { editor.closeSlot(); setStaffViewMode('meetings'); }} />
          <Action selected={mode === 'kits'} title="Kits" onPress={() => { editor.closeSlot(); setStaffViewMode('kits'); }} />
        </Actions>
      </>}
      {nativeGrid
        ? <ScheduleExportActions preview={{
          mode: 'grid', label: `${cycle.name} · ${cycle.status}${editor.dirty ? ' · Unsaved local schedule' : ''}`,
          hasMeetings: cycle.slots.some((slot) => gridClubs.some((club) => club.id === slot.clubId))
            || cycleAssignments.some((assignment) => gridClubs.some((club) => club.id === assignment.clubId)),
          highlight: highlightTitleId ? { title: highlightTitle?.name ?? 'Unavailable title', count: highlightCount } : undefined,
        }} makeSchedule={() => makeScheduleExport(viewData, gridClubs.map((club) => club.id), cycle, editor.dirty, 'grid', highlightTitleId)}
          disabled={editor.busy || validating || !!publication} staffClubCount={gridClubs.length} />
        : <ScheduleExportActions schedule={staff
          ? makeScheduleExport(viewData, gridClubs.map((club) => club.id), cycle, editor.dirty, staffViewMode, mode === 'grid' ? highlightTitleId : null)
          : makeMemberScheduleExport(data, gridClubs.map((club) => club.id), memberCycle?.id)}
          disabled={staff && (editor.busy || validating || !!publication)} staffClubCount={staff ? gridClubs.length : undefined} />}
      {staff && <ScheduleHandouts data={viewData} cycle={cycle} clubIds={gridClubs.map((club) => club.id)}
        unsaved={editor.dirty} pending={editor.hasPending} disabled={editor.busy || validating || !!publication} />}
    </Card>
    {!staff && <MemberSchedule key={JSON.stringify([person.id, memberCycle?.id, gridClubKey, memberMeetings.map((meeting) =>
      [meeting.key, meeting.date, meeting.month, meeting.cycle.startsOn, meeting.cycle.endsOn,
        meeting.assignment ? kitById.get(meeting.assignment.kitId)?.titleId : null,
        meeting.assignment ? titleById.has(kitById.get(meeting.assignment.kitId)?.titleId ?? '') : false])])}
      view={memberViewMode} onViewChange={setMemberViewMode} meetings={memberMeetings} today={today()}
      emptyMessage={clubChoices.length === 0 ? 'You are not enrolled in any clubs. Enrol in a club on Home.' : !memberCycle ? 'No drafted or published schedules are available for your clubs.' : gridClubs.length === 0 ? 'Select clubs to see their schedule.' : 'No meetings are available for the selected clubs in this cycle.'}
      labels={data.kitLabels}
      titleFor={(assignment) => titleById.get(kitById.get(assignment.kitId)?.titleId ?? '')}
      titleIdFor={(assignment) => kitById.get(assignment.kitId)?.titleId}
      clubNameFor={(clubId) => clubById.get(clubId)?.name ?? 'Unavailable club'} />}
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
    {staff && gridContent}
    {staff && mode === 'kits' && <Card>
      <Label>Kits</Label>
      {clubChoices.length > 0 && gridClubs.length === 0 ? <Note>Select clubs to see their assigned kits.</Note> : null}
      {kitEntries && <KitCalendarList entries={kitEntries} today={today()} wide={wide}
        clubNameFor={(clubId) => clubById.get(clubId)?.name ?? 'Unavailable club'} />}
    </Card>}
  </>;

  const focusedFairness = nativeGrid && focusedId ? fairness(viewData, cycle, focusedId, cycleAssignments) : null;
  return <Page title="Schedule" wide={wide} scroll={!nativeGrid}>
    {nativeGrid ? <NativeScheduleGridView header={content} row={grid?.rows[0]} clubIds={eligibleClubIds} focusedId={focusedId}
      onFocus={(id) => { setFocusedClubId(id); setExpandedId(null); }}
      clubNameFor={(id) => clubById.get(id)?.name ?? 'Unavailable club'}
      titleFor={(assignment) => titleById.get(kitById.get(assignment.kitId)?.titleId ?? '')}
      priorityFor={(titleId) => gridPriorities?.get(focusedId)?.get(titleId) ?? null}
      summary={focusedFairness ? `Fairness ${focusedFairness.score === null ? 'N/A' : `${Math.round(focusedFairness.score)}%`} · ${focusedFairness.assigned}/${focusedFairness.slots} assigned` : ''}
      highlightTitleId={highlightTitleId} selectedSlotId={editor.selectedSlotId} expandedId={expandedId}
      onToggle={(id) => setExpandedId(expandedId === id ? null : id)} renderDetail={renderDetail}
      onSelectSlot={(cycle.status === 'collecting' || cycle.status === 'drafted') && !validating && !publication ? editor.selectSlot : undefined}
      onAddSlot={(cycle.status === 'collecting' || cycle.status === 'drafted') && !validating && !publication ? editor.toggleSlot : undefined}
      onGenerateClub={(cycle.status === 'collecting' || cycle.status === 'drafted') && !validating && !publication ? (clubId) => editor.requestGenerateClub({ clubId }) : undefined}
      onHideClub={(clubId) => updateStaffClubs(gridClubs.filter((club) => club.id !== clubId).map((club) => club.id))}
      actionsDisabled={clubSelectionDisabled} clubResult={editor.clubResult} hasShownClubs={gridClubs.length > 0} />
      : content}
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
