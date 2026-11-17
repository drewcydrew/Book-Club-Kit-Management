import { usePreventRemove } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { assignmentProblems, draft, fairness, id, meetingFor, rankings, windowFor } from '../domain/logic';
import { scheduleGrid } from '../domain/cycle-overview';
import { validDate } from '../domain/dates';
import { scheduleWarning } from '../domain/schedule-warning';
import type { Assignment, Cycle, Data } from '../domain/model';
import { saveValidatedSchedule, validateSchedule, type ScheduleValidation } from '../state/api';
import { useShared } from '../state/shared';
import { useNavigationGuard } from './navigation-guard';
import { ScheduleGridView } from './schedule-grid';
import { SearchPicker } from './search-picker';
import { Action, Actions, Card, Field, Label, Note, Page } from './ui';

function snapshot(data: Data): string {
  return JSON.stringify([data.library, data.cycles, data.ballots, data.assignments, data.kits, data.titles, data.clubs]);
}

export function ScheduleWorkspace({ data, cycle, mode, onClose }: {
  data: Data; cycle: Cycle; mode: 'generate' | 'existing'; onClose: (message?: string) => void;
}) {
  const shared = useShared();
  const navigationGuard = useNavigationGuard();
  const [base] = useState(data);
  const [baseCycle] = useState(cycle);
  const [basis] = useState(() => {
    const revisions = (items: { id: string; revision: number }[]) => items.map(({ id: itemId, revision }) => ({ id: itemId, revision }))
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    return { cycles: revisions(shared.data.cycles), kits: revisions(shared.data.kits), clubs: revisions(shared.data.clubs), settings: shared.data.library.revision };
  });
  const [baseSnapshot] = useState(() => snapshot(data));
  const [initial] = useState(() => mode === 'generate'
    ? draft(data, cycle, true)
    : { assignments: data.assignments, problems: [] as string[] });
  const [assignments, setAssignments] = useState(() => initial.assignments.filter((a) => a.cycleId === cycle.id));
  const [generationProblems, setGenerationProblems] = useState(initial.problems);
  const [unlockIds, setUnlockIds] = useState<string[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [meeting, setMeeting] = useState('');
  const [kitId, setKitId] = useState('');
  const [swapId, setSwapId] = useState('');
  const [clubIds, setClubIds] = useState(() => [...new Set(cycle.slots.map((slot) => slot.clubId))]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [validation, setValidation] = useState<ScheduleValidation | null>(null);
  const [checking, setChecking] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const busy = checking || shared.saving;
  const stale = snapshot(data) !== baseSnapshot;
  const allAssignments = useMemo(() => [...base.assignments.filter((a) => a.cycleId !== baseCycle.id), ...assignments], [assignments, base, baseCycle.id]);
  const grid = useMemo(() => scheduleGrid(base, baseCycle, clubIds, assignments), [assignments, base, baseCycle, clubIds]);
  const slot = baseCycle.slots.find((item) => item.id === selectedSlotId);
  const selected = assignments.find((item) => item.slotId === selectedSlotId);
  const club = base.clubs.find((item) => item.id === slot?.clubId);
  const priority = club ? baseCycle.finalized[club.id] ?? rankings(base, baseCycle, club.id, true) : [];
  const allWarnings = useMemo(() => assignments.flatMap((assignment) => assignmentProblems(base, assignment, allAssignments)
    .map((problem) => ({ assignment, problem }))), [assignments, base, allAssignments]);
  const clubOptions = base.clubs;
  const options = base.kits.map((kit) => {
    const title = base.titles.find((item) => item.id === kit.titleId);
    const rank = priority.indexOf(kit.titleId);
    return { id: kit.id, label: `${title?.name ?? 'Unavailable title'} · ${kit.barcode}`,
      detail: `${rank < 0 ? 'Unranked' : `Priority ${rank + 1}`} · ${kit.status} · ${kit.branch}`, group: 'all' };
  });

  const disablePrevention = usePreventRemove(true, ({ repeat }) => {
    if (busy) { setMessage('Wait for validation or saving to finish before leaving.'); return; }
    setPendingAction(() => repeat);
  });
  useEffect(() => navigationGuard.register((continueNavigation) => {
    if (busy) { setMessage('Wait for validation or saving to finish before leaving.'); return; }
    setPendingAction(() => () => { disablePrevention(); continueNavigation(); });
  }), [busy, disablePrevention, navigationGuard]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  function change(next: Assignment[]) {
    setAssignments(next);
    setGenerationProblems([]);
    setValidation(null);
    setMessage('');
  }
  function selectSlot(slotId: string) {
    const nextSlot = baseCycle.slots.find((item) => item.id === slotId);
    const nextAssignment = assignments.find((item) => item.slotId === slotId);
    setSelectedSlotId(slotId);
    setMeeting(nextAssignment?.meeting ?? (nextSlot ? meetingFor(nextSlot) : ''));
    setKitId(nextAssignment?.kitId ?? '');
    setSwapId('');
  }
  function setKit() {
    if (!slot || !kitId || !base.kits.some((kit) => kit.id === kitId)) { setMessage('Select a kit first.'); return; }
    if (selected?.locked) { setMessage('Unlock this assignment locally before changing it.'); return; }
    if (!validDate(meeting) || !meeting.startsWith(`${slot.month}-`) || meeting <= baseCycle.deadline || (slot.meeting && meeting !== slot.meeting)) {
      setMessage('The meeting must be in the slot month, after the deadline, and match the configured meeting date.'); return;
    }
    const next: Assignment = { id: selected?.id ?? id(), cycleId: baseCycle.id, slotId: slot.id, clubId: slot.clubId,
      kitId, ...windowFor(base, meeting), locked: false };
    if (selected && selected.meeting === meeting) { next.ready = selected.ready; next.due = selected.due; }
    change([...assignments.filter((item) => item.slotId !== slot.id), next]);
  }
  function unlock() {
    if (!selected) return;
    if (base.assignments.some((item) => item.id === selected.id && item.locked)) {
      setUnlockIds((current) => current.includes(selected.id) ? current : [...current, selected.id]);
    }
    change(assignments.map((item) => item.id === selected.id ? { ...item, locked: false } : item));
  }
  function regenerate() {
    const result = draft({ ...base, assignments: allAssignments }, baseCycle, true);
    change(result.assignments.filter((item) => item.cycleId === baseCycle.id));
    setGenerationProblems(result.problems);
    setSelectedSlotId(null);
  }
  async function save(token: string) {
    try {
      await shared.mutate(() => saveValidatedSchedule(baseCycle.id, assignments, baseCycle.revision, false, unlockIds, token, basis));
      disablePrevention();
      onClose('Shared schedule draft saved.');
    } catch (error: unknown) {
      setValidation(null);
      setMessage(error instanceof Error ? error.message : 'Unable to save schedule.');
    }
  }
  async function validate() {
    if (stale) { setMessage('Shared data changed. Discard or regenerate from refreshed data before saving.'); return; }
    setChecking(true);
    setMessage('');
    try {
      const result = await validateSchedule(baseCycle.id, assignments, baseCycle.revision, false, unlockIds, basis);
      if (result.warnings.length) setValidation(result);
      else await save(result.token);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'Unable to validate schedule.');
    } finally { setChecking(false); }
  }

  function renderSelectedSlot() {
    if (!slot) return null;
    return <Card>
      <Label>{club?.name ?? 'Unavailable club'} · {slot.month}</Label>
      {message ? <Text>{message}</Text> : null}
      {selected && <Text>{selected.locked ? 'Locked' : 'Unlocked'} · {selected.ready} to {selected.due}</Text>}
      {selected && assignmentProblems(base, selected, allAssignments).map((problem) => <Text key={problem} style={{ color: '#a22525' }}>{problem}</Text>)}
      {selected?.locked && <Action title="Unlock locally" disabled={busy} onPress={unlock} />}
      {selected && !selected.locked && <Action title="Lock locally" disabled={busy} onPress={() => change(assignments.map((item) =>
        item.id === selected.id ? { ...item, locked: true } : item))} />}
      <SearchPicker label="Choose a kit" options={options} selectedId={kitId} groups={[{ value: 'all', label: 'All' }]}
        summary="Select a title and kit" disabled={busy || !!selected?.locked} onSelect={setKitId} />
      {!slot.meeting && <Field label="Meeting date (YYYY-MM-DD)" value={meeting} onChangeText={setMeeting} editable={!busy && !selected?.locked} />}
      <Actions>
        <Action title="Apply kit locally" disabled={busy || !!selected?.locked} onPress={setKit} />
        {selected && <Action title="Clear assignment locally" disabled={busy || selected.locked} onPress={() => { change(assignments.filter((item) => item.id !== selected.id)); setKitId(''); }} />}
      </Actions>
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

  return <Page title="Local schedule">
    <Card>
      <Label>{baseCycle.name} · local workspace</Label>
      <Note>Nothing is shared until you save. This workspace is lost when you leave or close the app. Saving creates a draft; publication is separate.</Note>
      {stale && <Text style={{ color: '#a22525' }}>Shared data has changed. Discard this workspace and start again from the refreshed data before saving.</Text>}
      {message ? <Text>{message}</Text> : null}
      <Actions>
        <Action tone="primary" title="Save local draft" disabled={busy || stale} onPress={() => { void validate(); }} />
        <Action title="Regenerate locally" disabled={busy || stale} onPress={() => setPendingAction(() => regenerate)} />
        <Action title="Refresh shared data" disabled={busy} onPress={() => {
          setChecking(true);
          void shared.refresh().catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Unable to refresh shared data.'))
            .finally(() => setChecking(false));
        }} />
        <Action title="Discard local schedule" disabled={busy} onPress={() => setPendingAction(() => () => { disablePrevention(); onClose('Local schedule discarded.'); })} />
      </Actions>
      {pendingAction && <View>
        <Note>Discard the current local schedule and unsaved edits?</Note>
        <Actions><Action tone="danger" title="Confirm discard" onPress={() => { const action = pendingAction; setPendingAction(null); action(); }} />
          <Action title="Keep editing" onPress={() => setPendingAction(null)} /></Actions>
      </View>}
      {generationProblems.map((problem, index) => <Text key={`${problem}-${index}`} style={{ color: '#a22525' }}>{problem}</Text>)}
      {validation && <View style={{ gap: 8 }}>
        <Label>Review before saving</Label>
        <Note>These overrides can create impossible or unsafe schedules and affect other cycles. Save only if you accept every warning.</Note>
        {validation.warnings.map((warning, index) => <Text key={`${warning.slotId}-${index}`} style={{ color: '#a22525' }}>{scheduleWarning(base, baseCycle, warning)}</Text>)}
        <Actions><Action tone="danger" title="Save draft despite warnings" disabled={busy || stale} onPress={() => { void save(validation.token); }} />
          <Action title="Cancel save" disabled={busy} onPress={() => setValidation(null)} /></Actions>
      </View>}
    </Card>
    <Card>
      <Label>Fairness and local assignments</Label>
      <Note>Fairness averages priority weights across all club slots: first choice is 100%, last is 1/N, and unranked, repeated and unassigned slots score zero. No priorities or slots: N/A.</Note>
      <Action title={filtersOpen ? 'Hide club filters' : `Choose clubs (${clubIds.length} shown)`} onPress={() => setFiltersOpen(!filtersOpen)} />
      {filtersOpen && <Actions>{clubOptions.map((item) => <Action key={item.id} title={item.name} selected={clubIds.includes(item.id)} onPress={() =>
        setClubIds((current) => current.includes(item.id) ? current.filter((value) => value !== item.id) : [...current, item.id])} />)}</Actions>}
      {clubIds.length === 0 && <Note>Select a club to show its meetings.</Note>}
      <ScheduleGridView grid={grid} clubNameFor={(clubId) => base.clubs.find((item) => item.id === clubId)?.name ?? 'Unavailable club'}
        clubSummaryFor={(clubId) => { const result = fairness(base, baseCycle, clubId, assignments); return `Fairness ${result.score === null ? 'N/A' : `${Math.round(result.score)}%`} · ${result.assigned}/${result.slots} assigned`; }}
        titleFor={(assignment) => base.titles.find((title) => title.id === base.kits.find((kit) => kit.id === assignment.kitId)?.titleId)}
        expandedId={null} selectedSlotId={selectedSlotId} showProblems onSelectSlot={selectSlot} renderSlotDetail={renderSelectedSlot} onToggle={() => undefined} renderDetail={() => null} />
      {allWarnings.length > 0 && <Note>{allWarnings.length} local warning(s). Select a cell for details; saving requires server review.</Note>}
    </Card>
  </Page>;
}
