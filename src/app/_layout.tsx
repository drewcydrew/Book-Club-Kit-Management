import { Link, router, Slot } from 'expo-router';
import type { Href } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { NavigationGuardProvider, useNavigationGuard } from '../components/navigation-guard';
import { StoreProvider, useStore } from '../state/store';
import { SharedProvider } from '../state/shared';

function Shell() {
  const { data } = useStore();
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  return <View style={styles.shell}>
    <View style={styles.header}>
      <Text style={styles.brand}>{data.library.name} · Book club kits</Text>
      <Text style={styles.context}>Public writable demo · {person ? `${person.name} · ${data.selectedClubId ? data.clubs.find((club) => club.id === data.selectedClubId)?.name ?? 'unavailable club' : 'no club selected'}` : 'no user selected'} · Users, clubs, voting and schedules shared</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.navigation}>
        <NavigationLink href="/">Home</NavigationLink>
        <NavigationLink href="/catalog">Catalog & kits</NavigationLink>
        <NavigationLink href="/clubs">Clubs</NavigationLink>
        <NavigationLink href="/cycles">Cycles</NavigationLink>
        <NavigationLink href="/preferences">Preferences</NavigationLink>
        <NavigationLink href="/schedule">Schedule</NavigationLink>
        <NavigationLink href="/circulation">Circulation</NavigationLink>
        <NavigationLink href="/settings">Settings</NavigationLink>
      </ScrollView>
    </View>
    <Slot />
  </View>;
}

function NavigationLink({ href, children }: { href: Href; children: string }) {
  const guard = useNavigationGuard();
  return <Link href={href} style={styles.link} onPress={(event) => {
    if (guard.intercept(() => router.navigate(href))) event.preventDefault();
  }}>{children}</Link>;
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#f1f3eb' },
  header: { backgroundColor: '#183f37', paddingHorizontal: 20, paddingTop: 16, gap: 6 },
  brand: { color: '#fffefa', fontSize: 19, fontWeight: '700' },
  context: { color: '#e1efe8', lineHeight: 19 },
  navigation: { gap: 20, marginTop: 4, borderTopWidth: 1, borderTopColor: '#52786d' },
  link: { color: '#fffefa', paddingVertical: 14, fontWeight: '600' },
});

export default function Layout() {
  return <SharedProvider><StoreProvider><NavigationGuardProvider><Shell /></NavigationGuardProvider></StoreProvider></SharedProvider>;
}
