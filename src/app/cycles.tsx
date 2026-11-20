import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Action, Actions, Card, Field, Label, Note, Page } from '../components/ui';
import { today, validDate } from '../domain/dates';
import { clubPriorities, clubStatuses, groupSlotsByMonth, lastDayOfMonth, memberVotes, monthsInRange, shiftMonth, type ClubStatus } from '../domain/cycle-overview';
import { cadenceMonths } from '../domain/cadence';
import { id } from '../domain/logic';
import type { Club, Cycle, Data, Slot } from '../domain/model';
import { deleteCycle, discardCycleSchedule, reopenCycle, saveCycle } from '../state/api';
import { useShared } from '../state/shared';
import { useStore } from '../state/store';
import { ScreenGate } from '../components/screen-gate';
import { useDraftNavigationGuard } from '../components/navigation-guard';

export default function Cycles() {
  return <ScreenGate staffOnly><CyclesContent /></ScreenGate>;
}

function CyclesContent() {
  const { data } = useStore();
  const shared = useShared();
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  const staff = person?.role === 'admin' || person?.role === 'staff';
  const [selectedId, setSelectedId] = useState(data.cycles[0]?.id ?? '');
  const [name, setName] = useState('');
  const [deadline, setDeadline] = useState(today());
  const [startMonth, setStartMonth] = useState(today().slice(0, 7));
  const [endMonth, setEndMonth] = useState(shiftMonth(today().slice(0, 7), 11));
  const [meeting, setMeeting] = useState('');
  const [slotMonth, setSlotMonth] = useState(today().slice(0, 7));
  const [clubId, setClubId] = useState(data.clubs[0]?.id ?? '');
  const [message, setMessage] = useState('');
  const [deleteId, setDeleteId] = useState('');
  const [reopenId, setReopenId] = useState('');
  const [discardId, setDiscardId] = useState('');
  const [editingSlotId, setEditingSlotId] = useState('');
  const [editCycleDirty, setEditCycleDirty] = useState(false);
  const [editSlotDirty, setEditSlotDirty] = useState(false);
  const [createBaseline, setCreateBaseline] = useState({ deadline, startMonth, endMonth });
  const [slotBaseline, setSlotBaseline] = useState({ slotMonth, clubId });
  const dirty = !!name || deadline !== createBaseline.deadline || startMonth !== createBaseline.startMonth ||
    endMonth !== createBaseline.endMonth || !!meeting || slotMonth !== slotBaseline.slotMonth || clubId !== slotBaseline.clubId ||
    editCycleDirty || editSlotDirty;
  const navigationConfirmation = useDraftNavigationGuard(dirty, shared.saving);
  const cycle = data.cycles.find((c) => c.id === selectedId) ?? data.cycles[0];
  const editable = cycle?.status === 'open' || cycle?.status === 'collecting';
  const [clubFilter, setClubFilter] = useState('');
  const cycleAssignments = data.assignments.filter((assignment) => assignment.cycleId === cycle?.id);
  const lockedCount = cycleAssignments.filter((assignment) => assignment.locked).length;
  const heldKits = cycleAssignments
    .map((assignment) => data.kits.find((kit) => kit.id === assignment.kitId))
    .filter((kit) => kit?.status === 'out' || kit?.status === 'reserved');

  async function persist(value: Cycle, success: string): Promise<Cycle | undefined> {
    try {
      const saved = await shared.mutate(() => saveCycle(value));
      setMessage(success);
      return saved;
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'Unable to save cycle.');
    }
  }

  function create() {
    if (!name.trim() || !validDate(deadline) || !validMonth(startMonth) || !validMonth(endMonth) || endMonth < startMonth) {
      setMessage('Enter a cycle name, a valid deadline (YYYY-MM-DD) and a start and end month (YYYY-MM).');
      return;
    }
    const newCycle = {
      id: id(), name: name.trim(), deadline, startsOn: `${startMonth}-01`, endsOn: lastDayOfMonth(endMonth),
      status: 'open' as const, slots: [], finalized: {},
    };
    void shared.mutate(() => saveCycle(newCycle)).then((created) => {
      setSelectedId(created.id); setName(''); setCreateBaseline({ deadline, startMonth, endMonth }); setMessage('Shared cycle created.');
    }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Unable to create cycle.'));
  }

  function addSlot() {
    if (!cycle || (cycle.status !== 'open' && cycle.status !== 'collecting')) return;
    if (!validMonth(slotMonth) || !data.clubs.some((c) => c.id === clubId)) { setMessage('Select a club and a month (YYYY-MM).'); return; }
    if (!monthsInRange(cycle.startsOn, cycle.endsOn).includes(slotMonth)) { setMessage('That month is outside the cycle range.'); return; }
    if (cycle.slots.some((slot) => slot.clubId === clubId && slot.month === slotMonth)) { setMessage('This club already has a kit slot for that month.'); return; }
    if (meeting && (!validDate(meeting) || !meeting.startsWith(`${slotMonth}-`) || meeting <= cycle.deadline)) {
      setMessage('Meeting date must be a valid date in the selected month and after the preference deadline.');
      return;
    }
    void persist({ ...cycle, slots: [...cycle.slots, { id: id(), clubId, month: slotMonth, meeting: meeting || null }] }, 'Kit slot added.')
      .then((saved) => { if (saved) { setMeeting(''); setSlotBaseline({ slotMonth, clubId }); } });
  }

  function fillMonths() {
    if (!cycle || (cycle.status !== 'open' && cycle.status !== 'collecting')) return;
    const added = data.clubs.flatMap((club) => cadenceMonths(cycle, club.cadence)
      .filter((month) => !cycle.slots.some((slot) => slot.clubId === club.id && slot.month === month))
      .map((month) => ({ id: id(), clubId: club.id, month, meeting: null })));
    if (added.length === 0) { setMessage('Every club already has a slot for each cadence month.'); return; }
    void persist({ ...cycle, slots: [...cycle.slots, ...added] }, `Added ${added.length} kit slots.`);
  }

  if (!staff) return <Page title="Cycles"><Note>Staff manage shared planning cycles. Members can vote on Preferences. Switch to a demo staff/admin role on Home.</Note></Page>;
  return <Page title="Cycles">{navigationConfirmation}
    <Card><Label>Create a cycle</Label><Field label="Cycle name" value={name} onChangeText={setName} />
      <Field label="First month (YYYY-MM)" value={startMonth} onChangeText={setStartMonth} />
      <Field label="Last month (YYYY-MM)" value={endMonth} onChangeText={setEndMonth} />
      <Field label="Preference deadline (YYYY-MM-DD)" value={deadline} onChangeText={setDeadline} /><Action tone="primary" title="Create shared cycle" disabled={shared.saving} onPress={create} />
    </Card>
    <Card><Label>Select a cycle</Label>
      {data.cycles.length === 0 && <Note>No shared cycles yet. Create one here or run the explicit server demo seed.</Note>}
      <Actions>{data.cycles.map((c) => <Action key={c.id} selected={c.id === cycle?.id} disabled={shared.saving} title={`${c.name}${c.id === cycle?.id ? ' ✓' : ''}`} onPress={() => { setSelectedId(c.id); setMessage(''); setClubFilter(''); setReopenId(''); setDiscardId(''); setDeleteId(''); setEditingSlotId(''); }} />)}</Actions>
    </Card>
    {cycle && <>
      <Card><Label>{cycle.name} · {cycle.status}</Label><Text>Preference deadline: {cycle.deadline}</Text>
        {cycle.status === 'published' && cycle.slots.length === 0 && <Note>This cycle is published but has no meetings. Reopen it to add meetings before publishing again.</Note>}
        {cycle.status === 'collecting' && <Note>{today() <= cycle.deadline
          ? 'Voting is open through the deadline.'
          : 'Voting is closed because the deadline has passed. Edit the deadline and any incompatible meeting dates to reopen voting.'}</Note>}
        {(cycle.status === 'drafted' || cycle.status === 'published') && (reopenId === cycle.id ? <>
          <Note>Reopen {cycle.name} from {cycle.status} to collecting? Published schedules disappear from member views. Active-loan due dates and associations can disappear, affecting overdue, history and availability checks. This is a development measure, not a production-safe loan workflow.</Note>
          <Note>Slots, assignments, locks, ballots and finalized rankings are retained. Later changing or removing a slot deletes its assignment, even if locked or in use, without another confirmation. Full schedule regeneration replaces dates and assignments, including locks, after confirmation.</Note>
          <Actions>
            <Action tone="danger" title="Confirm reopen for editing" disabled={shared.saving} onPress={() => {
              void shared.mutate(() => reopenCycle(cycle.id, cycle.revision)).then(() => {
                setReopenId(''); setEditingSlotId(''); setMessage('Cycle reopened for editing.');
              }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Unable to reopen cycle.'));
            }} />
            <Action title="Cancel reopening" disabled={shared.saving} onPress={() => setReopenId('')} />
          </Actions>
        </> : <Action title="Reopen for editing" disabled={shared.saving} onPress={() => { setMessage(''); setReopenId(cycle.id); }} />)}
        {cycleAssignments.length > 0 && (discardId === cycle.id ? <>
          <Note>Discard the schedule for {cycle.name}? This deletes {cycleAssignments.length} assignments ({lockedCount} locked) and returns the cycle to collecting. Slots, ballots and finalized rankings are kept.</Note>
          {heldKits.length > 0 && <Note>Warning: {heldKits.length} kit{heldKits.length === 1 ? ' is' : 's are'} checked out or reserved under these assignments ({heldKits.map((kit) => kit?.barcode).join(', ')}). {heldKits.length === 1 ? 'It' : 'They'} will have no published assignment until rescheduled.</Note>}
          <Actions>
            <Action tone="danger" title="Confirm discard schedule" disabled={shared.saving} onPress={() => {
              void shared.mutate(() => discardCycleSchedule(cycle.id, cycle.revision)).then(() => {
                setDiscardId(''); setEditingSlotId(''); setMessage('Schedule discarded. Redraft and publish when ready.');
              }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Unable to discard schedule.'));
            }} />
            <Action title="Cancel discard" disabled={shared.saving} onPress={() => setDiscardId('')} />
          </Actions>
        </> : <Action title="Discard schedule" disabled={shared.saving} onPress={() => { setMessage(''); setDiscardId(cycle.id); }} />)}
        {message ? <Text>{message}</Text> : null}
      </Card>
      {editable
        ? <PlanningOverview data={data} cycle={cycle} clubFilter={clubFilter} onFilter={setClubFilter} />
        : <ScheduleOverview data={data} cycle={cycle} clubFilter={clubFilter} onFilter={setClubFilter} />}
    <Card><Label>Manage cycle</Label>
      {(cycle.status === 'open' || cycle.status === 'collecting') && <EditCycle key={cycle.id} cycle={cycle} saving={shared.saving} onDirtyChange={setEditCycleDirty} onSave={(value) => persist(value, 'Shared cycle saved.')} />}
      {cycle.status === 'open' && <Action title="Open member voting" disabled={shared.saving} onPress={() => { void persist({ ...cycle, status: 'collecting' }, 'Voting opened.'); }} />}
      {editable && <Label>Kit slots by month</Label>}
      {editable && data.assignments.some((assignment) => assignment.cycleId === cycle.id) && <Note>
        Assignments may be provisional. Changing or removing a slot deletes its assignment, including locked or in-use assignments, without another confirmation. Full schedule regeneration replaces dates and assignments, including locks, after confirmation.
      </Note>}
      {editable && cycle.slots.length === 0 && <Note>No kit slots yet. Add slots below, or fill each club&apos;s cadence months in the range.</Note>}
      {editable && monthsInRange(cycle.startsOn, cycle.endsOn).map((month) => {
        const slots = cycle.slots.filter((slot) => slot.month === month);
        return <View key={month} style={{ gap: 8 }}><Label>{monthLabel(month)}{slots.length === 0 ? ': none' : ''}</Label>
          {slots.map((slot) => {
            const assignment = data.assignments.find((item) => item.cycleId === cycle.id && item.slotId === slot.id);
            const kit = data.kits.find((item) => item.id === assignment?.kitId);
            return <View key={slot.id} style={{ gap: 6 }}>
              <Text>{slotText(data, cycle, slot)}{assignment?.locked ? ' · Locked' : ''}{kit?.status === 'out' ? ' · Kit checked out (may be in use)' : ''}</Text>
              <Actions>
                <Action title="Edit slot" accessibilityLabel={`Edit slot for ${clubName(data, slot.clubId)} in ${monthLabel(month)}`} disabled={shared.saving} onPress={() => setEditingSlotId(slot.id)} />
                <Action title="Remove slot" accessibilityLabel={`Remove slot for ${clubName(data, slot.clubId)} in ${monthLabel(month)}`} disabled={shared.saving} onPress={() => {
                  void persist({ ...cycle, slots: cycle.slots.filter((item) => item.id !== slot.id) }, 'Kit slot removed.').then((saved) => { if (saved && editingSlotId === slot.id) setEditingSlotId(''); });
                }} />
              </Actions>
              {editingSlotId === slot.id && <EditSlot key={`${cycle.id}:${slot.id}`} data={data} cycle={cycle} slot={slot} saving={shared.saving}
                onDirtyChange={setEditSlotDirty}
                onCancel={() => setEditingSlotId('')} onSave={(value) => persist(value, 'Kit slot updated.').then((saved) => { if (saved) setEditingSlotId(''); })} />}
            </View>;
          })}
        </View>;
      })}
      {(cycle.status === 'open' || cycle.status === 'collecting') && <>
        <Note>Manual meetings can be changed by the next confirmed schedule generation to match club cadence.</Note>
        <Note>Select club:</Note><Actions>{data.clubs.map((club) => <Action key={club.id} selected={club.id === clubId} title={`${club.name}${club.id === clubId ? ' ✓' : ''}`} onPress={() => setClubId(club.id)} />)}</Actions>
        <Field label="Month (YYYY-MM)" value={slotMonth} onChangeText={setSlotMonth} />
        <Field label="Meeting date, optional (YYYY-MM-DD)" value={meeting} onChangeText={setMeeting} />
        <Actions><Action title="Add kit slot" disabled={shared.saving} onPress={addSlot} /><Action title="Fill club cadence months" disabled={shared.saving} onPress={fillMonths} /></Actions>
      </>}
      {deleteId === cycle.id ? <Actions><Note>Delete this cycle? This removes its meetings, member preferences, finalized rankings and schedule. In-use cycles can be deleted; this cannot be undone.</Note>
        <Action tone="danger" title="Confirm delete cycle" disabled={shared.saving} onPress={() => {
          void shared.mutate(() => deleteCycle(cycle.id, cycle.revision)).then(() => {
            setDeleteId(''); setSelectedId(''); setMessage('Cycle deleted.');
          }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Unable to delete cycle.'));
        }} /><Action title="Cancel" disabled={shared.saving} onPress={() => setDeleteId('')} /></Actions>
        : <Action tone="danger" title="Delete cycle" disabled={shared.saving} onPress={() => setDeleteId(cycle.id)} />}
    </Card></>}
    {!cycle && message ? <Text>{message}</Text> : null}
  </Page>;
}

interface OverviewProps {
  data: Data;
  cycle: Cycle;
  clubFilter: string;
  onFilter: (clubId: string) => void;
}

function ScheduleOverview({ data, cycle, clubFilter, onFilter }: OverviewProps) {
  const groups = groupSlotsByMonth(cycle.slots, clubFilter);
  return <>
    <Card><Label>Filter by club</Label><ClubChips clubs={scheduledClubs(data, cycle)} selected={clubFilter} onSelect={onFilter} /></Card>
    {groups.length === 0 && <Card><Note>No meetings for this selection.</Note></Card>}
    {groups.map((group) => <Card key={group.month}><Label>{monthLabel(group.month)}</Label>
      {group.slots.map((slot) => <Text key={slot.id}>{slotText(data, cycle, slot)}</Text>)}
    </Card>)}
  </>;
}

function PlanningOverview({ data, cycle, clubFilter, onFilter }: OverviewProps) {
  const clubs = data.clubs;
  const club = clubs.find((item) => item.id === clubFilter) ?? clubs[0];
  if (!club) return <Card><Note>No clubs yet.</Note></Card>;
  const statuses = Object.fromEntries(clubStatuses(data, cycle).map((status) => [status.clubId, status]));
  const priorities = clubPriorities(data, cycle, club.id);
  const finalized = cycle.finalized[club.id] ?? [];
  const votes = memberVotes(data.memberships, data.ballots, cycle.id, club.id);
  const voted = votes.filter((vote) => vote.voted).length;
  const meetings = groupSlotsByMonth(cycle.slots, club.id);
  return <>
    <Card><Label>Select a club</Label><ClubChips clubs={clubs} selected={club.id} onSelect={onFilter} statuses={statuses} /></Card>
    <Card><Label>{club.name} · aggregated priorities</Label>
      {finalized.length > 0 && <><Label>Finalized ranking</Label>{finalized.map((titleId, index) => <Text key={titleId}>{index + 1}. {titleName(data, titleId)}</Text>)}</>}
      {priorities.length === 0 && <Note>No titles selected yet.</Note>}
      {priorities.map((item, index) => <Text key={item.titleId} style={item.history ? { color: '#888' } : undefined}>
        {index + 1}. {titleName(data, item.titleId)} · score {item.score} · {item.supporters} {item.supporters === 1 ? 'supporter' : 'supporters'}{item.history ? ' · previously read' : ''}
      </Text>)}
    </Card>
    <Card><Label>{club.name} · meetings</Label>
      {meetings.length === 0 && <Note>No meetings for this club in this cycle.</Note>}
      {meetings.map((group) => <React.Fragment key={group.month}><Label>{monthLabel(group.month)}</Label>
        {group.slots.map((slot) => <Text key={slot.id}>{slotText(data, cycle, slot)}</Text>)}
      </React.Fragment>)}
    </Card>
    <Card><Label>{club.name} · {voted} of {votes.length} voted</Label>
      {votes.length === 0 && <Note>No members in this club.</Note>}
      {votes.map((vote) => <Text key={vote.personId}>
        {personName(data, vote.personId)} · {vote.voted
          ? `Selected: ${vote.selected.length > 0 ? vote.selected.map((titleId) => titleName(data, titleId)).join(', ') : 'none'} · Selected ${vote.marks.selected}, read ${vote.marks.read}, won't read ${vote.marks.wont}`
          : 'Not voted'}
      </Text>)}
    </Card>
  </>;
}

function ClubChips({ clubs, selected, onSelect, statuses }: { clubs: Club[]; selected: string; onSelect: (clubId: string) => void; statuses?: Record<string, ClubStatus> }) {
  return <Actions><Action selected={!selected} title="All clubs" onPress={() => onSelect('')} />
    {clubs.map((club) => <Action key={club.id} selected={club.id === selected} title={`${club.name}${club.id === selected ? ' ✓' : ''}${statusSuffix(statuses?.[club.id])}`} onPress={() => onSelect(club.id)} />)}
  </Actions>;
}

function statusSuffix(status: ClubStatus | undefined): string {
  if (!status) return '';
  return ` · ${status.hasPreferences ? 'prefs' : 'no prefs'} · ${status.meetingCount > 0 ? `${status.meetingCount} ${status.meetingCount === 1 ? 'meeting' : 'meetings'}` : 'no meetings'}`;
}

function slotText(data: Data, cycle: Cycle, slot: Slot): string {
  const assignment = data.assignments.find((item) => item.cycleId === cycle.id && item.slotId === slot.id);
  const kit = data.kits.find((item) => item.id === assignment?.kitId);
  const title = data.titles.find((item) => item.id === kit?.titleId);
  return `${clubName(data, slot.clubId)} · ${slot.meeting ?? `${monthLabel(slot.month)}, no date`} · ${title && kit ? `${title.name} (${kit.barcode})` : 'No kit assigned'}`;
}

function scheduledClubs(data: Data, cycle: Cycle): Club[] {
  return data.clubs.filter((club) => cycle.slots.some((slot) => slot.clubId === club.id));
}

function clubName(data: Data, clubId: string): string {
  return data.clubs.find((club) => club.id === clubId)?.name ?? 'Unavailable club';
}

function personName(data: Data, personId: string): string {
  return data.people.find((person) => person.id === personId)?.name ?? 'Unknown member';
}

function titleName(data: Data, titleId: string): string {
  return data.titles.find((title) => title.id === titleId)?.name ?? 'Unknown title';
}

function validMonth(month: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function EditSlot({ data, cycle, slot, saving, onSave, onCancel, onDirtyChange }: {
  data: Data; cycle: Cycle; slot: Slot; saving: boolean; onSave: (value: Cycle) => Promise<void>; onCancel: () => void; onDirtyChange: (dirty: boolean) => void;
}) {
  const [clubId, setClubId] = useState(slot.clubId);
  const [month, setMonth] = useState(slot.month);
  const [meeting, setMeeting] = useState(slot.meeting ?? '');
  const [revision] = useState(cycle.revision);
  const [message, setMessage] = useState('');
  const stale = revision !== cycle.revision;
  const dirty = clubId !== slot.clubId || month !== slot.month || meeting !== (slot.meeting ?? '');
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);

  function save() {
    if (!data.clubs.some((club) => club.id === clubId) || !validMonth(month)) {
      setMessage('Select a club and a valid month (YYYY-MM).'); return;
    }
    if (!monthsInRange(cycle.startsOn, cycle.endsOn).includes(month)) {
      setMessage('That month is outside the cycle range.'); return;
    }
    if (cycle.slots.some((item) => item.id !== slot.id && item.clubId === clubId && item.month === month)) {
      setMessage('This club already has a kit slot for that month.'); return;
    }
    if (meeting && (!validDate(meeting) || !meeting.startsWith(`${month}-`) || meeting <= cycle.deadline)) {
      setMessage('Meeting date must be a valid date in the selected month and after the preference deadline.'); return;
    }
    const updated = { ...slot, clubId, month, meeting: meeting || null };
    void onSave({ ...cycle, revision, slots: cycle.slots.map((item) => item.id === slot.id ? updated : item) });
  }

  return <View style={{ gap: 8 }}>
    <Note>Changing this slot removes its existing assignment, even if locked or in use.</Note>
    <Label>Club for this slot</Label>
    <Actions>{data.clubs.map((club) => <Action key={club.id} selected={club.id === clubId} title={club.name} disabled={saving} onPress={() => setClubId(club.id)} />)}</Actions>
    <Field label="Edit slot month (YYYY-MM)" value={month} onChangeText={setMonth} editable={!saving} />
    <Field label="Edit meeting date, optional (YYYY-MM-DD)" value={meeting} onChangeText={setMeeting} editable={!saving} />
    {stale && <Note>The cycle changed. Cancel and reopen this slot to use the latest data.</Note>}
    {message ? <Text>{message}</Text> : null}
    <Actions><Action tone="primary" title="Save slot" disabled={saving || stale} onPress={save} />
      <Action title="Cancel slot edit" disabled={saving} onPress={onCancel} /></Actions>
  </View>;
}

function EditCycle({ cycle, saving, onSave, onDirtyChange }: { cycle: Cycle; saving: boolean; onSave: (value: Cycle) => Promise<Cycle | undefined>; onDirtyChange: (dirty: boolean) => void }) {
  const [name, setName] = useState(cycle.name);
  const [deadline, setDeadline] = useState(cycle.deadline);
  const [startMonth, setStartMonth] = useState(cycle.startsOn.slice(0, 7));
  const [endMonth, setEndMonth] = useState(cycle.endsOn.slice(0, 7));
  const [revision, setRevision] = useState(cycle.revision);
  const [message, setMessage] = useState('');
  const stale = revision !== cycle.revision;
  const dirty = name !== cycle.name || deadline !== cycle.deadline || startMonth !== cycle.startsOn.slice(0, 7) || endMonth !== cycle.endsOn.slice(0, 7);
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  function save() {
    if (!name.trim() || !validDate(deadline) || !validMonth(startMonth) || !validMonth(endMonth) || endMonth < startMonth) {
      setMessage('Enter a cycle name, a valid deadline (YYYY-MM-DD) and a start and end month (YYYY-MM).');
      return;
    }
    const inRange = new Set(monthsInRange(`${startMonth}-01`, lastDayOfMonth(endMonth)));
    if (cycle.slots.some((slot) => !inRange.has(slot.month))) { setMessage('Every kit slot must fall within the new month range. Remove the slots outside it first.'); return; }
    if (cycle.slots.some((slot) => slot.meeting !== null && slot.meeting <= deadline)) { setMessage('The deadline must be before every meeting date.'); return; }
    void onSave({ ...cycle, name: name.trim(), deadline, startsOn: `${startMonth}-01`, endsOn: lastDayOfMonth(endMonth), revision }).then((saved) => {
      if (saved) { setRevision(saved.revision); setName(saved.name); }
    });
    setMessage('');
  }
  return <><Field label="Edit cycle name" value={name} onChangeText={setName} editable={!saving} />
    <Field label="First month (YYYY-MM)" value={startMonth} onChangeText={setStartMonth} editable={!saving} />
    <Field label="Last month (YYYY-MM)" value={endMonth} onChangeText={setEndMonth} editable={!saving} />
    <Field label="Edit deadline (YYYY-MM-DD)" value={deadline} onChangeText={setDeadline} editable={!saving} />
    {stale && <Note>The cycle changed. Reload cycle fields before editing; this discards unsaved changes to these fields.</Note>}
    <Actions><Action tone="primary" title="Save cycle" disabled={saving || stale} onPress={save} /><Action title="Reload cycle fields" disabled={saving} onPress={() => {
      setName(cycle.name); setDeadline(cycle.deadline); setStartMonth(cycle.startsOn.slice(0, 7)); setEndMonth(cycle.endsOn.slice(0, 7));
      setRevision(cycle.revision); setMessage('');
    }} /></Actions>{message ? <Text>{message}</Text> : null}</>;
}
