import { Link } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';
import { Card, Label, Note, Page } from '../components/ui';
import { useStore } from '../state/store';

export default function Home() {
  const { data } = useStore();
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  return <Page title="Welcome">
    <Card><Label>Explore a fictional library</Label>
      <Note>Users, memberships, clubs, titles, kits, preferences, cycles, schedules, lending settings, reading history and circulation are shared and publicly writable. Use fictional data only. Your selected user remains on this device; club enrolment is shared. Previous local shared records are not imported.</Note>
      {!data.people.some((person) => person.role === 'admin') && <Note>No shared admin exists. Run the explicit demo seed, or restore an admin through the API if it was already seeded.</Note>}
      {data.people.length > 0 && !data.selectedPersonId && <Note>Select a shared demo user in Settings to begin.</Note>}
      <Text>{data.titles.length} titles · {data.kits.length} kits · {data.clubs.length} clubs · {data.cycles.length} cycles</Text>
    </Card>
    <Card><Label>Start here</Label>
      <Link href="/preferences" style={{ color: '#245e51', textDecorationLine: 'underline', paddingVertical: 8 }}>Vote and review preferences →</Link>
      <Link href="/schedule" style={{ color: '#245e51', textDecorationLine: 'underline', paddingVertical: 8 }}>Create and review a schedule →</Link>
      {person?.role !== 'member' && <Link href="/circulation" style={{ color: '#245e51', textDecorationLine: 'underline', paddingVertical: 8 }}>Record kit circulation →</Link>}
    </Card>
  </Page>;
}
