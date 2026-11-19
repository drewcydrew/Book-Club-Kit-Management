import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { Role } from '../domain/model';
import type { PickerOption } from '../domain/search';
import { useSelection } from '../state/selection';
import { Action, Actions, Card, Label, Note, styles } from './ui';
import { SearchPicker } from './search-picker';

const roles: Role[] = ['member', 'staff', 'admin'];
const userGroups = [{ value: 'all', label: 'All users' }];

export function UserSelection({ disabled = false }: { disabled?: boolean }) {
  const { people, person, loading, error, refreshUsers, select } = useSelection();
  const [pickedRole, setPickedRole] = useState<Role | null>(null);
  const activeRole = pickedRole ?? person?.role ?? 'member';
  const options = useMemo<PickerOption[]>(() => people.filter((value) => value.role === activeRole)
    .map((value) => ({ id: value.id, label: `${value.name} · ${value.role}`, detail: value.role, group: value.role })), [people, activeRole]);
  return <View style={[styles.page, { paddingBottom: 0 }]}>
    <Text accessibilityRole="header" style={styles.heading}>Welcome</Text>
    <Card>
      <Label>Choose a demo user</Label>
      <Note>Choose a user type and person to begin. This public demo has no authentication or authorization. Use fictional information only.</Note>
      {loading && <ActivityIndicator />}
      {error && <><Text>{error}</Text><Action title="Retry loading users" onPress={() => { void refreshUsers().catch(() => undefined); }} /></>}
      {!error && <Action title="Refresh user list" disabled={disabled || loading} onPress={() => { void refreshUsers().catch(() => undefined); }} />}
      {!loading && !error && people.length === 0 && <Note>No shared users are available. Run the server demo seed, or create an admin through the API if it was already run.</Note>}
      {!loading && !error && people.length > 0 && !people.some((value) => value.role === 'admin') && <Note>No administrator exists. Restore an admin through the API if the demo seed was already run.</Note>}
      <Actions>{roles.map((role) => <Action key={role} selected={activeRole === role} title={role} disabled={disabled || loading} onPress={() => setPickedRole(role)} />)}</Actions>
      <SearchPicker label="Demo user" options={options} selectedId={person?.id ?? ''} groups={userGroups} summary={`Select a ${activeRole}`} disabled={disabled || loading || !!error} onSelect={select} />
      {person && <><Note>Selected: {person.name} · {person.role}</Note><Action title="Clear selection" disabled={disabled} onPress={() => select('')} /></>}
      {disabled && <Note>Wait for the shared change to finish before changing users.</Note>}
    </Card>
  </View>;
}
