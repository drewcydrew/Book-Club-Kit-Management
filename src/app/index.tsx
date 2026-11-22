import { Link } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Action, Card, Label, Note, styles } from '../components/ui';
import { MemberClubs } from '../components/member-clubs';
import { useStore } from '../state/store';
import { useSelection } from '../state/selection';
import { useShared, useSharedStatus } from '../state/shared';
import { ScreenGate } from '../components/screen-gate';
import { UserSelection } from '../components/user-selection';
import { useAuth } from '../state/auth';
import { useNavigationGuard } from '../components/navigation-guard';
import { useLibraryService } from '../state/library-service';

export default function Home() {
  const { person, loading, error, refreshUsers } = useSelection();
  const auth = useAuth();
  const library = useLibraryService();
  const { saving } = useSharedStatus();
  const guard = useNavigationGuard();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  function run(action: () => Promise<void>) {
    const proceed = () => {
      setBusy(true);
      setMessage('');
      void action().then(() => setPassword('')).catch((reason: unknown) => {
        setMessage(reason instanceof Error ? reason.message : 'Authentication failed.');
      }).finally(() => setBusy(false));
    };
    if (!saving && !guard.intercept(proceed)) proceed();
  }
  return <ScrollView keyboardShouldPersistTaps="handled">
    <View style={[styles.page, { paddingBottom: 0 }]}>
      <Text accessibilityRole="header" style={styles.heading}>Welcome</Text>
      <Card><Label>Administrator sign-in</Label>
        {auth.user ? <>
          <Note>Signed in as {auth.user.email ?? 'Firebase user'}.</Note>
          {loading && <Note>Loading administrator access...</Note>}
          {error && <><Text style={styles.error}>{error}</Text><Action title="Retry" onPress={() => { void refreshUsers().catch(() => undefined); }} /></>}
          <Action title="Sign out" disabled={saving || busy} onPress={() => run(auth.signOut)} />
        </> : <>
          <Note>Sign in with an existing Firebase account to manage the app.</Note>
          <Label>Email</Label>
          <TextInput accessibilityLabel="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" editable={!busy} style={styles.input} />
          <Label>Password</Label>
          <TextInput accessibilityLabel="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" editable={!busy} style={styles.input} />
          <Action title={busy ? 'Signing in...' : 'Sign in'} tone="primary" disabled={saving || busy || !email.trim() || !password || !auth.available} onPress={() => run(() => auth.signIn(email, password))} />
        </>}
        {(message || auth.error) && <Text accessibilityLiveRegion="polite" style={styles.error}>{message || auth.error}</Text>}
      </Card>
      <Card><Label>Library service</Label>
        <Note>Service names are public. All signed-in administrators can manage every service.</Note>
        {library.error && <><Text style={styles.error}>{library.error}</Text><Action title="Retry" onPress={() => { void library.refresh().catch(() => undefined); }} /></>}
        {!library.error && library.services.length === 0 && <Note>No library services are available yet.</Note>}
        {library.services.map((service) => <Action key={service.id} title={service.name} selected={library.service?.id === service.id}
          disabled={saving || busy} onPress={() => run(() => library.select(service.id))} />)}
      </Card>
    </View>
    {!auth.user && library.service && <UserSelection disabled={saving || busy} />}
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
      <Note>Demo member access is public and impersonable. Use fictional data only.</Note>
    </Card>
    <Card><Label>Start here</Label>
      <Link href="/preferences" style={{ color: '#245e51', textDecorationLine: 'underline', paddingVertical: 8 }}>Vote and review preferences →</Link>
      <Link href="/schedule" style={{ color: '#245e51', textDecorationLine: 'underline', paddingVertical: 8 }}>Create and review a schedule →</Link>
      {staff && <Link href="/circulation" style={{ color: '#245e51', textDecorationLine: 'underline', paddingVertical: 8 }}>Record kit circulation →</Link>}
    </Card>
  </View>;
}
