import React, { useState } from 'react';
import { Text } from 'react-native';
import { Action, Actions, Card, Field, Label, Note, Page } from '../components/ui';
import { today, validDate } from '../domain/dates';
import { id } from '../domain/logic';
import type { Cycle } from '../domain/model';
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
  const [clubId, setClubId] = useState(data.selectedClubId || data.clubs[0]?.id || '');
  const [message, setMessage] = useState('');
  const [deleteId, setDeleteId] = useState('');
  const cycle = data.cycles.find((c) => c.id === selectedId) ?? data.cycles[0];

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

  if (!staff) return <Page title="Cycles"><Note>Staff manage shared planning cycles. Members can vote on Preferences. Switch to a demo staff/admin role in Settings.</Note></Page>;
  return <Page title="Cycles">
    <Card><Label>Create a cycle</Label><Field label="Cycle name" value={name} onChangeText={setName} />
      <Field label="Preference deadline (YYYY-MM-DD)" value={deadline} onChangeText={setDeadline} /><Action title="Create shared cycle" onPress={create} />
    </Card>
    <Card><Label>Select a cycle</Label>
      {data.cycles.length === 0 && <Note>No shared cycles yet. Create one here or run the explicit server demo seed.</Note>}
      <Actions>{data.cycles.map((c) => <Action key={c.id} title={`${c.name}${c.id === selectedId ? ' ✓' : ''}`} onPress={() => { setSelectedId(c.id); setMessage(''); }} />)}</Actions>
    </Card>
    {cycle && <Card><Label>{cycle.name} · {cycle.status}</Label><Text>Preference deadline: {cycle.deadline}</Text>
      {(cycle.status === 'open' || cycle.status === 'collecting') && <EditCycle key={cycle.id} cycle={cycle} onSave={(value) => persist(value, 'Shared cycle saved.')} />}
      {cycle.status === 'open' && <Action title="Open member voting" onPress={() => persist({ ...cycle, status: 'collecting' }, 'Voting opened.')} />}
      <Label>Meetings</Label>
      {cycle.slots.length === 0 && <Note>No meetings added.</Note>}
      {cycle.slots.map((slot) => <Actions key={slot.id}><Text>{data.clubs.find((c) => c.id === slot.clubId)?.name ?? 'Unavailable club'} · {slot.meeting}</Text>
        {(cycle.status === 'open' || cycle.status === 'collecting') && <Action title="Remove" onPress={() => {
          persist({ ...cycle, slots: cycle.slots.filter((item) => item.id !== slot.id) }, 'Meeting removed.');
        }} />}
      </Actions>)}
      {(cycle.status === 'open' || cycle.status === 'collecting') && <><Note>Select club:</Note><Actions>{data.clubs.map((club) => <Action key={club.id} title={`${club.name}${club.id === clubId ? ' ✓' : ''}`} onPress={() => setClubId(club.id)} />)}</Actions>
        <Field label="Meeting date (YYYY-MM-DD)" value={meeting} onChangeText={setMeeting} /><Action title="Add meeting" onPress={addSlot} /></>}
      {deleteId === cycle.id ? <Actions><Note>Delete cycle? This is blocked while meetings, preferences or schedules reference it.</Note>
        <Action title="Confirm delete cycle" onPress={() => {
          void shared.mutate(() => deleteCycle(cycle.id, cycle.revision)).then(() => {
            setDeleteId(''); setSelectedId(''); setMessage('Cycle deleted.');
          }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Unable to delete cycle.'));
        }} /><Action title="Cancel" onPress={() => setDeleteId('')} /></Actions>
        : <Action title="Delete cycle" onPress={() => setDeleteId(cycle.id)} />}
    </Card>}
    {message ? <Text>{message}</Text> : null}
  </Page>;
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
    <Actions><Action title="Save cycle" onPress={save} /><Action title="Reload cycle fields" onPress={() => {
      setName(cycle.name); setDeadline(cycle.deadline); setRevision(cycle.revision); setMessage('');
    }} /></Actions>{message ? <Text>{message}</Text> : null}</>;
}
