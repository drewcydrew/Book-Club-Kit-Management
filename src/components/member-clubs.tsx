import { useMemo, useState } from 'react';
import { Text } from 'react-native';
import { SearchPicker } from './search-picker';
import { Action, Card, Label, Note } from './ui';
import type { Club, Person } from '../domain/model';
import type { PickerOption } from '../domain/search';
import { enrolInClub, leaveClub } from '../state/api';
import { useShared } from '../state/shared';
import { useStore } from '../state/store';

const clubGroups = [{ value: 'all', label: 'All clubs' }, { value: 'enrolled', label: 'Enrolled' }, { value: 'not-enrolled', label: 'Not enrolled' }];

export function MemberClubs({ person }: { person: Person }) {
  const { data } = useStore();
  const shared = useShared();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const clubOptions = useMemo<PickerOption[]>(() => data.clubs.map((club) => {
    const enrolled = data.memberships.some((membership) => membership.personId === person.id && membership.clubId === club.id);
    return { id: club.id, label: club.name, detail: enrolled ? 'Enrolled' : 'Not enrolled', group: enrolled ? 'enrolled' : 'not-enrolled' };
  }), [data.clubs, data.memberships, person.id]);
  const enrolled = clubOptions.filter((option) => option.group === 'enrolled');

  function toggleClub(club: Club, isEnrolled: boolean) {
    setMessage('');
    void shared.mutate(() => isEnrolled ? leaveClub(person.id, club.id, club.membershipRevision) : enrolInClub(person.id, club.id, club.membershipRevision))
      .then(() => setMessage(isEnrolled ? `Left ${club.name}.` : `Enrolled in ${club.name}.`))
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Unable to update club enrolment.'));
  }

  return <Card>
    <Label>{enrolled.length === 1 ? 'Your club' : 'Your clubs'}</Label>
    {enrolled.length ? enrolled.map((club) => <Text key={club.id}>{club.label}</Text>) :
      <Note>You are not enrolled in a club. Use Manage enrolment to join one.</Note>}
    <Action title={open ? 'Hide enrolment controls' : 'Manage enrolment'} expanded={open} onPress={() => setOpen(!open)} />
    {open && <>
      <Note>Enrolment is shared. Your clubs appear in Preferences and published schedules.</Note>
      {data.clubs.length === 0 ? <Note>No clubs are defined yet.</Note> :
        <SearchPicker label="My clubs" options={clubOptions} selectedId="" groups={clubGroups} summary="Browse clubs to enrol or leave" disabled={shared.saving} feedback={shared.saving ? 'Saving enrolment...' : message} closeOnSelect={false}
          onSelect={(clubId) => {
            const club = data.clubs.find((item) => item.id === clubId);
            if (club) toggleClub(club, clubOptions.find((option) => option.id === clubId)?.group === 'enrolled');
          }} />}
    </>}
    {message ? <Text>{message}</Text> : null}
  </Card>;
}
