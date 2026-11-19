import { Link } from 'expo-router';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Action, Card, Label, Note, styles } from '../components/ui';
import { MemberClubs } from '../components/member-clubs';
import { useStore } from '../state/store';
import { useSelection } from '../state/selection';
import { useShared, useSharedStatus } from '../state/shared';
import { ScreenGate } from '../components/screen-gate';
import { UserSelection } from '../components/user-selection';

export default function Home() {
  const { person } = useSelection();
  const { saving } = useSharedStatus();
  return <ScrollView keyboardShouldPersistTaps="handled">
    <UserSelection disabled={saving} />
    {person?.role === 'member' ? <ScreenGate><HomeContent /></ScreenGate> : person ? <HomeIntro staff /> : null}
  </ScrollView>;
}

function HomeContent() {
  const { data } = useStore();
  const shared = useShared();
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  return <View style={styles.page}>
    <Text accessibilityRole="header" style={styles.heading}>Explore</Text>
    {shared.error && <Text style={styles.error}>{shared.error}</Text>}
    <Action title="Refresh your clubs" disabled={shared.saving} onPress={() => { void shared.refresh().catch(() => undefined); }} />
    {person?.role === 'member' && <MemberClubs key={person.id} person={person} />}
    <HomeIntro staff={false} />
  </View>;
}

function HomeIntro({ staff }: { staff: boolean }) {
  return <View style={styles.page}>
    <Card><Label>Explore a fictional library</Label>
      <Note>Users, memberships, preferences and schedules are shared and publicly writable. Use fictional data only.</Note>
    </Card>
    <Card><Label>Start here</Label>
      <Link href="/preferences" style={{ color: '#245e51', textDecorationLine: 'underline', paddingVertical: 8 }}>Vote and review preferences →</Link>
      <Link href="/schedule" style={{ color: '#245e51', textDecorationLine: 'underline', paddingVertical: 8 }}>Create and review a schedule →</Link>
      {staff && <Link href="/circulation" style={{ color: '#245e51', textDecorationLine: 'underline', paddingVertical: 8 }}>Record kit circulation →</Link>}
    </Card>
  </View>;
}
