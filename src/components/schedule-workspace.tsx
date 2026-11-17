import { usePreventRemove } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { assignmentProblems, draft, id, meetingFor, windowFor } from '../domain/logic';
import { scheduleHasChanges } from '../domain/cycle-overview';
import { validDate } from '../domain/dates';
import type { Assignment, Cycle, Data, Title } from '../domain/model';
import { saveValidatedSchedule, validateSchedule, type ScheduleBasis, type ScheduleValidation } from '../state/api';
import { useShared } from '../state/shared';
import { useNavigationGuard } from './navigation-guard';
import { SearchPicker } from './search-picker';
import { ScheduleTitlePicker } from './schedule-title-picker';
import { TitleCover } from './title-cover';
import { Action, Card, Field, Label, Note } from './ui';

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
  const [kitId, setKitId] = useState('');
  const [swapId, setSwapId] = useState('');
  const [message, setMessage] = useState('');
  const [validation, setValidation] = useState<ScheduleValidation | null>(null);
  const [checking, setChecking] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ description: string; confirmLabel: string; run: () => void } | null>(null);
  const [reconciliationRequired, setReconciliationRequired] = useState(false);
  const busy = checking || shared.saving || !!pendingAction;
  const dirty = !!workspace && scheduleHasChanges(workspace.base.assignments.filter((a) => a.cycleId === workspace.cycle.id), workspace.assignments, workspace.unlockIds);
  const stale = !!workspace && (reconciliationRequired || !!shared.error || snapshot(data) !== workspace.snapshot);
  const proposalData = useMemo(() => workspace && dirty ? {
    ...workspace.base,
    assignments: [...workspace.base.assignments.filter((a) => a.cycleId !== workspace.cycle.id), ...workspace.assignments],
  } : null, [workspace, dirty]);

  const disablePrevention = usePreventRemove(dirty || busy, ({ repeat }) => {
    if (busy) { setMessage('Wait for validation or saving to finish before leaving.'); return; }
    setPendingAction({ description: 'Discard unsaved schedule changes and leave?', confirmLabel: 'Confirm discard', run: () => { setWorkspace(null); repeat(); } });
  });
  useEffect(() => {
    if (!dirty && !busy) return;
    return navigationGuard.register((continueNavigation) => {
      if (busy) { setMessage('Wait for validation or saving to finish before leaving.'); return; }
      setPendingAction({ description: 'Discard unsaved schedule changes and leave?', confirmLabel: 'Confirm discard', run: () => {
        setWorkspace(null); disablePrevention(); continueNavigation();
      } });
    });
  }, [busy, dirty, disablePrevention, navigationGuard]);
  useEffect(() => {
    if (Platform.OS !== 'web' || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

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
    setSelectedSlotId(null); setMeeting(''); setKitId(''); setSwapId('');
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
    if (dirty) setPendingAction({ description: 'Discard all unsaved schedule changes?', confirmLabel: 'Confirm discard', run: reset });
    else reset();
  }

  function requestCycleChange(run: () => void) {
    if (busy) return;
    const changeCycle = () => { reset(); run(); };
    if (dirty) setPendingAction({ description: 'Discard unsaved schedule changes and change cycle?', confirmLabel: 'Confirm discard', run: changeCycle });
    else changeCycle();
  }

  function regenerate() {
    if (!currentCycle || (stale && dirty)) return;
    const source = workspace && (dirty || !stale) ? workspace : createWorkspace(currentCycle);
    const allAssignments = [...source.base.assignments.filter((a) => a.cycleId !== source.cycle.id), ...source.assignments];
    const result = draft({ ...source.base, assignments: allAssignments }, source.cycle, true);
    setWorkspace({ ...source, assignments: result.assignments.filter((a) => a.cycleId === source.cycle.id), generationProblems: result.problems });
    setValidation(null); setMessage(''); closeSlot();
  }

  function requestGenerate() {
    if (busy || (stale && dirty)) return;
    if (dirty) setPendingAction({ description: 'Regenerate and replace unlocked local assignments?', confirmLabel: 'Confirm regenerate', run: regenerate });
    else regenerate();
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
      <Note>Changes are local until Save draft. Unapplied selections are lost when you leave this meeting.</Note>
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
          change(assignments.filter((item) => item.id !== selected.id)); setKitId(''); setSwapId('');
        }} />
      </View> : <Note>No title assigned.</Note>}
      {selected && assignmentProblems(base, selected, allAssignments).map((problem) => <Text key={problem} style={{ color: '#a22525' }}>{problem}</Text>)}
      {selected?.locked && <Action title="Unlock locally" disabled={busy} onPress={() => {
        const unlockIds = base.assignments.some((item) => item.id === selected.id && item.locked) && !workspace.unlockIds.includes(selected.id)
          ? [...workspace.unlockIds, selected.id] : workspace.unlockIds;
        change(assignments.map((item) => item.id === selected.id ? { ...item, locked: false } : item), unlockIds);
      }} />}
      {selected && !selected.locked && <Action title="Lock locally" disabled={busy} onPress={() => {
        change(assignments.map((item) => item.id === selected.id ? { ...item, locked: true } : item));
        setKitId(selected.kitId); setMeeting(selected.meeting);
      }} />}
      <ScheduleTitlePicker key={slot.id} data={base} cycle={cycle} slot={slot} assignments={assignments} selected={selected}
        pendingKitId={kitId} meeting={meeting} stale={stale} disabled={busy || !!selected?.locked} onSelect={setKitId} />
      {pendingKit && (!selected || pendingKit.id !== selected.kitId) && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <AssignmentCover title={pendingTitle} />
        <View style={{ flex: 1 }}><Label>Pending selection</Label><Text>{pendingTitle?.name ?? 'Unavailable title'} · {pendingKit.barcode}</Text></View>
      </View>}
      {!slot.meeting && <Field label="Meeting date (YYYY-MM-DD)" value={meeting} onChangeText={setMeeting} editable={!busy && !selected?.locked} />}
      {selectionChanged && <Action title="Save selection" tone="primary" disabled={busy || !!selected?.locked} onPress={setKit} />}
      {selected && !selected.locked && <View style={{ gap: 8 }}>
        <SearchPicker label="Swap with meeting" selectedId={swapId} groups={[{ value: 'all', label: 'All' }]}
          options={assignments.filter((item) => item.id !== selected.id && !item.locked).map((item) => ({
            id: item.id, label: `${base.clubs.find((value) => value.id === item.clubId)?.name ?? 'Club'} · ${item.meeting}`,
            detail: base.titles.find((title) => title.id === base.kits.find((kit) => kit.id === item.kitId)?.titleId)?.name ?? 'Unavailable title', group: 'all',
          }))} summary="Select a meeting" disabled={busy} onSelect={setSwapId} />
        <Action title="Swap kits locally" disabled={busy || !swapId} onPress={() => {
          const other = assignments.find((item) => item.id === swapId);
          if (!other || other.locked) { setMessage('Choose another unlocked assignment.'); return; }
          change(assignments.map((item) => item.id === selected.id ? { ...item, kitId: other.kitId } : item.id === other.id ? { ...item, kitId: selected.kitId } : item));
          setKitId(other.kitId); setSwapId('');
        }} />
      </View>}
    </Card>;
  }

  return {
    workspace, proposalData, dirty, stale, busy, message, validation, selectedSlotId: stale && !dirty ? null : selectedSlotId, pendingAction,
    selectSlot, closeSlot, requestDiscard, requestCycleChange, requestGenerate, validate, confirmSave, renderSelectedSlot,
    cancelValidation: () => setValidation(null),
    confirmAction: () => { const action = pendingAction; setPendingAction(null); action?.run(); },
    cancelAction: () => setPendingAction(null),
  };
}
