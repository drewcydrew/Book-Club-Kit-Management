import { Link, Slot } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
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
        <Link href="/" style={styles.link}>Home</Link>
        <Link href="/catalog" style={styles.link}>Catalog & kits</Link>
        <Link href="/clubs" style={styles.link}>Clubs</Link>
        <Link href="/cycles" style={styles.link}>Cycles</Link>
        <Link href="/preferences" style={styles.link}>Preferences</Link>
        <Link href="/schedule" style={styles.link}>Schedule</Link>
        <Link href="/circulation" style={styles.link}>Circulation</Link>
        <Link href="/settings" style={styles.link}>Settings</Link>
      </ScrollView>
    </View>
    <Slot />
  </View>;
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
  return <SharedProvider><StoreProvider><Shell /></StoreProvider></SharedProvider>;
}
