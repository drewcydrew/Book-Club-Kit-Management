import { Redirect, Link, router, Slot, usePathname } from 'expo-router';
import type { Href } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { NavigationGuardProvider, useNavigationGuard } from '../components/navigation-guard';
import { StoreProvider, useStore } from '../state/store';
import { SharedProvider } from '../state/shared';

const staffOnlyRoutes = ['/catalog', '/clubs', '/cycles', '/circulation', '/admin'];
const memberOnlyRoutes = ['/my-clubs'];

function matchesRoute(pathname: string, routes: string[]) {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function Shell() {
  const { data } = useStore();
  const pathname = usePathname();
  const person = data.people.find((p) => p.id === data.selectedPersonId);
  const member = person?.role === 'member';
  const blocked = member && matchesRoute(pathname, staffOnlyRoutes);
  const wrongRole = !member && matchesRoute(pathname, memberOnlyRoutes);
  const enrolled = data.memberships.filter((membership) => membership.personId === person?.id)
    .map((membership) => data.clubs.find((club) => club.id === membership.clubId)?.name)
    .filter((name): name is string => !!name);
  return <View style={styles.shell}>
    <View style={styles.header}>
      <Text style={styles.brand}>{data.library.name} · Book club kits</Text>
      <Text style={styles.context}>Public writable demo · {person ? `${person.name} · ${person.role}${member ? ` · ${enrolled.length > 0 ? enrolled.join(', ') : 'no clubs enrolled'}` : ''}` : 'no user selected'} · Users, clubs, voting and schedules shared</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.navigation}>
        <NavigationLink href="/">Home</NavigationLink>
        {!member && <NavigationLink href="/catalog">Catalog & kits</NavigationLink>}
        {!member && <NavigationLink href="/clubs">Clubs</NavigationLink>}
        {!member && <NavigationLink href="/cycles">Cycles</NavigationLink>}
        {member && <NavigationLink href="/my-clubs">My clubs</NavigationLink>}
        <NavigationLink href="/preferences">Preferences</NavigationLink>
        <NavigationLink href="/schedule">Schedule</NavigationLink>
        {!member && <NavigationLink href="/circulation">Circulation</NavigationLink>}
        {!member && <NavigationLink href="/admin">Admin</NavigationLink>}
        <NavigationLink href="/user">User</NavigationLink>
      </ScrollView>
    </View>
    {blocked ? <Redirect href="/preferences" /> : wrongRole ? <Redirect href="/user" /> : <Slot />}
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
