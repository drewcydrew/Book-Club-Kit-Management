import { useEffect, useMemo, useRef, useState } from 'react';
import { Text } from 'react-native';
import { SearchPicker } from './search-picker';
import { Action, Card, Label, Note } from './ui';
import type { Person } from '../domain/model';
import type { PickerOption } from '../domain/search';
import { enrolInClub, leaveClub, loadEnrolment } from '../state/api';
import type { EnrolmentClub } from '../state/api';
import { useShared } from '../state/shared';
import { useStore } from '../state/store';

const clubGroups = [{ value: 'all', label: 'All clubs' }, { value: 'enrolled', label: 'Enrolled' }, { value: 'not-enrolled', label: 'Not enrolled' }];

export function MemberClubs({ person }: { person: Person }) {
  const { data } = useStore();
  const shared = useShared();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [directory, setDirectory] = useState<EnrolmentClub[] | null>(null);
  const [loading, setLoading] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); }, []);
  const clubOptions = useMemo<PickerOption[]>(() => (directory ?? []).map((club) =>
    ({ id: club.id, label: club.name, detail: club.enrolled ? 'Enrolled' : 'Not enrolled', group: club.enrolled ? 'enrolled' : 'not-enrolled' })), [directory]);
  const enrolled = data.clubs.filter((club) => data.memberships.some((membership) => membership.personId === person.id && membership.clubId === club.id));

  async function loadDirectory() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      const clubs = await loadEnrolment(person.id, controller.signal);
      if (controller.signal.aborted) return false;
      setDirectory(clubs);
      setMessage('');
      return true;
    } catch (error: unknown) {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Unable to load clubs.');
      return false;
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  function toggleClub(clubId: string, clubName: string, revision: number, isEnrolled: boolean) {
    setMessage('');
    void shared.mutate(() => isEnrolled ? leaveClub(person.id, clubId, revision) : enrolInClub(person.id, clubId, revision))
      .then(async () => {
        if (await loadDirectory()) setMessage(isEnrolled ? `Left ${clubName}.` : `Enrolled in ${clubName}.`);
      })
      .catch((error: unknown) => { setDirectory(null); setMessage(error instanceof Error ? error.message : 'Unable to update club enrolment.'); });
  }

  return <Card>
    <Label>{enrolled.length === 1 ? 'Your club' : 'Your clubs'}</Label>
    {enrolled.length ? enrolled.map((club) => <Text key={club.id}>{club.name}</Text>) :
      <Note>You are not enrolled in a club. Use Manage enrolment to join one.</Note>}
    <Action title={open ? 'Hide enrolment controls' : 'Manage enrolment'} expanded={open} onPress={() => {
      setOpen(!open);
      if (!open && !directory) void loadDirectory();
    }} />
    {open && <>
      <Note>Enrolment is shared. Your clubs appear in Preferences and published schedules.</Note>
      {!directory ? loading ? <Note>Loading clubs...</Note> : <Action title="Retry loading clubs" onPress={() => { void loadDirectory(); }} /> : directory.length === 0 ? <Note>No clubs are defined yet.</Note> :
        <><Action title="Refresh club list" disabled={shared.saving || loading} onPress={() => { void loadDirectory(); }} />
        <SearchPicker label="My clubs" options={clubOptions} selectedId="" groups={clubGroups} summary="Browse clubs to enrol or leave" disabled={shared.saving || loading} feedback={shared.saving ? 'Saving enrolment...' : loading ? 'Loading clubs...' : message} closeOnSelect={false}
          onSelect={(clubId) => {
            const club = directory.find((item) => item.id === clubId);
            if (club) toggleClub(club.id, club.name, club.revision, club.enrolled);
          }} /></>}
    </>}
    {message ? <Text>{message}</Text> : null}
  </Card>;
}
