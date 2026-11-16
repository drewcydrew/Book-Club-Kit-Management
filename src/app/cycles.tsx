import React, { useState } from 'react';
import { Text } from 'react-native';
import { Action, Actions, Card, Field, Label, Note, Page } from '../components/ui';
import { today, validDate } from '../domain/dates';
import { groupSlotsByMonth, memberVotes } from '../domain/cycle-overview';
import { id } from '../domain/logic';
import type { Club, Cycle, Data } from '../domain/model';
import { deleteCycle, saveCycle } from '../state/api';
import { useShared } from '../state/shared';
import { useStore } from '../state/store';

export default function Cycles() {
  const { data } = useStore();
  const shared = useShared();
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  const staff = person?.role === 'admin' || person?.role === 'staff';
  const [selectedId, setSelectedId] = useState(data.cycles[0]?.id ?? '');
  const [name, setName] = useState('');
  const [deadline, setDeadline] = useState(today());
  const [meeting, setMeeting] = useState('');
  const [clubId, setClubId] = useState(data.clubs[0]?.id ?? '');
  const [message, setMessage] = useState('');
  const [deleteId, setDeleteId] = useState('');
  const cycle = data.cycles.find((c) => c.id === selectedId) ?? data.cycles[0];
  const editable = cycle?.status === 'open' || cycle?.status === 'collecting';
  const [clubFilter, setClubFilter] = useState('');

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
    if (!name.trim() || !validDate(deadline)) { setMessage('Enter a cycle name and a valid deadline (YYYY-MM-DD).'); return; }
    const newCycle = { id: id(), name: name.trim(), deadline, status: 'open' as const, slots: [], finalized: {} };
    void shared.mutate(() => saveCycle(newCycle)).then((created) => {
      setSelectedId(created.id); setName(''); setMessage('Shared cycle created.');
    }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Unable to create cycle.'));
  }

  function addSlot() {
    if (!cycle || (cycle.status !== 'open' && cycle.status !== 'collecting')) return;
    if (!validDate(meeting) || !data.clubs.some((c) => c.id === clubId)) { setMessage('Select a club and enter a valid meeting date (YYYY-MM-DD).'); return; }
    if (meeting <= cycle.deadline) { setMessage('Meeting must be after the preference deadline.'); return; }
    if (cycle.slots.some((slot) => slot.clubId === clubId && slot.meeting === meeting)) { setMessage('This club already has a meeting on that date.'); return; }
    void persist({ ...cycle, slots: [...cycle.slots, { id: id(), clubId, meeting }] }, 'Shared meeting added.')
      .then((saved) => { if (saved) setMeeting(''); });
  }

  if (!staff) return <Page title="Cycles"><Note>Staff manage shared planning cycles. Members can vote on Preferences. Switch to a demo staff/admin role on the User tab.</Note></Page>;
  return <Page title="Cycles">
    <Card><Label>Create a cycle</Label><Field label="Cycle name" value={name} onChangeText={setName} />
      <Field label="Preference deadline (YYYY-MM-DD)" value={deadline} onChangeText={setDeadline} /><Action tone="primary" title="Create shared cycle" onPress={create} />
    </Card>
    <Card><Label>Select a cycle</Label>
      {data.cycles.length === 0 && <Note>No shared cycles yet. Create one here or run the explicit server demo seed.</Note>}
      <Actions>{data.cycles.map((c) => <Action key={c.id} selected={c.id === selectedId} title={`${c.name}${c.id === selectedId ? ' ✓' : ''}`} onPress={() => { setSelectedId(c.id); setMessage(''); setClubFilter(''); }} />)}</Actions>
    </Card>
    {cycle && <>
      <Card><Label>{cycle.name} · {cycle.status}</Label><Text>Preference deadline: {cycle.deadline}</Text></Card>
      {editable
        ? <PlanningOverview data={data} cycle={cycle} clubFilter={clubFilter} onFilter={setClubFilter} />
        : <ScheduleOverview data={data} cycle={cycle} clubFilter={clubFilter} onFilter={setClubFilter} />}
    <Card><Label>Manage cycle</Label>
      {(cycle.status === 'open' || cycle.status === 'collecting') && <EditCycle key={cycle.id} cycle={cycle} onSave={(value) => persist(value, 'Shared cycle saved.')} />}
      {cycle.status === 'open' && <Action title="Open member voting" onPress={() => persist({ ...cycle, status: 'collecting' }, 'Voting opened.')} />}
      {editable && <Label>Meetings</Label>}
      {editable && cycle.slots.length === 0 && <Note>No meetings added.</Note>}
      {editable && cycle.slots.map((slot) => <Actions key={slot.id}><Text>{data.clubs.find((c) => c.id === slot.clubId)?.name ?? 'Unavailable club'} · {slot.meeting}</Text>
        {(cycle.status === 'open' || cycle.status === 'collecting') && <Action tone="danger" title="Remove" onPress={() => {
          persist({ ...cycle, slots: cycle.slots.filter((item) => item.id !== slot.id) }, 'Meeting removed.');
        }} />}
      </Actions>)}
      {(cycle.status === 'open' || cycle.status === 'collecting') && <><Note>Select club:</Note><Actions>{data.clubs.map((club) => <Action key={club.id} selected={club.id === clubId} title={`${club.name}${club.id === clubId ? ' ✓' : ''}`} onPress={() => setClubId(club.id)} />)}</Actions>
        <Field label="Meeting date (YYYY-MM-DD)" value={meeting} onChangeText={setMeeting} /><Action title="Add meeting" onPress={addSlot} /></>}
      {deleteId === cycle.id ? <Actions><Note>Delete this cycle? This removes its meetings, member preferences, finalized rankings and schedule. In-use cycles can be deleted; this cannot be undone.</Note>
        <Action tone="danger" title="Confirm delete cycle" onPress={() => {
          void shared.mutate(() => deleteCycle(cycle.id, cycle.revision)).then(() => {
            setDeleteId(''); setSelectedId(''); setMessage('Cycle deleted.');
          }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Unable to delete cycle.'));
        }} /><Action title="Cancel" onPress={() => setDeleteId('')} /></Actions>
        : <Action tone="danger" title="Delete cycle" onPress={() => setDeleteId(cycle.id)} />}
    </Card></>}
    {message ? <Text>{message}</Text> : null}
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
      {group.slots.map((slot) => {
        const assignment = data.assignments.find((item) => item.cycleId === cycle.id && item.slotId === slot.id);
        const kit = data.kits.find((item) => item.id === assignment?.kitId);
        const title = data.titles.find((item) => item.id === kit?.titleId);
        return <Text key={slot.id}>{clubName(data, slot.clubId)} · {slot.meeting} · {title && kit ? `${title.name} (${kit.barcode})` : 'No kit assigned'}</Text>;
      })}
    </Card>)}
  </>;
}

function PlanningOverview({ data, cycle, clubFilter, onFilter }: OverviewProps) {
  const clubs = scheduledClubs(data, cycle);
  const visible = clubFilter ? clubs.filter((club) => club.id === clubFilter) : clubs;
  return <>
    <Card><Label>Filter by club</Label><ClubChips clubs={clubs} selected={clubFilter} onSelect={onFilter} /></Card>
    {visible.length === 0 && <Card><Note>No clubs have meetings in this cycle yet.</Note></Card>}
    {visible.map((club) => {
      const votes = memberVotes(data.memberships, data.ballots, cycle.id, club.id);
      const voted = votes.filter((vote) => vote.voted).length;
      return <Card key={club.id}><Label>{club.name} · {voted} of {votes.length} voted</Label>
        {votes.length === 0 && <Note>No members in this club.</Note>}
        {votes.map((vote) => <Text key={vote.personId}>
          {personName(data, vote.personId)} · {vote.voted
            ? `Voted · Top: ${topTitles(data, vote.ranking)} · Selected ${vote.marks.selected}, read ${vote.marks.read}, won't read ${vote.marks.wont}`
            : 'Not voted'}
        </Text>)}
      </Card>;
    })}
  </>;
}

function ClubChips({ clubs, selected, onSelect }: { clubs: Club[]; selected: string; onSelect: (clubId: string) => void }) {
  return <Actions><Action selected={!selected} title="All clubs" onPress={() => onSelect('')} />
    {clubs.map((club) => <Action key={club.id} selected={club.id === selected} title={club.name} onPress={() => onSelect(club.id)} />)}
  </Actions>;
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

function topTitles(data: Data, ranking: string[]): string {
  if (ranking.length === 0) return 'none ranked';
  return ranking.slice(0, 3).map((titleId) => data.titles.find((title) => title.id === titleId)?.name ?? 'Unknown title').join(', ');
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function EditCycle({ cycle, onSave }: { cycle: Cycle; onSave: (value: Cycle) => Promise<Cycle | undefined> }) {
  const [name, setName] = useState(cycle.name);
  const [deadline, setDeadline] = useState(cycle.deadline);
  const [revision, setRevision] = useState(cycle.revision);
  const [message, setMessage] = useState('');
  function save() {
    if (!name.trim() || !validDate(deadline)) { setMessage('Enter a cycle name and a valid deadline (YYYY-MM-DD).'); return; }
    if (cycle.slots.some((slot) => slot.meeting <= deadline)) { setMessage('The deadline must be before every meeting.'); return; }
    void onSave({ ...cycle, name: name.trim(), deadline, revision }).then((saved) => {
      if (saved) setRevision(saved.revision);
    });
    setMessage('');
  }
  return <><Field label="Edit cycle name" value={name} onChangeText={setName} />
    <Field label="Edit deadline (YYYY-MM-DD)" value={deadline} onChangeText={setDeadline} />
    <Actions><Action tone="primary" title="Save cycle" onPress={save} /><Action title="Reload cycle fields" onPress={() => {
      setName(cycle.name); setDeadline(cycle.deadline); setRevision(cycle.revision); setMessage('');
    }} /></Actions>{message ? <Text>{message}</Text> : null}</>;
}
