import { Link, Redirect, router, Slot, usePathname } from 'expo-router';
import type { Href } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { NavigationGuardProvider, useNavigationGuard } from '../components/navigation-guard';
import { SelectionProvider, useSelection } from '../state/selection';
import { SharedProvider, useSharedStatus } from '../state/shared';
import type { ViewScope } from '../state/api';
import { AuthProvider, useAuth } from '../state/auth';
import { LibraryServiceProvider, useLibraryService } from '../state/library-service';

const scopes: Record<string, ViewScope> = {
  '/': 'home', '/catalog': 'catalog', '/clubs': 'clubs', '/cycles': 'cycles',
  '/preferences': 'preferences', '/schedule': 'schedule', '/circulation': 'circulation', '/admin': 'admin',
};
const staffOnlyRoutes = ['/catalog', '/clubs', '/cycles', '/circulation', '/admin'];

function NavigationLink({ href, children, disabled }: { href: Href; children: string; disabled: boolean }) {
  const guard = useNavigationGuard();
  return <Link href={href} style={styles.link} onPress={(event) => {
    if (disabled || guard.intercept(() => router.navigate(href))) event.preventDefault();
  }}>{children}</Link>;
}

function SelectedShell() {
  const { person } = useSelection();
  const { service } = useLibraryService();
  const pathname = usePathname();
  const { saving } = useSharedStatus();
  const member = person?.role === 'member';
  if (!service && pathname !== '/' && pathname !== '/club-schedule') return <Redirect href="/" />;
  return <View style={styles.shell}>
    <View style={styles.header}>
      <Text style={styles.brand}>Book club kits</Text>
      <Text style={styles.context}>{service?.name ?? 'No library selected'} · Demo members are public · {person ? `${person.name} · ${person.role}` : 'no user selected'}</Text>
      {saving && <Text style={styles.context}>Saving changes; wait before changing pages or users.</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.navigation}>
        <NavigationLink disabled={saving} href="/">Home</NavigationLink>
        {person && <>
          {!member && <NavigationLink disabled={saving} href="/catalog">Catalog & kits</NavigationLink>}
          <NavigationLink disabled={saving} href="/preferences">Preferences</NavigationLink>
          <NavigationLink disabled={saving} href="/schedule">Schedule</NavigationLink>
          {!member && <NavigationLink disabled={saving} href="/clubs">Clubs</NavigationLink>}
          {!member && <NavigationLink disabled={saving} href="/cycles">Cycles</NavigationLink>}
          {!member && <NavigationLink disabled={saving} href="/circulation">Circulation</NavigationLink>}
          {!member && <NavigationLink disabled={saving} href="/admin">Admin</NavigationLink>}
        </>}
        {service && <NavigationLink disabled={saving} href="/club-schedule">Club schedule</NavigationLink>}
      </ScrollView>
    </View>
    <Slot />
  </View>;
}

function Shell() {
  const { person } = useSelection();
  const pathname = usePathname();
  const scope = person?.role === 'member' && staffOnlyRoutes.includes(pathname) ? 'preferences' : scopes[pathname] ?? 'home';
  return <SharedProvider key={`${person?.id ?? ''}:${person?.role ?? ''}`} personId={person?.id ?? ''} scope={scope}
    enabled={!(pathname === '/' && person && person.role !== 'member')}>
    <SelectedShell />
  </SharedProvider>;
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#f1f3eb' },
  header: { backgroundColor: '#183f37', paddingHorizontal: 20, paddingTop: 16, gap: 6 },
  brand: { color: '#fffefa', fontSize: 19, fontWeight: '700' },
  context: { color: '#e1efe8', lineHeight: 19 },
  navigation: { gap: 20, marginTop: 4, borderTopWidth: 1, borderTopColor: '#52786d' },
  link: { color: '#fffefa', paddingVertical: 14, fontWeight: '600' },
});

function AuthenticatedLayout() {
  const { user, loading } = useAuth();
  const library = useLibraryService();
  if (loading) return <View style={styles.shell}><Text>Restoring session...</Text></View>;
  if (library.loading) return <View style={styles.shell}><Text>Loading library services...</Text></View>;
  return <SelectionProvider key={`${user?.uid ?? 'guest'}:${library.service?.id ?? ''}`}><NavigationGuardProvider><Shell /></NavigationGuardProvider></SelectionProvider>;
}

export default function Layout() {
  return <AuthProvider><LibraryServiceProvider><AuthenticatedLayout /></LibraryServiceProvider></AuthProvider>;
}
