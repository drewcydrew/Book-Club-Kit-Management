import { usePreventRemove } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { assignmentProblems, draftAsync, id, meetingFor, windowFor, type DraftScope } from '../domain/logic';
import { scheduleHasChanges } from '../domain/cycle-overview';
import { validDate } from '../domain/dates';
import { scheduleSelectionPending } from '../domain/schedule-pending';
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
  const [validation, setValidation] = useState<ScheduleValidation | null>(null);
  const [checking, setChecking] = useState(false);
  const [generating, setGenerating] = useState(false);
  const generatingRef = useRef(false);
  const [pendingAction, setPendingAction] = useState<{ description: string; confirmLabel: string; run: () => void } | null>(null);
  const [reconciliationRequired, setReconciliationRequired] = useState(false);
  const busy = generating || checking || shared.saving || !!pendingAction;
  const dirty = !!workspace && scheduleHasChanges(workspace.base.assignments.filter((a) => a.cycleId === workspace.cycle.id), workspace.assignments, workspace.unlockIds);
  const selectedAssignment = workspace?.assignments.find((item) => item.slotId === selectedSlotId);
  const pending = selectedSlotId ? scheduleSelectionPending(selectedAssignment, initialMeeting, kitId, meeting, swapId) : { selection: false, swap: false };
  const hasPending = pending.selection || pending.swap;
  const stale = !!workspace && (reconciliationRequired || !!shared.error || snapshot(data) !== workspace.snapshot);
  const proposalData = useMemo(() => workspace && dirty ? {
    ...workspace.base,
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
    setPendingAction({ description: leaveDescription, confirmLabel: 'Confirm discard', run: () => { reset(); repeat(); } });
  });
  useEffect(() => {
    if (!dirty && !hasPending && !busy) return;
    return navigationGuard.register((continueNavigation) => {
      if (busy) { setMessage('Wait for validation or saving to finish before leaving.'); return; }
      setPendingAction({ description: leaveDescription, confirmLabel: 'Confirm discard', run: () => {
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
    const assignment = next.assignments.find((item) => item.slotId === slotId);
    setWorkspace(next);
    setSelectedSlotId(slotId);
    setMeeting(assignment?.meeting ?? meetingFor(slot));
    setInitialMeeting(assignment?.meeting ?? meetingFor(slot));
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
    setWorkspace(null); closeSlot(); setValidation(null); setMessage(''); setReconciliationRequired(false);
  }

  function requestDiscard() {
    if (busy) return;
    if (dirty || hasPending) setPendingAction({ description: 'Discard all unsaved schedule changes and unapplied selections?', confirmLabel: 'Confirm discard', run: reset });
    else reset();
  }

  function requestCycleChange(run: () => void) {
    if (busy) return;
    const changeCycle = () => { reset(); run(); };
    if (dirty || hasPending) setPendingAction({ description: 'Discard unsaved schedule changes and unapplied selections and change cycle?', confirmLabel: 'Confirm discard', run: changeCycle });
    else changeCycle();
  }

  async function regenerate(scope?: DraftScope) {
    if (!currentCycle || (stale && dirty) || generatingRef.current) return;
    const source = workspace && (dirty || !stale) ? workspace : createWorkspace(currentCycle);
    const allAssignments = [...source.base.assignments.filter((a) => a.cycleId !== source.cycle.id), ...source.assignments];
    generatingRef.current = true;
    setGenerating(true); setMessage(scope ? 'Generating assignments...' : 'Generating schedule...');
    try {
      const result = await draftAsync({ ...source.base, assignments: allAssignments }, source.cycle, true, scope);
      setWorkspace({ ...source, assignments: result.assignments.filter((a) => a.cycleId === source.cycle.id), generationProblems: result.problems });
      setValidation(null); setMessage(''); closeSlot();
    } catch (error: unknown) {
      setMessage(error instanceof Error ? `Unable to generate schedule: ${error.message}` : 'Unable to generate schedule.');
    } finally {
      generatingRef.current = false;
      setGenerating(false);
    }
  }

  function requestGenerate() {
    if (busy || generatingRef.current || (stale && dirty)) return;
    if (dirty || hasPending) setPendingAction({ description: 'Regenerate and replace unlocked local assignments and unapplied selections?', confirmLabel: 'Confirm regenerate', run: () => { void regenerate(); } });
    else void regenerate();
  }

  // Keeps every existing assignment and only fills empty slots of the scoped club and months.
  function requestGenerateClub(scope: DraftScope) {
    if (busy || generatingRef.current || (stale && dirty)) return;
    const run = () => { void regenerate(scope); };
    if (hasPending) setPendingAction({ description: 'Generate assignments and discard unapplied selections?', confirmLabel: 'Confirm generate', run });
    else run();
  }

  async function save(token: string) {
    if (!workspace) return;
    try {
      await shared.mutate(() => saveValidatedSchedule(workspace.cycle.id, workspace.assignments, workspace.cycle.revision, false, workspace.unlockIds, token, workspace.basis));
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
      const result = await validateSchedule(workspace.cycle.id, workspace.assignments, workspace.cycle.revision, false, workspace.unlockIds, workspace.basis);
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
      </View> : <Note>No title assigned.</Note>}
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
    workspace, proposalData, dirty, stale, busy, message, validation, selectedSlotId, pendingAction, activePicker, hasPending,
    selectSlot, closeSlot, requestCloseSlot, requestDiscard, requestCycleChange, requestGenerate, requestGenerateClub, validate, confirmSave, renderSelectedSlot,
    cancelValidation: () => setValidation(null),
    confirmAction: () => { const action = pendingAction; setPendingAction(null); action?.run(); },
    cancelAction: () => setPendingAction(null),
  };
}
