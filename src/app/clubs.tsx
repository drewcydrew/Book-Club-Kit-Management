import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Text } from 'react-native';
import { Action, Actions, Card, Field, Label, Note, Page } from '../components/ui';
import { id } from '../domain/logic';
import type { Club } from '../domain/model';
import { useStore } from '../state/store';
import { deleteRecord, saveRecord, setClubKit } from '../state/api';
import { useShared } from '../state/shared';

const blankClub = (branch: string): Club => ({ id: '', name: '', branch, leaderId: '', size: 1, cadence: 'Monthly', pickup: 'pickup', address: '', history: [] });

export default function Clubs() {
  const { data, update } = useStore();
  const shared = useShared();
  const { refresh } = shared;
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  const staff = person?.role === 'admin' || person?.role === 'staff';
  const [club, setClub] = useState<Club>(() => blankClub(data.library.branches[0] ?? ''));
  const [size, setSize] = useState('1');
  const [memberName, setMemberName] = useState('');
  const [memberId, setMemberId] = useState('');
  const [message, setMessage] = useState('');
  const [clubRevision, setClubRevision] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string; revision: number } | null>(null);
  const [unlinking, setUnlinking] = useState<{ clubId: string; kitId: string } | null>(null);
  useFocusEffect(useCallback(() => { void refresh().catch(() => undefined); }, [refresh]));
  function edit(value: Club) { setClub(value); setClubRevision(shared.data.clubs.find((item) => item.id === value.id)?.revision ?? null); setSize(String(value.size)); setMemberId(''); setMemberName(''); }
  function save() {
    const count = Number(size);
    if (!club.name.trim() || !club.branch.trim() || !Number.isInteger(count) || count < 1 || (club.pickup === 'delivery' && !club.address.trim())) {
      setMessage('Enter a club name, branch, positive size and delivery address if applicable.'); return;
    }
    if (club.leaderId && !data.people.some((p) => p.id === club.leaderId && p.clubId === club.id)) { setMessage('The leader must belong to this club.'); return; }
    const { leaderId, history, ...fields } = club;
    const value = { ...fields, name: club.name.trim(), branch: club.branch.trim(), size: count, ...(clubRevision === null ? {} : { revision: clubRevision }) };
    void shared.mutate(() => saveRecord('clubs', value)).then(async (saved) => {
      if (!('pickup' in saved)) throw new Error('Server returned an invalid club.');
      if (club.id) {
        await update((d) => ({ ...d, clubs: d.clubs.map((item) => item.id === club.id ? { ...item, leaderId, history } : item),
          people: d.people.map((p) => p.clubId !== club.id ? p : { ...p, role: p.id === leaderId ? 'leader' : 'member' }) }));
      }
      setClub({ ...saved, leaderId, history }); setClubRevision(saved.revision); setSize(String(saved.size)); setMessage('Club saved. Leader and reading history are local to this device.');
    }).catch(() => undefined);
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
    <Actions><Action title="Refresh shared clubs" onPress={() => { void shared.refresh().catch(() => undefined); }} /></Actions>
    <Note>Clubs and kit links are shared; members, leaders and reading history are local to this device. A kit link is not a checkout.</Note>
    {deleting && <Card><Label>Delete {deleting.name}?</Label><Note>This affects every user and is blocked while kit links remain.</Note><Actions>
      <Action title="Confirm deletion" onPress={() => { void shared.mutate(() => deleteRecord('clubs', deleting.id, deleting.revision)).then(() => setDeleting(null)).catch(() => undefined); }} />
      <Action title="Cancel deletion" onPress={() => setDeleting(null)} /></Actions></Card>}
    {unlinking && <Card><Label>Remove this shared kit link?</Label><Actions>
      <Action title="Confirm unlink" onPress={() => { void shared.mutate(() => setClubKit(unlinking.clubId, unlinking.kitId, false)).then(() => setUnlinking(null)).catch(() => undefined); }} />
      <Action title="Cancel unlink" onPress={() => setUnlinking(null)} /></Actions></Card>}
    {data.clubs.filter((c) => staff || c.id === person?.clubId).map((value) => <Card key={value.id}>
      <Label>{value.name}</Label><Note>{value.branch} · {value.size} members · {value.cadence} · {value.pickup}</Note>
      {value.pickup === 'delivery' ? <Text>{value.address}</Text> : null}
      <Text>Leader: {data.people.find((p) => p.id === value.leaderId)?.name ?? 'Not assigned'}</Text>
      <Text>Members: {data.people.filter((p) => p.clubId === value.id).map((p) => p.name).join(', ') || 'None'}</Text>
      <Text>Previously read: {value.history.map((titleId) => data.titles.find((t) => t.id === titleId)?.name ?? titleId).join(', ') || 'None'}</Text>
      <Label>Linked kits</Label>
      {shared.data.links.filter((link) => link.clubId === value.id).map((link) => {
        const kit = data.kits.find((item) => item.id === link.kitId);
        return <Actions key={link.kitId}><Text>{kit ? `${kit.barcode} · ${data.titles.find((title) => title.id === kit.titleId)?.name ?? 'Title unavailable'}` : 'Kit unavailable'}</Text>
          {staff && <Action title={`Unlink ${kit?.barcode ?? link.kitId}`} onPress={() => setUnlinking(link)} />}</Actions>;
      })}
      {staff && <><Note>Link a kit:</Note><Actions>{data.kits.filter((kit) => !shared.data.links.some((link) => link.clubId === value.id && link.kitId === kit.id)).map((kit) => <Action key={kit.id} title={`Link ${kit.barcode}`} onPress={() => { void shared.mutate(() => setClubKit(value.id, kit.id, true)).catch(() => undefined); }} />)}</Actions>
        <Actions><Action title="Edit club" onPress={() => edit(value)} /><Action title="Delete club" onPress={() => {
          const record = shared.data.clubs.find((item) => item.id === value.id);
          if (record) setDeleting({ id: record.id, name: record.name, revision: record.revision });
        }} /></Actions></>}
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
