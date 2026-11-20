import { usePreventRemove } from 'expo-router';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { assignmentProblems, draftAsync, exclusionUnlockIds, generationClubScope, id, meetingFor, prepareDraftExclusions, windowFor, type DraftMode, type DraftScope } from '../domain/logic';
import { reconcileCadence } from '../domain/cadence';
import { preserveUnassignedMeetingDates } from '../domain/meeting-rule';
import { dateRegeneratedSlots, prepareFullRegeneration, regenerationUnlockIds } from '../domain/schedule-regeneration';
import { scheduleHasChanges, slotChanges } from '../domain/cycle-overview';
import { validDate } from '../domain/dates';
import { generationConfirmation, scheduleSelectionPending } from '../domain/schedule-pending';
import type { Assignment, Cycle, Data, Title } from '../domain/model';
import { saveValidatedSchedule, validateSchedule, type ScheduleBasis, type ScheduleValidation } from '../state/api';
import { useShared } from '../state/shared';
import { useNavigationGuard } from './navigation-guard';
import { SearchPickerPanel } from './search-picker';
import { ScheduleTitlePicker } from './schedule-title-picker';
import { TitleCover } from './title-cover';
import { Action, Card, Field, Label, Note, styles as uiStyles } from './ui';

function AssignmentCover({ title }: { title: Title | undefined }) {
  if (title && (title.coverUrl || title.isbn.trim())) return <TitleCover coverUrl={title.coverUrl} isbn={title.isbn} />;
  return <View style={{ width: 48, height: 72, marginRight: 12, backgroundColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center' }}>
    <Text style={{ color: '#6b7280', fontSize: 10 }}>No cover</Text>
  </View>;
}

type Workspace = {
  base: Data;
  cycle: Cycle;
  snapshot: string;
  basis: ScheduleBasis;
  assignments: Assignment[];
  unlockIds: string[];
  generationProblems: string[];
};

function snapshot(data: Data): string {
  return JSON.stringify([data.library, data.cycles, data.ballots, data.assignments, data.kits, data.titles, data.clubs]);
}

function slotDiffOf(workspace: Workspace) {
  return slotChanges(workspace.base.cycles.find((item) => item.id === workspace.cycle.id)?.slots ?? [], workspace.cycle.slots);
}

function unassignedInScope(cycle: Cycle, assignments: Assignment[], scope: DraftScope): number {
  return cycle.slots.filter((slot) => slot.clubId === scope.clubId && !assignments.some((item) => item.slotId === slot.id)).length;
}

export function useScheduleWorkspace(data: Data, currentCycle: Cycle | undefined) {
  const shared = useShared();
  const navigationGuard = useNavigationGuard();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [meeting, setMeeting] = useState('');
  const [initialMeeting, setInitialMeeting] = useState('');
  const [kitId, setKitId] = useState('');
  const [swapId, setSwapId] = useState('');
  const [activePicker, setActivePicker] = useState<'title' | 'swap' | null>(null);
  const pickerTrigger = useRef<'title' | 'swap' | null>(null);
  const [message, setMessage] = useState('');
  const [clubResult, setClubResult] = useState<{ clubId: string; text: string; problems: string[] } | null>(null);
  const [validation, setValidation] = useState<ScheduleValidation | null>(null);
  const [checking, setChecking] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationMode, setGenerationMode] = useState<DraftMode>('clubs');
  const generatingRef = useRef(false);
  const [pendingAction, setPendingAction] = useState<{ description: string; confirmLabel: string; run: () => void; kind?: 'discard' | 'regenerate' } | null>(null);
  const [reconciliationRequired, setReconciliationRequired] = useState(false);
  const latest = useRef({ data, workspace, currentCycle });
  useLayoutEffect(() => { latest.current = { data, workspace, currentCycle }; }, [data, workspace, currentCycle]);
  const busy = generating || checking || shared.saving || !!pendingAction;
  const slotDiff = workspace ? slotDiffOf(workspace) : null;
  const slotsChanged = !!slotDiff && (slotDiff.newSlots.length > 0 || slotDiff.removedSlotIds.length > 0 || slotDiff.datedSlots.length > 0);
  const dirty = !!workspace && (slotsChanged || scheduleHasChanges(workspace.base.assignments.filter((a) => a.cycleId === workspace.cycle.id), workspace.assignments, workspace.unlockIds));
  const selectedAssignment = workspace?.assignments.find((item) => item.slotId === selectedSlotId);
  const pending = selectedSlotId ? scheduleSelectionPending(selectedAssignment, initialMeeting, kitId, meeting, swapId) : { selection: false, swap: false };
  const hasPending = pending.selection || pending.swap;
  const stale = !!workspace && (reconciliationRequired || !!shared.error || snapshot(data) !== workspace.snapshot);
  const proposalData = useMemo(() => workspace && dirty ? {
    ...workspace.base,
    cycles: workspace.base.cycles.map((cycle) => cycle.id === workspace.cycle.id ? workspace.cycle : cycle),
    assignments: [...workspace.base.assignments.filter((a) => a.cycleId !== workspace.cycle.id), ...workspace.assignments],
  } : null, [workspace, dirty]);
  useEffect(() => {
    if (!activePicker && pickerTrigger.current) {
      if (Platform.OS === 'web' && selectedSlotId) {
        const label = pickerTrigger.current === 'title' ? 'Choose a title and kit' : 'Swap with meeting';
        document.querySelector<HTMLElement>(`[aria-label="${label}"]`)?.focus();
      }
      pickerTrigger.current = null;
    }
  }, [activePicker, selectedSlotId]);

  function openPicker(picker: 'title' | 'swap') {
    pickerTrigger.current = picker;
    setActivePicker(picker);
  }

  const leaveDescription = dirty && hasPending ? 'Discard the unapplied selection and all unsaved schedule changes and leave?'
    : hasPending ? 'Discard the unapplied selection and leave?' : 'Discard unsaved schedule changes and leave?';
  const disablePrevention = usePreventRemove(dirty || hasPending || busy, ({ repeat }) => {
    if (busy) { setMessage('Wait for validation or saving to finish before leaving.'); return; }
    setPendingAction({ kind: 'discard', description: leaveDescription, confirmLabel: 'Confirm discard', run: () => { reset(); repeat(); } });
  });
  useEffect(() => {
    if (!dirty && !hasPending && !busy) return;
    return navigationGuard.register((continueNavigation) => {
      if (busy) { setMessage('Wait for validation or saving to finish before leaving.'); return; }
      setPendingAction({ kind: 'discard', description: leaveDescription, confirmLabel: 'Confirm discard', run: () => {
        reset(); disablePrevention(); continueNavigation();
      } });
    });
  // reset only calls stable state setters.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, dirty, hasPending, leaveDescription, disablePrevention, navigationGuard]);
  useEffect(() => {
    if (Platform.OS !== 'web' || (!dirty && !hasPending)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, hasPending]);

  function createWorkspace(cycle: Cycle): Workspace {
    const revisions = (items: { id: string; revision: number }[]) => items.map(({ id: itemId, revision }) => ({ id: itemId, revision }))
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    return {
      base: data, cycle, snapshot: snapshot(data),
      basis: { cycles: revisions(shared.data.cycles), kits: revisions(shared.data.kits), clubs: revisions(shared.data.clubs), settings: shared.data.library.revision },
      assignments: data.assignments.filter((a) => a.cycleId === cycle.id), unlockIds: [], generationProblems: [],
    };
  }

  function closeSlot() {
    setSelectedSlotId(null); setMeeting(''); setInitialMeeting(''); setKitId(''); setSwapId(''); setActivePicker(null);
  }

  function requestCloseSlot() {
    if (pendingAction) { setPendingAction(null); return; }
    if (activePicker) { setActivePicker(null); return; }
    if (busy) return;
    if (hasPending) setPendingAction({ description: 'Discard the unapplied selection? Applied local changes will be kept.', confirmLabel: 'Discard selection', run: closeSlot });
    else closeSlot();
  }

  function selectSlot(slotId: string) {
    if (busy) return;
    if (selectedSlotId === slotId && (dirty || !stale)) { closeSlot(); return; }
    const next = workspace && (dirty || !stale) ? workspace : currentCycle ? createWorkspace(currentCycle) : null;
    if (!next) return;
    const slot = next.cycle.slots.find((item) => item.id === slotId);
    if (!slot) { setMessage('This meeting is no longer available. Refresh the schedule.'); return; }
    const club = next.base.clubs.find((item) => item.id === slot.clubId);
    if (!club) { setMessage('This meeting references an unavailable club. Refresh the schedule.'); return; }
    const assignment = next.assignments.find((item) => item.slotId === slotId);
    setWorkspace(next);
    setSelectedSlotId(slotId);
    setMeeting(meetingFor(slot, club, assignment?.meeting));
    setInitialMeeting(meetingFor(slot, club, assignment?.meeting));
    setKitId(assignment?.kitId ?? '');
    setSwapId('');
    setMessage('');
  }

  function change(next: Assignment[], unlockIds = workspace?.unlockIds ?? []) {
    if (!workspace) return;
    setWorkspace({ ...workspace, assignments: next, unlockIds, generationProblems: [] });
    setValidation(null); setMessage('');
  }

  function reset() {
    setWorkspace(null); closeSlot(); setValidation(null); setMessage(''); setClubResult(null); setReconciliationRequired(false);
  }

  function requestDiscard() {
    if (busy) return;
    if (dirty || hasPending) setPendingAction({ kind: 'discard', description: 'Discard all unsaved schedule changes and unapplied selections?', confirmLabel: 'Confirm discard', run: reset });
    else reset();
  }

  function requestCycleChange(run: () => void) {
    if (busy) return;
    const changeCycle = () => { reset(); run(); };
    if (dirty || hasPending) setPendingAction({ description: 'Discard unsaved schedule changes and unapplied selections and change cycle?', confirmLabel: 'Confirm discard', run: changeCycle });
    else changeCycle();
  }

  async function regenerate(scope?: DraftScope, excludedClubIds: readonly string[] = []) {
    if (!currentCycle || (stale && dirty) || generatingRef.current) return;
    const source = workspace && (dirty || !stale) ? workspace : createWorkspace(currentCycle);
    generatingRef.current = true;
    setGenerating(true); setMessage(scope ? 'Generating assignments...' : 'Generating schedule...');
    try {
      if (!scope) {
        const reset = prepareFullRegeneration(source.base, source.cycle, excludedClubIds, id);
        const input = prepareDraftExclusions(reset.data, reset.cycle, excludedClubIds);
        const result = await draftAsync(input.data, input.cycle, true, undefined, generationMode);
        const dated = dateRegeneratedSlots(source.base, reset.cycle, excludedClubIds);
        const unlockIds = regenerationUnlockIds(source.base.assignments, reset.cycle.id, source.unlockIds);
        setWorkspace({ ...source, cycle: dated.cycle, assignments: result.assignments.filter((assignment) => assignment.cycleId === reset.cycle.id),
          unlockIds, generationProblems: [...new Set([...result.problems, ...dated.problems])] });
        setValidation(null); closeSlot(); setMessage(''); setClubResult(null);
        return;
      }
      const includedIds = scope ? [scope.clubId] : source.base.clubs.filter((club) => !excludedClubIds.includes(club.id)).map((club) => club.id);
      const cadence = reconcileCadence(source.cycle, source.base.clubs, includedIds, id);
      const removedSlotIds = new Set(cadence.removed.map((slot) => slot.id));
      const cadenceRemoved = source.assignments.filter((assignment) => removedSlotIds.has(assignment.slotId));
      const allAssignments = [...source.base.assignments.filter((a) => a.cycleId !== source.cycle.id), ...source.assignments.filter((a) => !removedSlotIds.has(a.slotId))];
      const input = prepareDraftExclusions({ ...source.base, cycles: source.base.cycles.map((cycle) => cycle.id === cadence.cycle.id ? cadence.cycle : cycle), assignments: allAssignments }, cadence.cycle, excludedClubIds);
      const result = await draftAsync(input.data, input.cycle, true, scope, generationMode);
      const generated = result.assignments.filter((a) => a.cycleId === source.cycle.id);
      const unlockIds = exclusionUnlockIds(source.base.assignments.filter((assignment) => assignment.cycleId === source.cycle.id), [...input.removed, ...cadenceRemoved], source.unlockIds);
      const cycle = preserveUnassignedMeetingDates(cadence.cycle, source.assignments, generated);
      setWorkspace({ ...source, cycle, assignments: generated, unlockIds, generationProblems: result.problems });
      setValidation(null); closeSlot();
      if (scope) {
        const before = unassignedInScope(cadence.cycle, source.assignments, scope);
        const after = unassignedInScope(cadence.cycle, generated, scope);
        const name = source.base.clubs.find((club) => club.id === scope.clubId)?.name ?? 'this club';
        const text = before === 0 ? `No unassigned meetings for ${name}.`
          : `Assigned ${before - after} of ${before} unassigned meetings for ${name}.${after ? ' See the reasons below.' : ''}`;
        setMessage('');
        setClubResult({ clubId: scope.clubId, text, problems: result.problems.filter((problem) => problem.startsWith(`${name} in `)) });
      } else { setMessage(''); setClubResult(null); }
    } catch (error: unknown) {
      setMessage(error instanceof Error ? `Unable to generate schedule: ${error.message}` : 'Unable to generate schedule.');
    } finally {
      generatingRef.current = false;
      setGenerating(false);
    }
  }

  function cadenceConfirmation(source: Workspace, clubIds: readonly string[]) {
    const cadence = reconcileCadence(source.cycle, source.base.clubs, clubIds, id);
    const details = cadence.removed.map((slot) => {
      const club = source.base.clubs.find((item) => item.id === slot.clubId);
      const assignment = source.assignments.find((item) => item.slotId === slot.id);
      const sharedLock = assignment && source.base.assignments.some((item) => item.id === assignment.id && item.locked);
      const date = assignment?.meeting ?? slot.meeting;
      return `${club?.name ?? slot.clubId} ${slot.month}${date ? ` (dated ${date})` : ''}${assignment ? assignment.locked || sharedLock ? ' (locked assignment will be unlocked and removed)' : ' (assignment will be removed)' : ''}`;
    });
    const additions = cadence.added.map((slot) => `${source.base.clubs.find((club) => club.id === slot.clubId)?.name ?? slot.clubId} ${slot.month}`);
    return [
      details.length ? `Cadence removes meetings: ${details.join('; ')}.` : '',
      additions.length ? `Cadence adds undated meetings: ${additions.join('; ')}. Club meeting rules will be used.` : '',
    ].filter(Boolean).join('\n');
  }

  function requestGenerate(shownClubIds: readonly string[]) {
    if (busy || generatingRef.current || (stale && dirty)) return;
    const source = workspace && (dirty || !stale) ? workspace : currentCycle ? createWorkspace(currentCycle) : null;
    if (!source) return;
    const scope = generationClubScope(source.base, source.cycle, source.assignments, shownClubIds);
    if (scope.missingClubIds.length) {
      setMessage('Some meetings or assignments reference unavailable clubs. Refresh the schedule before generating.');
      return;
    }
    if (!scope.shownCount) {
      setMessage('Show at least one club before generating a schedule.');
      return;
    }
    const excluded = scope.excludedClubIds;
    const cadenceDescription = cadenceConfirmation(source, source.base.clubs.filter((club) => !excluded.includes(club.id)).map((club) => club.id));
    const description = [generationConfirmation(scope.shownCount, excluded, source.assignments, source.base.assignments,
      dirty, hasPending, source.cycle, source.base.clubs, source.base.kits), cadenceDescription].filter(Boolean).join('\n');
    const capturedData = snapshot(data);
    const run = () => {
      if (latest.current.workspace !== workspace || latest.current.currentCycle?.id !== currentCycle?.id || snapshot(latest.current.data) !== capturedData) {
        setMessage('The schedule changed while confirmation was open. Review the current selection and generate again.');
        return;
      }
      void regenerate(undefined, excluded);
    };
    if (description) {
      setPendingAction({ kind: 'regenerate', description, confirmLabel: 'Confirm regenerate', run });
    } else run();
  }

  // Keeps every existing assignment and only fills empty slots of the scoped club.
  function requestGenerateClub(scope: DraftScope) {
    if (stale && dirty) { setMessage('The schedule changed elsewhere. Refresh, then discard local changes before generating.'); return; }
    if (busy || generatingRef.current) return;
    const source = workspace && (dirty || !stale) ? workspace : currentCycle ? createWorkspace(currentCycle) : null;
    if (!source) return;
    const description = cadenceConfirmation(source, [scope.clubId]);
    const capturedData = snapshot(data);
    const run = () => {
      if (latest.current.workspace !== workspace || latest.current.currentCycle?.id !== currentCycle?.id || snapshot(latest.current.data) !== capturedData) {
        setMessage('The schedule changed while confirmation was open. Review and generate again.');
        return;
      }
      void regenerate(scope);
    };
    if (hasPending || description) setPendingAction({ kind: 'regenerate', description: [description, hasPending ? 'Discard unapplied selections?' : 'Generate assignments for this club?'].filter(Boolean).join('\n'), confirmLabel: 'Confirm generate', run });
    else run();
  }

  // Adds or removes a meeting slot locally; the server only sees it on Save.
  function toggleSlot(clubId: string, month: string) {
    if (busy || generatingRef.current || !currentCycle) return;
    if (hasPending) { setMessage('Apply or discard the open selection before changing meetings.'); return; }
    if (stale && dirty) { setMessage('Shared data changed. Discard local changes and start again from refreshed data before saving.'); return; }
    const source = workspace && (dirty || !stale) ? workspace : createWorkspace(currentCycle);
    if (source.cycle.status !== 'collecting' && source.cycle.status !== 'drafted') { setMessage('Meetings can only change before publication.'); return; }
    const existing = source.cycle.slots.find((slot) => slot.clubId === clubId && slot.month === month);
    if (existing && source.assignments.some((item) => item.slotId === existing.id)) { setMessage('Clear the assignment before removing this meeting.'); return; }
    const slots = existing ? source.cycle.slots.filter((slot) => slot.id !== existing.id) : [...source.cycle.slots, { id: id(), clubId, month, meeting: null }];
    setWorkspace({ ...source, cycle: { ...source.cycle, slots }, generationProblems: [] });
    if (existing && selectedSlotId === existing.id) closeSlot();
    setValidation(null); setMessage('');
  }

  async function save(token: string) {
    if (!workspace) return;
    try {
      await shared.mutate(() => saveValidatedSchedule(workspace.cycle.id, workspace.assignments, workspace.cycle.revision, false, workspace.unlockIds, token, workspace.basis, slotDiffOf(workspace)));
      reset();
      setMessage('Shared schedule draft saved.');
    } catch (error: unknown) {
      setValidation(null);
      setReconciliationRequired(true);
      setMessage(`${error instanceof Error ? error.message : 'Unable to save schedule.'} Refresh, then discard local changes and inspect the shared schedule before starting again.`);
    }
  }

  async function validate() {
    if (!workspace || !dirty) return;
    if (stale) { setMessage('Shared data changed. Discard local changes and start again from refreshed data before saving.'); return; }
    setChecking(true); setMessage('');
    try {
      const result = await validateSchedule(workspace.cycle.id, workspace.assignments, workspace.cycle.revision, false, workspace.unlockIds, workspace.basis, slotDiffOf(workspace));
      if (result.warnings.length) setValidation(result);
      else await save(result.token);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'Unable to validate schedule.');
    } finally { setChecking(false); }
  }

  async function confirmSave(token: string) {
    if (busy) return;
    setChecking(true);
    try { await save(token); } finally { setChecking(false); }
  }

  function renderSelectedSlot() {
    if (!workspace || !selectedSlotId) return null;
    const { base, cycle, assignments } = workspace;
    const slot = cycle.slots.find((item) => item.id === selectedSlotId);
    if (!slot) return null;
    const selectedSlot = slot;
    const selected = assignments.find((item) => item.slotId === selectedSlotId);
    const club = base.clubs.find((item) => item.id === slot.clubId);
    const allAssignments = [...base.assignments.filter((a) => a.cycleId !== cycle.id), ...assignments];
    const currentKit = base.kits.find((kit) => kit.id === selected?.kitId);
    const currentTitle = base.titles.find((title) => title.id === currentKit?.titleId);
    const pendingKit = base.kits.find((kit) => kit.id === kitId);
    const pendingTitle = base.titles.find((title) => title.id === pendingKit?.titleId);
    const selectionChanged = !!kitId && (!selected || kitId !== selected.kitId || meeting !== selected.meeting);
    const swapOptions = assignments.filter((item) => item.id !== selected?.id && !item.locked).map((item) => ({
      id: item.id, label: `${base.clubs.find((value) => value.id === item.clubId)?.name ?? 'Club'} · ${item.meeting}`,
      detail: base.titles.find((title) => title.id === base.kits.find((kit) => kit.id === item.kitId)?.titleId)?.name ?? 'Unavailable title', group: 'all',
    }));
    if (activePicker === 'title') return <ScheduleTitlePicker data={base} cycle={cycle} slot={slot} assignments={assignments} selected={selected}
      pendingKitId={kitId} meeting={meeting} stale={stale} onSelect={setKitId} onClose={() => setActivePicker(null)} />;
    if (activePicker === 'swap') return <SearchPickerPanel label="Swap with meeting" selectedId={swapId} groups={[{ value: 'all', label: 'All' }]}
      options={swapOptions} onSelect={setSwapId} onClose={() => setActivePicker(null)} closeLabel="Close picker" />;
    function setKit() {
      if (!pendingKit || !pendingTitle) { setMessage('Select an available title and kit first.'); return; }
      if (selected?.locked) { setMessage('Unlock this assignment locally before changing it.'); return; }
      if (!validDate(meeting) || !meeting.startsWith(`${selectedSlot.month}-`) || meeting <= cycle.deadline || (selectedSlot.meeting && meeting !== selectedSlot.meeting)) {
        setMessage('The meeting must be in the slot month, after the deadline, and match the configured meeting date.'); return;
      }
      const next: Assignment = { id: selected?.id ?? id(), cycleId: cycle.id, slotId: selectedSlot.id, clubId: selectedSlot.clubId,
        kitId, ...windowFor(base, meeting), locked: false };
      if (selected && selected.meeting === meeting) { next.ready = selected.ready; next.due = selected.due; }
      change([...assignments.filter((item) => item.slotId !== selectedSlot.id), next]);
    }
    return <Card>
      <Label>{club?.name ?? 'Unavailable club'} · {slot.month}</Label>
      <Note>Changes are local until Save draft. Save selection applies the choice locally.</Note>
      {stale && <Text style={{ color: '#a22525' }}>Shared data has changed. Inspect your selection, then discard local changes and start again before saving.</Text>}
      {message ? <Text>{message}</Text> : null}
      <Label>Current assignment</Label>
      {selected ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <AssignmentCover title={currentTitle} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text>{currentTitle?.name ?? 'Unavailable title'}</Text>
          <Note>{currentKit ? `${currentKit.barcode} · ${currentKit.branch} · ${currentKit.status}` : 'Kit unavailable'} · {selected.locked ? 'Locked' : 'Unlocked'}</Note>
          <Note>{selected.ready} to {selected.due}</Note>
        </View>
        <Action title="Clear" disabled={busy || selected.locked} onPress={() => {
          const clear = () => { change(assignments.filter((item) => item.id !== selected.id)); setInitialMeeting(meeting); setKitId(''); setSwapId(''); };
          if (hasPending) setPendingAction({ description: 'Discard the unapplied selection and clear this assignment locally?', confirmLabel: 'Clear assignment', run: clear });
          else clear();
        }} />
      </View> : <View style={{ gap: 8 }}>
        <Note>No title assigned.</Note>
        <Action title="Remove meeting" disabled={busy || hasPending} onPress={() => toggleSlot(slot.clubId, slot.month)} />
      </View>}
      {selected && assignmentProblems(base, selected, allAssignments).map((problem) => <Text key={problem} style={{ color: '#a22525' }}>{problem}</Text>)}
      {selected?.locked && <Action title="Unlock locally" disabled={busy} onPress={() => {
        const unlockIds = base.assignments.some((item) => item.id === selected.id && item.locked) && !workspace.unlockIds.includes(selected.id)
          ? [...workspace.unlockIds, selected.id] : workspace.unlockIds;
        change(assignments.map((item) => item.id === selected.id ? { ...item, locked: false } : item), unlockIds);
      }} />}
      {selected && !selected.locked && <Action title="Lock locally" disabled={busy || hasPending} onPress={() => {
        change(assignments.map((item) => item.id === selected.id ? { ...item, locked: true } : item));
        setKitId(selected.kitId); setMeeting(selected.meeting);
      }} />}
      <View style={{ gap: 5 }}><Label>Choose a title and kit</Label>
        <Pressable accessibilityRole="button" accessibilityLabel="Choose a title and kit" disabled={busy || !!selected?.locked}
          onPress={() => openPicker('title')} style={({ pressed }) => [uiStyles.input, pressed && uiStyles.pressed, (busy || !!selected?.locked) && uiStyles.disabled]}>
          <Text>{pendingKit ? `${pendingTitle?.name ?? 'Unavailable title'} · ${pendingKit.barcode}` : 'Select a title and kit'}</Text>
        </Pressable>
      </View>
      {pendingKit && (!selected || pendingKit.id !== selected.kitId) && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <AssignmentCover title={pendingTitle} />
        <View style={{ flex: 1 }}><Label>Pending selection</Label><Text>{pendingTitle?.name ?? 'Unavailable title'} · {pendingKit.barcode}</Text></View>
      </View>}
      {!slot.meeting && <Field label="Meeting date (YYYY-MM-DD)" value={meeting} onChangeText={setMeeting} editable={!busy && !selected?.locked} />}
      {selectionChanged && <Action title="Save selection" tone="primary" disabled={busy || !!selected?.locked} onPress={setKit} />}
      {selected && !selected.locked && <View style={{ gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Swap with meeting" disabled={busy}
          onPress={() => openPicker('swap')} style={({ pressed }) => [uiStyles.input, pressed && uiStyles.pressed, busy && uiStyles.disabled]}>
          <Text>{swapOptions.find((option) => option.id === swapId)?.label ?? 'Select a meeting'}</Text>
        </Pressable>
        {pending.selection && <Note>Save or revert the title and date selection before swapping or locking.</Note>}
        {!pending.selection && pending.swap && <Note>Complete the swap or close the editor before locking.</Note>}
        <Action title="Swap kits locally" disabled={busy || !swapId || pending.selection} onPress={() => {
          const other = assignments.find((item) => item.id === swapId);
          if (!other || other.locked) { setMessage('Choose another unlocked assignment.'); return; }
          change(assignments.map((item) => item.id === selected.id ? { ...item, kitId: other.kitId } : item.id === other.id ? { ...item, kitId: selected.kitId } : item));
          setKitId(other.kitId); setSwapId('');
        }} />
      </View>}
    </Card>;
  }

  return {
    workspace, proposalData, dirty, stale, busy, message, clubResult, validation, selectedSlotId, pendingAction, activePicker, hasPending, generationMode,
    setGenerationMode,
    selectSlot, closeSlot, requestCloseSlot, requestDiscard, requestCycleChange, requestGenerate, requestGenerateClub, toggleSlot, validate, confirmSave, renderSelectedSlot,
    cancelValidation: () => setValidation(null),
    confirmAction: () => { const action = pendingAction; setPendingAction(null); action?.run(); },
    cancelAction: () => setPendingAction(null),
  };
}
