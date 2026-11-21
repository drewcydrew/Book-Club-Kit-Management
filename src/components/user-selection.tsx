import React, { useMemo } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { PickerOption } from '../domain/search';
import { useSelection } from '../state/selection';
import { Action, Actions, Card, Label, Note, styles } from './ui';
import { SearchPicker } from './search-picker';

const userGroups = [{ value: 'all', label: 'All users' }];

export function UserSelection({ disabled = false }: { disabled?: boolean }) {
  const { people, person, loading, error, refreshUsers, select } = useSelection();
  const options = useMemo<PickerOption[]>(() => people.filter((value) => value.role === 'member')
    .map((value) => ({ id: value.id, label: `${value.name} · ${value.role}`, detail: value.role, group: value.role })), [people]);
  return <View style={[styles.page, { paddingBottom: 0 }]}>
    <Card>
      <Label>Choose a demo user</Label>
      <Note>Demo members are not authenticated. Anyone can act as a demo member. Use fictional information only.</Note>
      {loading && <ActivityIndicator />}
      {error && <><Text>{error}</Text><Action title="Retry loading users" onPress={() => { void refreshUsers().catch(() => undefined); }} /></>}
      {!error && <Action title="Refresh user list" disabled={disabled || loading} onPress={() => { void refreshUsers().catch(() => undefined); }} />}
      {options.length > 5 ? <SearchPicker label="Demo user" options={options} selectedId={person?.id ?? ''} groups={userGroups} summary="Select a member" disabled={disabled || loading || !!error} onSelect={select} />
        : options.length > 0 ? <Actions>{options.map((option) => <Action key={option.id} title={option.label} selected={person?.id === option.id}
          disabled={disabled || loading || !!error} onPress={() => select(option.id)} />)}</Actions>
          : !loading && !error ? <Note>No demo members are available.</Note> : null}
      {person && <><Note>Selected: {person.name} · {person.role}</Note><Action title="Clear selection" disabled={disabled} onPress={() => select('')} /></>}
      {disabled && <Note>Wait for the shared change to finish before changing users.</Note>}
    </Card>
  </View>;
}
