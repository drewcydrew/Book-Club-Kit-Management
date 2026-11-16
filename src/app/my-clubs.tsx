import React, { useMemo, useState } from 'react';
import { Text } from 'react-native';
import { SearchPicker } from '../components/search-picker';
import { Card, Label, Note, Page } from '../components/ui';
import type { Club } from '../domain/model';
import type { PickerOption } from '../domain/search';
import { enrolInClub, leaveClub } from '../state/api';
import { useShared } from '../state/shared';
import { useStore } from '../state/store';

const clubGroups = [{ value: 'all', label: 'All clubs' }, { value: 'enrolled', label: 'Enrolled' }, { value: 'not-enrolled', label: 'Not enrolled' }];

export default function MyClubs() {
  const { data } = useStore();
  const shared = useShared();
  const [message, setMessage] = useState('');
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  const busy = shared.saving;
  const clubOptions = useMemo<PickerOption[]>(() => data.clubs.map((club) => {
    const enrolled = data.memberships.some((membership) => membership.personId === person?.id && membership.clubId === club.id);
    return { id: club.id, label: club.name, detail: enrolled ? 'Enrolled' : 'Not enrolled', group: enrolled ? 'enrolled' : 'not-enrolled' };
  }), [data.clubs, data.memberships, person?.id]);
  const enrolledCount = clubOptions.filter((option) => option.group === 'enrolled').length;

  function toggleClub(club: Club, enrolled: boolean) {
    if (!person) return;
    setMessage('');
    void shared.mutate(() => enrolled ? leaveClub(person.id, club.id, club.membershipRevision) : enrolInClub(person.id, club.id, club.membershipRevision))
      .then(() => setMessage(enrolled ? `Left ${club.name}.` : `Enrolled in ${club.name}.`))
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Unable to update club enrolment.'));
  }

  if (!person || person.role !== 'member') return <Page title="My clubs"><Note>Choose a member on the User tab to see and enrol in clubs.</Note></Page>;

  return <Page title="My clubs">
    <Card>
      <Label>{person.name} · {enrolledCount} of {data.clubs.length} enrolled</Label>
      <Note>Enrol in clubs to see them in Preferences and your published schedules. Enrolment is shared.</Note>
      {data.clubs.length === 0 && <Note>No clubs are defined yet.</Note>}
      {data.clubs.length > 0 && <SearchPicker label="My clubs" options={clubOptions} selectedId="" groups={clubGroups} summary="Browse clubs to enrol or leave" disabled={busy} closeOnSelect={false}
        onSelect={(clubId) => {
          const club = data.clubs.find((item) => item.id === clubId);
          if (club) toggleClub(club, clubOptions.find((option) => option.id === clubId)?.group === 'enrolled');
        }} />}
    </Card>
    {message ? <Text>{message}</Text> : null}
  </Page>;
}
