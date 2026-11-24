import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, LayoutAnimation, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Action, Actions, Card, Label, Note, Page } from './ui';
import { ClubFilterCard } from './club-filter';
import { ScheduleGridView } from './schedule-grid';
import { SCHEDULE_DESKTOP_WIDTH } from './schedule-layout';
import { ScheduleInstructions } from './schedule-instructions';
import { ScheduleExportActions } from './schedule-export';
import { ScheduleHandouts } from './schedule-handouts';
import { KitCalendarList } from './kit-calendar-list';
import { scheduleStyles } from './schedule-styles';
import { useScheduleConfirmation, type ScheduleEditor } from './schedule-confirmation';
import { buildKitCalendar } from '../domain/kit-calendar';
import { monthsInRange, scheduleByKit, scheduleGrid } from '../domain/cycle-overview';
import { today } from '../domain/dates';
import { scheduleWarning } from '../domain/schedule-warning';
import { makeScheduleExport, type StaffScheduleView } from '../domain/schedule-export';
import { assignmentProblem, fairness, generationClubScope, loanOverrun, rankings } from '../domain/logic';
import type { Assignment, Cycle } from '../domain/model';
import { saveValidatedSchedule, validateSchedule, type ScheduleValidation } from '../state/api';
import { useShared } from '../state/shared';
import { useStore } from '../state/store';

const strategyDescriptions = {
  clubs: 'Fill meetings, then improve the lowest club fairness scores.',
  utilisation: 'Fill meetings, then use fewer kits, favour popular titles and consider fairness.',
};

export function StaffSchedule({ editor, selectedCycle, onSelectCycle }: { editor: ScheduleEditor; selectedCycle: Cycle | undefined; onSelectCycle: (id: string) => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = Platform.OS === 'web' && width >= SCHEDULE_DESKTOP_WIDTH;
  const { data } = useStore();
  const shared = useShared();
  const [messages, setMessages] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const modalOpen = !!editor.selectedSlotId;
  const { dialogPending, dialogTitle, regeneratePending, pendingConfirmation, dialogContent, dialogConfirmation, rememberTrigger, requestDiscard } = useScheduleConfirmation(editor, modalOpen);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [highlightTitleId, setHighlightTitleId] = useState<string | null>(null);
  const [showAllMessages, setShowAllMessages] = useState(false);
  const [staffViewMode, setStaffViewMode] = useState<StaffScheduleView>('grid');
  const [publication, setPublication] = useState<{ cycleId: string; revision: number; assignments: Assignment[]; validation: ScheduleValidation } | null>(null);
  const [validating, setValidating] = useState(false);
  const [staffClubIds, setStaffClubIds] = useState<string[] | null>(null);
  const [staffFiltersOpen, setStaffFiltersOpen] = useState(false);
  const [cycleOpen, setCycleOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [expandedClubs, setExpandedClubs] = useState<string[]>([]);
  const viewData = editor.proposalData ?? data;
  const cycle = editor.workspace && (editor.dirty || editor.selectedSlotId) ? editor.workspace.cycle : selectedCycle;
  const mode = staffViewMode;
  const cycleId = cycle?.id;
  const clubChoices = viewData.clubs;
  const visibleAssignments = viewData.assignments.filter((a) => a.cycleId === cycleId);
  const kitById = new Map(viewData.kits.map((kit) => [kit.id, kit] as const));
  const titleById = new Map(viewData.titles.map((title) => [title.id, title] as const));
  const clubById = new Map(viewData.clubs.map((club) => [club.id, club] as const));
  const gridCycle = cycle;
  const gridClubs = staffClubIds ? clubChoices.filter((club) => staffClubIds.includes(club.id)) : clubChoices;
  const gridClubKey = gridClubs.map((club) => club.id).join('|');
  const grid = useMemo(() => mode === 'grid' && gridCycle
    ? scheduleGrid(viewData, gridCycle, gridClubKey ? gridClubKey.split('|') : [], viewData.assignments)
    : null, [mode, gridCycle, viewData, gridClubKey]);
  const problemClubs = new Set(gridClubs.map((club) => club.id));
  const problems = new Map(visibleAssignments.filter((assignment) => problemClubs.has(assignment.clubId))
    .map((assignment) => [assignment.id, assignmentProblem(viewData, assignment, viewData.assignments) ?? null] as const));
  const gridPriorities = useMemo(() => mode === 'grid' && gridCycle
    ? new Map((gridClubKey ? gridClubKey.split('|') : []).map((clubId) =>
      [clubId, new Map((gridCycle.finalized[clubId] ?? rankings(viewData, gridCycle, clubId, true))
        .map((titleId, index) => [titleId, index + 1] as const))] as const))
    : null, [mode, gridCycle, gridClubKey, viewData]);
  const kitEntries = mode === 'kits' && cycle
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
  const canEditMeetings = !!cycle && (cycle.status === 'collecting' || cycle.status === 'drafted') && !validating && !publication;
  const modalSlot = editor.workspace?.cycle.slots.find((slot) => slot.id === editor.selectedSlotId);
  const modalClub = editor.workspace?.base.clubs.find((club) => club.id === modalSlot?.clubId);
  const modalAssignment = editor.workspace?.assignments.find((item) => item.slotId === editor.selectedSlotId);
  const modalTitleId = editor.workspace?.base.kits.find((kit) => kit.id === modalAssignment?.kitId)?.titleId;
  const highlightTitle = highlightTitleId ? titleById.get(highlightTitleId) : undefined;
  const countTitleClubs = (titleId: string | null | undefined) => titleId
    ? new Set(grid?.rows.filter((row) => row.cells.some((cell) => cell.assignment && kitById.get(cell.assignment.kitId)?.titleId === titleId)).map((row) => row.clubId)).size
    : 0;
  const highlightCount = countTitleClubs(highlightTitleId);
  const modalTitleCount = countTitleClubs(modalTitleId);
  function setHighlight(titleId: string | null) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setHighlightTitleId(titleId);
  }
  function requestGenerate() {
    rememberTrigger();
    editor.requestGenerate(gridClubs.map((club) => club.id));
  }
  const discardUnavailableProposal = editor.dirty && <Card>
    <Note>Unsaved staff schedule changes are held on this device.</Note>
    <Action title="Discard unsaved staff changes" disabled={editor.busy} onPress={requestDiscard} />
  </Card>;
  if (!cycle) return <Page title="Schedule" wide={wide}>{pendingConfirmation}{dialogConfirmation}{discardUnavailableProposal}<Actions><ScheduleInstructions /></Actions><Note>No shared cycle is available. Staff can create one, or an administrator can run the explicit server demo seed.</Note></Page>;
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
    if (editor.selectedSlotId && cycle && !cycle.slots.some((slot) => slot.id === editor.selectedSlotId && ids.includes(slot.clubId))) editor.closeSlot();
  }

  function renderDetail(assignment: Assignment) {
    const kit = kitById.get(assignment.kitId);
    const titleId = kit?.titleId;
    const problem = problems.get(assignment.id) ?? null;
    const highlightClubs = countTitleClubs(titleId);
    const highlightCountText = `${highlightClubs} ${highlightClubs === 1 ? 'club' : 'clubs'}`;
    return <View style={{ width: '100%', marginBottom: 12, padding: 12, borderRadius: 8, backgroundColor: '#f3f4f6' }}>
      <Text style={{ fontWeight: '600' }}>{clubById.get(assignment.clubId)?.name ?? 'Unavailable club'} · {titleById.get(titleId ?? '')?.name ?? 'Unavailable title'}</Text>
      {problem && <Text style={{ color: '#a22525' }}>Needs review: {problem}</Text>}
      {loanOverrun(viewData, assignment) && <Text style={{ color: '#9a5b00' }}>{loanOverrun(viewData, assignment)}</Text>}
      <Text>{kit?.barcode ?? 'Unavailable kit'} · Ready {assignment.ready} · Meeting {assignment.meeting} · Due {assignment.due}</Text>
      <Actions>
        {!!titleId && <Action title={`Highlight title (${highlightCountText})`} accessibilityLabel={`Highlight title across the schedule, assigned to ${highlightCountText}`} onPress={() => setHighlight(titleId)} />}
        {canEditMeetings && <Action title="Edit meeting" accessibilityLabel={`Edit meeting for ${clubById.get(assignment.clubId)?.name ?? 'club'}`} onPress={() => editor.selectSlot(assignment.slotId)} />}
        <Action title="Close details" onPress={() => setExpandedId(null)} />
      </Actions>
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
    if (!cycle || editor.dirty || editor.busy) return;
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
    {mode === 'grid' && <Note>Cover badges show club priority; — means unranked. Fairness averages priority weights across all club slots: first choice is 100%, last is 1/N, and unranked, repeated and unassigned slots score zero. No priorities or slots: N/A.</Note>}
    {mode === 'grid' && highlightTitle && grid && <Card>
      <Label>Highlighting · {highlightTitle.name}</Label>
      <Note>{highlightCount} {highlightCount === 1 ? 'club' : 'clubs'} in {gridCycle?.name ?? 'this cycle'}. Other rows are temporarily hidden. Clubs shown still controls generation and CSV exports; the Grid PDF matches this highlight.</Note>
      <Actions><Action title="Clear highlight" onPress={() => setHighlight(null)} /></Actions>
    </Card>}
    {mode === 'grid' && (grid
      ? (grid.rows.length === 0
        ? (clubChoices.length === 0 ? null : <Note>Select at least one club to show the grid.</Note>)
        : <ScheduleGridView grid={grid} wide={wide} clubNameFor={(clubId) => clubById.get(clubId)?.name ?? 'Unavailable club'}
          titleFor={(assignment) => titleById.get(kitById.get(assignment.kitId)?.titleId ?? '')}
          sharedLayout highlightTitleId={highlightTitleId}
          expandedId={expandedId} showProblems onToggle={(assignmentId) => setExpandedId(expandedId === assignmentId ? null : assignmentId)}
          renderDetail={renderDetail}
          selectedSlotId={editor.selectedSlotId}
          onSelectSlot={canEditMeetings ? editor.selectSlot : undefined}
          onAddSlot={canEditMeetings ? editor.toggleSlot : undefined}
          onGenerateClub={canEditMeetings ? (clubId) => editor.requestGenerateClub({ clubId }) : undefined}
          clubActionsDisabled={clubSelectionDisabled}
          priorityFor={(clubId, titleId) => gridPriorities?.get(clubId)?.get(titleId) ?? null}
          clubResult={editor.clubResult}
          clubSummaryFor={(clubId) => { const result = fairness(viewData, cycle, clubId, cycleAssignments); return `Fairness ${result.score === null ? 'N/A' : `${Math.round(result.score)}%`} · ${result.assigned}/${result.slots} assigned`; }}
          onHideClub={(clubId) => updateStaffClubs(gridClubs.filter((club) => club.id !== clubId).map((club) => club.id))} />)
      : <Note>No drafted or published schedule is available for your clubs yet.</Note>)}
  </>;

  const content = <>
    <Card>
      <Label>{`${cycle.name} · ${cycle.status}`}</Label>
      <Actions>
        {data.cycles.length > 1 && <Action title={cycleOpen ? 'Close cycles' : 'Change cycle'} onPress={() => setCycleOpen(!cycleOpen)} />}
        <Action title={toolsOpen ? 'Hide schedule actions' : 'Schedule actions'} onPress={() => setToolsOpen(!toolsOpen)} />
        <ScheduleInstructions />
      </Actions>
      {cycleOpen && <Actions>{data.cycles.map((value) => <Action key={value.id} selected={value.id === cycle.id} disabled={editor.busy || validating} title={value.name} onPress={() => {
        if (value.id !== cycle.id) {
          editor.requestCycleChange(() => {
            onSelectCycle(value.id); setMessages([]); setMessage('');
            setPublication(null); setExpandedId(null); setShowAllMessages(false); setCycleOpen(false);
          });
        } else {
          setCycleOpen(false);
        }
      }} />)}</Actions>}
      {toolsOpen && <>
        <Note>Loans include a {viewData.library.bufferDays}-day turnaround buffer.</Note>
        {cycle.status === 'collecting' && cycleAssignments.length > 0 && <Note>
          Existing assignments may be provisional. Full generation replaces shown clubs&apos; dates and assignments, including locked assignments after confirmation. Picked-up kits or reading history can prevent drafting or publication.
        </Note>}
        <Actions>
          <Action tone="primary" title="Publish schedule" disabled={validating || editor.busy || editor.dirty || !!publication || cycle.status !== 'drafted'} onPress={() => { void publish(); }} />
          <Action title="Refresh shared schedule" disabled={editor.busy || validating} onPress={() => { void shared.refresh().catch((error: unknown) => setMessages([error instanceof Error ? error.message : 'Unable to refresh.'])); }} />
        </Actions>
      </>}
      {publication && <>
        <Note>Publishing these warnings can create impossible or unsafe schedules and affect other cycles. Review every issue before confirming.</Note>
        {publication.validation.warnings.map((warning, index) => <Text key={`${warning.slotId}-${index}`} style={{ color: '#a22525' }}>{scheduleWarning(data, cycle, warning)}</Text>)}
        <Actions><Action tone="danger" title="Publish despite warnings" disabled={editor.busy || editor.dirty || validating || publication.cycleId !== cycle.id || publication.revision !== cycle.revision}
          onPress={() => { void publishValidated(publication); }} /><Action title="Cancel publication" disabled={shared.saving} onPress={() => setPublication(null)} /></Actions>
      </>}
      {(showAllMessages ? messages : messages.slice(0, 5)).map((item, index) => <Text key={`${item}-${index}`} style={{ color: '#a22525' }}>{item}</Text>)}
      {messages.length > 5 && <Action title={showAllMessages ? 'Show fewer messages' : `Show all messages (${messages.length})`} onPress={() => setShowAllMessages(!showAllMessages)} />}
      {message ? <Text>{message}</Text> : null}
      {editor.message ? <Text>{editor.message}</Text> : null}
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
    <Card>
      <Label>{editor.dirty ? 'Unsaved local schedule' : 'Shared schedule'}</Label>
      {editor.dirty
        ? <Note>Changes are visible only on this device until saved. Saving creates a shared draft; publishing is separate.</Note>
        : (cycle.status === 'collecting' || cycle.status === 'drafted') && <Note>Select a meeting in Grid, then Edit meeting, to change it locally. Nothing changes for other users until you save a draft.</Note>}
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
    </Card>
    <ClubFilterCard title="Clubs shown" clubs={clubChoices} selectedIds={gridClubs.map((club) => club.id)}
      onChange={updateStaffClubs} open={staffFiltersOpen} onOpenChange={setStaffFiltersOpen} disabled={clubSelectionDisabled} />
    <Card>
      <Label>Schedule view</Label>
      <Note>Choose a view, then export its information for the clubs shown.</Note>
      <Actions>
        <Action selected={mode === 'grid'} title="Grid" onPress={() => { editor.closeSlot(); setStaffViewMode('grid'); }} />
        <Action selected={mode === 'meetings'} title="Meetings" onPress={() => { editor.closeSlot(); setStaffViewMode('meetings'); }} />
        <Action selected={mode === 'kits'} title="Kits" onPress={() => { editor.closeSlot(); setStaffViewMode('kits'); }} />
      </Actions>
      <ScheduleExportActions schedule={makeScheduleExport(viewData, gridClubs.map((club) => club.id), cycle, editor.dirty, staffViewMode, mode === 'grid' ? highlightTitleId : null)}
          disabled={editor.busy || validating || !!publication} staffClubCount={gridClubs.length} />
      <ScheduleHandouts data={viewData} cycle={cycle} clubIds={gridClubs.map((club) => club.id)}
        unsaved={editor.dirty} pending={editor.hasPending} disabled={editor.busy || validating || !!publication} />
    </Card>
    {mode === 'meetings' && <Card>
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
    {gridContent}
    {mode === 'kits' && <Card>
      <Label>Kits</Label>
      {clubChoices.length > 0 && gridClubs.length === 0 ? <Note>Select clubs to see their assigned kits.</Note> : null}
      {kitEntries && <KitCalendarList entries={kitEntries} today={today()} wide={wide}
        clubNameFor={(clubId) => clubById.get(clubId)?.name ?? 'Unavailable club'} />}
    </Card>}
  </>;

  return <Page title="Schedule" wide={wide}>{content}</Page>;
}
