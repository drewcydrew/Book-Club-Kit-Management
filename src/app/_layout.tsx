import { Link, Slot } from 'expo-router';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StoreProvider, useStore } from '../state/store';

function Shell() {
  const { data } = useStore();
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  return <View style={{ flex: 1, backgroundColor: '#f3f7f4' }}>
    <View style={{ backgroundColor: '#183f37', padding: 14, gap: 6 }}>
      <Text style={{ color: 'white', fontSize: 19, fontWeight: '700' }}>{data.library.name} · Book club kits</Text>
      <Text style={{ color: '#e1efe8' }}>Local demo only · {person?.name} · No login or shared data</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 18, paddingVertical: 8 }}>
        <Link href="/" style={{ color: 'white' }}>Home</Link>
        <Link href="/catalog" style={{ color: 'white' }}>Catalog & kits</Link>
        <Link href="/clubs" style={{ color: 'white' }}>Clubs</Link>
        <Link href="/cycles" style={{ color: 'white' }}>Cycles</Link>
        <Link href="/preferences" style={{ color: 'white' }}>Preferences</Link>
        <Link href="/schedule" style={{ color: 'white' }}>Schedule</Link>
        <Link href="/circulation" style={{ color: 'white' }}>Circulation</Link>
        <Link href="/settings" style={{ color: 'white' }}>Settings</Link>
      </ScrollView>
    </View>
    <Slot />
  </View>;
}

export default function Layout() {
  return <StoreProvider><Shell /></StoreProvider>;
}
