import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useStore } from '../state/store';
import { useShared } from '../state/shared';

export function Page({ title, children }: { title: string; children: React.ReactNode }) {
  const { data, error } = useStore();
  const shared = useShared();
  const missingLocalReferences =
    data.people.some((person) => person.clubId && !data.clubs.some((club) => club.id === person.clubId)) ||
    data.cycles.some((cycle) => cycle.slots.some((slot) => !data.clubs.some((club) => club.id === slot.clubId))) ||
    data.assignments.some((assignment) => !data.clubs.some((club) => club.id === assignment.clubId) || !data.kits.some((kit) => kit.id === assignment.kitId)) ||
    data.ballots.some((ballot) => !data.clubs.some((club) => club.id === ballot.clubId) || ballot.ranking.some((id) => !data.titles.some((title) => title.id === id))) ||
    data.events.some((event) => !data.kits.some((kit) => kit.id === event.kitId));
  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <Text accessibilityRole="header" style={styles.heading}>{title}</Text>
    {error ? <Text style={styles.error}>Unable to save: {error}</Text> : null}
    {shared.error ? <Text style={styles.error}>{shared.error}</Text> : null}
    {missingLocalReferences ? <Text style={styles.error}>Some local demo records reference shared clubs, titles or kits that are no longer available. Affected actions may be unavailable.</Text> : null}
    {children}
  </ScrollView>;
}

export function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Field({ label, value, onChangeText, placeholder }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string }) {
  return <View style={{ gap: 5 }}><Label>{label}</Label><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} style={styles.input} /></View>;
}

export function Action({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={styles.buttonText}>{title}</Text></Pressable>;
}

export function Actions({ children }: { children: React.ReactNode }) {
  return <View style={styles.actions}>{children}</View>;
}

export function Note({ children }: { children: React.ReactNode }) {
  return <Text style={styles.note}>{children}</Text>;
}

export const styles = StyleSheet.create({
  page: { padding: 20, gap: 16, width: '100%', maxWidth: 1050, alignSelf: 'center', paddingBottom: 60 },
  heading: { fontSize: 28, fontWeight: '700', color: '#183a36' },
  label: { fontWeight: '700', color: '#183a36', fontSize: 15 },
  card: { backgroundColor: '#ffffff', padding: 16, borderRadius: 10, borderWidth: 1, borderColor: '#d9e3df', gap: 10 },
  input: { borderWidth: 1, borderColor: '#809c94', borderRadius: 6, padding: 10, color: '#173832', backgroundColor: '#fff', minHeight: 44 },
  button: { backgroundColor: '#245e51', paddingHorizontal: 14, paddingVertical: 11, borderRadius: 6, minHeight: 44, justifyContent: 'center' },
  buttonText: { color: '#fff', fontWeight: '600', textAlign: 'center' },
  disabled: { opacity: 0.45 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  note: { color: '#465c56', lineHeight: 21 },
  error: { color: '#a22525', fontWeight: '600' },
});
