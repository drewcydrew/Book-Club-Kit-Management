import React, { useState } from 'react';
import { Text } from 'react-native';
import { Action, Actions, Card, Field, Label, Note, Page } from '../components/ui';
import { today, validDate } from '../domain/dates';
import { id } from '../domain/logic';
import type { Cycle } from '../domain/model';
import { useStore } from '../state/store';

function EditCycle({ cycle }: { cycle: Cycle }) {
  const { update } = useStore();
  const [name, setName] = useState(cycle.name);
  const [deadline, setDeadline] = useState(cycle.deadline);
  const [message, setMessage] = useState('');
  function save() {
    if (!name.trim() || !validDate(deadline)) { setMessage('Enter a cycle name and a valid deadline (YYYY-MM-DD).'); return; }
    void update((d) => {
      const current = d.cycles.find((c) => c.id === cycle.id);
      if (!current || (current.status !== 'open' && current.status !== 'collecting')) throw new Error('Cycle can no longer be edited.');
      if (current.slots.some((slot) => slot.meeting <= deadline)) throw new Error('The deadline must be before every meeting.');
      return { ...d, cycles: d.cycles.map((c) => c.id === current.id ? { ...c, name: name.trim(), deadline } : c) };
    }).then(() => setMessage('Cycle saved.')).catch(() => undefined);
  }
  return <><Field label="Edit cycle name" value={name} onChangeText={setName} />
    <Field label="Edit deadline (YYYY-MM-DD)" value={deadline} onChangeText={setDeadline} />
    <Action title="Save cycle" onPress={save} />{message ? <Text>{message}</Text> : null}</>;
}

export default function Cycles() {
  const { data, update } = useStore();
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  const staff = person?.role === 'admin' || person?.role === 'staff';
  const [selectedId, setSelectedId] = useState(data.cycles[0]?.id ?? '');
  const [name, setName] = useState('');
  const [deadline, setDeadline] = useState(today());
  const [meeting, setMeeting] = useState('');
  const [clubId, setClubId] = useState(data.clubs[0]?.id ?? '');
  const [message, setMessage] = useState('');
  const cycle = data.cycles.find((c) => c.id === selectedId);
  function create() {
    if (!name.trim() || !validDate(deadline)) { setMessage('Enter a cycle name and a valid deadline (YYYY-MM-DD).'); return; }
    const newId = id();
    void update((d) => ({ ...d, cycles: [...d.cycles, { id: newId, name: name.trim(), deadline, status: 'open', slots: [], finalized: {} }] }))
      .then(() => { setSelectedId(newId); setName(''); setMessage('Cycle created.'); }).catch(() => undefined);
  }
  function addSlot() {
    if (!cycle || cycle.status === 'drafted' || cycle.status === 'published') return;
    if (!validDate(meeting) || !data.clubs.some((c) => c.id === clubId)) { setMessage('Select a club and enter a valid meeting date (YYYY-MM-DD).'); return; }
    if (meeting <= cycle.deadline) { setMessage('Meeting must be after the preference deadline.'); return; }
    void update((d) => {
      const current = d.cycles.find((c) => c.id === cycle?.id);
      if (!current || (current.status !== 'open' && current.status !== 'collecting')) throw new Error('Cycle can no longer be edited.');
      if (current.slots.some((s) => s.clubId === clubId && s.meeting === meeting)) throw new Error('This club already has a meeting on that date.');
      return { ...d, cycles: d.cycles.map((c) => c.id === current.id ? { ...c, slots: [...c.slots, { id: id(), clubId, meeting }] } : c) };
    }).then(() => { setMeeting(''); setMessage('Meeting added.'); }).catch(() => undefined);
  }
  if (!staff) return <Page title="Cycles"><Note>Staff manage planning cycles. Members can vote on the Preferences page.</Note></Page>;
  return <Page title="Cycles">
    <Card><Label>Create a cycle</Label><Field label="Cycle name" value={name} onChangeText={setName} />
      <Field label="Preference deadline (YYYY-MM-DD)" value={deadline} onChangeText={setDeadline} /><Action title="Create cycle" onPress={create} />
    </Card>
    <Card><Label>Select a cycle</Label><Actions>{data.cycles.map((c) => <Action key={c.id} title={`${c.name}${c.id === selectedId ? ' ✓' : ''}`} onPress={() => setSelectedId(c.id)} />)}</Actions></Card>
    {cycle && <Card><Label>{cycle.name} · {cycle.status}</Label><Text>Preference deadline: {cycle.deadline}</Text>
      {(cycle.status === 'open' || cycle.status === 'collecting') && <EditCycle key={cycle.id} cycle={cycle} />}
      {cycle.status === 'open' && <Action title="Open member voting" onPress={() => {
        void update((d) => ({ ...d, cycles: d.cycles.map((c) => c.id === cycle.id && c.status === 'open' ? { ...c, status: 'collecting' } : c) })).catch(() => undefined);
      }} />}
      <Label>Meetings</Label>
      {cycle.slots.length === 0 && <Note>No meetings added.</Note>}
      {cycle.slots.map((slot) => <Actions key={slot.id}><Text>{data.clubs.find((c) => c.id === slot.clubId)?.name} · {slot.meeting}</Text>
        {(cycle.status === 'open' || cycle.status === 'collecting') && <Action title="Remove" onPress={() => {
          void update((d) => ({ ...d, cycles: d.cycles.map((c) => c.id === cycle.id && (c.status === 'open' || c.status === 'collecting') ? { ...c, slots: c.slots.filter((s) => s.id !== slot.id) } : c) })).catch(() => undefined);
        }} />}
      </Actions>)}
      {(cycle.status === 'open' || cycle.status === 'collecting') && <><Note>Select club:</Note><Actions>{data.clubs.map((club) => <Action key={club.id} title={`${club.name}${club.id === clubId ? ' ✓' : ''}`} onPress={() => setClubId(club.id)} />)}</Actions>
        <Field label="Meeting date (YYYY-MM-DD)" value={meeting} onChangeText={setMeeting} /><Action title="Add meeting" onPress={addSlot} /></>}
    </Card>}
    {message ? <Text>{message}</Text> : null}
  </Page>;
}
