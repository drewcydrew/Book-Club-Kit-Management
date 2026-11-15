import React, { useState } from 'react';
import { Text } from 'react-native';
import { Action, Actions, Card, Field, Label, Note, Page } from '../components/ui';
import { id } from '../domain/logic';
import type { Club } from '../domain/model';
import { useStore } from '../state/store';

const blankClub = (branch: string): Club => ({ id: '', name: '', branch, leaderId: '', size: 1, cadence: 'Monthly', pickup: 'pickup', address: '', history: [] });

export default function Clubs() {
  const { data, update } = useStore();
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  const staff = person?.role === 'admin' || person?.role === 'staff';
  const [club, setClub] = useState<Club>(() => blankClub(data.library.branches[0] ?? ''));
  const [size, setSize] = useState('1');
  const [memberName, setMemberName] = useState('');
  const [memberId, setMemberId] = useState('');
  const [message, setMessage] = useState('');
  function edit(value: Club) { setClub(value); setSize(String(value.size)); setMemberId(''); setMemberName(''); }
  function save() {
    const count = Number(size);
    if (!club.name.trim() || !club.branch.trim() || !Number.isInteger(count) || count < 1 || (club.pickup === 'delivery' && !club.address.trim())) {
      setMessage('Enter a club name, branch, positive size and delivery address if applicable.'); return;
    }
    const value = { ...club, id: club.id || id(), name: club.name.trim(), branch: club.branch.trim(), size: count };
    void update((d) => {
      if (value.leaderId && !d.people.some((p) => p.id === value.leaderId && p.clubId === value.id)) throw new Error('The leader must belong to this club.');
      return { ...d, clubs: [...d.clubs.filter((c) => c.id !== value.id), value],
        people: d.people.map((p) => p.clubId !== value.id ? p : { ...p, role: p.id === value.leaderId ? 'leader' : 'member' }) };
    }).then(() => { edit(value); setMessage('Club saved.'); }).catch(() => undefined);
  }
  function addMember() {
    if (!club.id || !memberName.trim()) { setMessage('Save the club and enter a fictional member name.'); return; }
    const name = memberName.trim();
    void update((d) => {
      if (!d.clubs.some((c) => c.id === club.id)) throw new Error('Club no longer exists.');
      if (memberId) {
        if (!d.people.some((p) => p.id === memberId && p.clubId === club.id)) throw new Error('Member no longer belongs to this club.');
        return { ...d, people: d.people.map((p) => p.id === memberId ? { ...p, name } : p) };
      }
      return { ...d, people: [...d.people, { id: id(), name, role: 'member', clubId: club.id }] };
    }).then(() => { setMemberName(''); setMemberId(''); setMessage(memberId ? 'Member updated.' : 'Member added.'); }).catch(() => undefined);
  }
  return <Page title="Clubs">
    {data.clubs.filter((c) => staff || c.id === person?.clubId).map((value) => <Card key={value.id}>
      <Label>{value.name}</Label><Note>{value.branch} · {value.size} members · {value.cadence} · {value.pickup}</Note>
      {value.pickup === 'delivery' ? <Text>{value.address}</Text> : null}
      <Text>Leader: {data.people.find((p) => p.id === value.leaderId)?.name ?? 'Not assigned'}</Text>
      <Text>Members: {data.people.filter((p) => p.clubId === value.id).map((p) => p.name).join(', ') || 'None'}</Text>
      <Text>Previously read: {value.history.map((titleId) => data.titles.find((t) => t.id === titleId)?.name ?? titleId).join(', ') || 'None'}</Text>
      {staff && <Action title="Edit club" onPress={() => edit(value)} />}
    </Card>)}
    {staff && <Card><Label>{club.id ? 'Edit club' : 'Add club'}</Label>
      <Field label="Club name" value={club.name} onChangeText={(name) => setClub({ ...club, name })} /><Field label="Branch" value={club.branch} onChangeText={(branch) => setClub({ ...club, branch })} />
      <Field label="Club size" value={size} onChangeText={setSize} /><Field label="Meeting cadence" value={club.cadence} onChangeText={(cadence) => setClub({ ...club, cadence })} />
      <Action title={`Method: ${club.pickup}`} onPress={() => setClub({ ...club, pickup: club.pickup === 'pickup' ? 'delivery' : 'pickup' })} />
      {club.pickup === 'delivery' && <Field label="Fictional delivery address" value={club.address} onChangeText={(address) => setClub({ ...club, address })} />}
      {!!club.id && <><Note>Choose a leader:</Note><Actions>{data.people.filter((p) => p.clubId === club.id).map((p) => <Action key={p.id} title={`${p.name}${club.leaderId === p.id ? ' ✓' : ''}`} onPress={() => setClub({ ...club, leaderId: p.id })} />)}</Actions>
        <Note>Choose a person to edit their fictional name:</Note><Actions>{data.people.filter((p) => p.clubId === club.id).map((p) => <Action key={p.id} title={`Edit ${p.name}`} onPress={() => { setMemberId(p.id); setMemberName(p.name); }} />)}</Actions>
        <Note>Mark titles this club has read:</Note><Actions>{data.titles.map((title) => <Action key={title.id} title={`${title.name}${club.history.includes(title.id) ? ' ✓' : ''}`} onPress={() => setClub({ ...club, history: club.history.includes(title.id) ? club.history.filter((t) => t !== title.id) : [...club.history, title.id] })} />)}</Actions></>}
      <Actions><Action title="Save club" onPress={save} /><Action title="Clear club form" onPress={() => edit(blankClub(data.library.branches[0] ?? ''))} /></Actions>
      {!!club.id && <><Field label={memberId ? 'Edit fictional member name' : 'New fictional member name'} value={memberName} onChangeText={setMemberName} /><Actions><Action title={memberId ? 'Save member name' : 'Add member'} onPress={addMember} />{!!memberId && <Action title="Cancel member edit" onPress={() => { setMemberId(''); setMemberName(''); }} />}</Actions></>}
      {message ? <Text>{message}</Text> : null}
    </Card>}
  </Page>;
}
