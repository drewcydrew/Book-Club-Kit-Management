import React, { useMemo, useState } from 'react';
import { Text } from 'react-native';
import { SearchPicker } from '../components/search-picker';
import { Action, Actions, Card, Label, Note, Page } from '../components/ui';
import type { Role } from '../domain/model';
import type { PickerOption } from '../domain/search';
import { useStore } from '../state/store';

const roles: Role[] = ['member', 'staff', 'admin'];
const userGroups = [{ value: 'all', label: 'All users' }];

export default function User() {
  const { data, update, reset } = useStore();
  const [pickedRole, setPickedRole] = useState<Role | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [message, setMessage] = useState('');
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  const activeRole = pickedRole ?? person?.role ?? 'member';
  const personOptions = useMemo<PickerOption[]>(() => data.people
    .filter((value) => value.role === activeRole)
    .map((value) => ({ id: value.id, label: `${value.name} · ${value.role}`, detail: value.role, group: value.role })), [data.people, activeRole]);

  function choosePerson(idValue: string) {
    void update((d) => ({ ...d, selectedPersonId: idValue })).then(() => setMessage('Selected demo user saved on this device.')).catch((error: unknown) =>
      setMessage(error instanceof Error ? error.message : 'Unable to save selected user.'));
  }

  return <Page title="User">
    <Card>
      <Label>Target user experience</Label>
      <Note>Choose the user type to test, then pick a shared user. Roles only change the interface. There is no authentication or authorization; anyone with API access can change shared demo data. Use fictional information only.</Note>
      {data.people.length === 0 && <Note>No shared users are available. Run the server demo seed, or create an admin through the API if the seed was already run.</Note>}
      {data.people.length > 0 && !data.people.some((value) => value.role === 'admin') && <Note>No administrator exists. The demo seed creates one only on its first run; if already seeded, restore an admin through the API.</Note>}
      <Actions>{roles.map((role) => <Action key={role} selected={activeRole === role} title={role} onPress={() => setPickedRole(role)} />)}</Actions>
      <SearchPicker label="Demo user" options={personOptions} selectedId={person?.id ?? ''} groups={userGroups} summary={`Select a ${activeRole}`} onSelect={choosePerson} />
      {person && <Note>Selected: {person.name} · {person.role}</Note>}
    </Card>

    <Card><Label>Device-local selection</Label>
      <Note>Only your selected demo user is stored on this device. Club enrolment, ballots, cycles, schedules and circulation are shared. Reset does not delete shared data.</Note>
      {confirmReset ? <Actions><Action tone="danger" title="Confirm reset selections" onPress={() => { void reset(); setConfirmReset(false); }} /><Action title="Cancel" onPress={() => setConfirmReset(false)} /></Actions>
        : <Action title="Reset local selections" onPress={() => setConfirmReset(true)} />}
    </Card>
    {message ? <Text>{message}</Text> : null}
  </Page>;
}
