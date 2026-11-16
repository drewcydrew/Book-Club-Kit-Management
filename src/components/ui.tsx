import React, { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useStore } from '../state/store';
import { useShared } from '../state/shared';

export function Page({ title, children }: { title: string; children: React.ReactNode }) {
  const { data, error } = useStore();
  const shared = useShared();
  const { refresh } = shared;
  useFocusEffect(useCallback(() => { void refresh().catch(() => undefined); }, [refresh]));
  const missingSharedReferences =
    data.memberships.some((membership) => !data.people.some((person) => person.id === membership.personId) || !data.clubs.some((club) => club.id === membership.clubId)) ||
    data.cycles.some((cycle) => cycle.slots.some((slot) => !data.clubs.some((club) => club.id === slot.clubId))) ||
    data.assignments.some((assignment) => !data.clubs.some((club) => club.id === assignment.clubId) || !data.kits.some((kit) => kit.id === assignment.kitId)) ||
    data.ballots.some((ballot) => !data.clubs.some((club) => club.id === ballot.clubId) || ballot.ranking.some((id) => !data.titles.some((title) => title.id === id))) ||
    data.events.some((event) => !data.kits.some((kit) => kit.id === event.kitId));
  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <Text accessibilityRole="header" style={styles.heading}>{title}</Text>
    {error ? <Text style={styles.error}>Unable to save: {error}</Text> : null}
    {shared.error ? <><Text style={styles.error}>{shared.error}</Text>
      <Action title="Refresh shared data" disabled={shared.saving} onPress={() => { void refresh().catch(() => undefined); }} /></> : null}
    {missingSharedReferences ? <Text style={styles.error}>Some shared records reference unavailable users, clubs, titles or kits. Refresh or contact the demo administrator.</Text> : null}
    {children}
  </ScrollView>;
}

export function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Field({ label, value, onChangeText, placeholder, editable = true, multiline = false }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; editable?: boolean; multiline?: boolean }) {
  return <View style={{ gap: 5 }}><Label>{label}</Label><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} editable={editable} multiline={multiline} style={[styles.input, multiline && styles.multilineInput]} /></View>;
}

export function Action({ title, onPress, disabled = false, selected, tone = 'default' }: {
  title: string; onPress: () => void; disabled?: boolean; selected?: boolean; tone?: 'default' | 'primary' | 'danger';
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={selected === undefined ? undefined : `${title}, ${selected ? 'selected' : 'not selected'}`} accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, tone === 'primary' && styles.primaryButton, tone === 'danger' && styles.dangerButton, selected && styles.selectedButton, pressed && styles.pressed, disabled && styles.disabled]}>
    <Text style={[styles.buttonText, tone === 'primary' && styles.primaryButtonText, tone === 'danger' && styles.dangerButtonText, selected && styles.selectedButtonText]}>{title}</Text>
  </Pressable>;
}

export function Actions({ children }: { children: React.ReactNode }) {
  return <View style={styles.actions}>{children}</View>;
}

export function Note({ children }: { children: React.ReactNode }) {
  return <Text style={styles.note}>{children}</Text>;
}

export const styles = StyleSheet.create({
  page: { paddingHorizontal: 20, paddingTop: 24, gap: 18, width: '100%', maxWidth: 1050, alignSelf: 'center', paddingBottom: 60 },
  heading: { fontSize: 30, fontWeight: '700', color: '#183a36', letterSpacing: -0.5 },
  label: { fontWeight: '700', color: '#183a36', fontSize: 16 },
  card: { backgroundColor: '#fffefa', paddingHorizontal: 16, paddingVertical: 18, borderLeftWidth: 3, borderLeftColor: '#75958a', gap: 12 },
  input: { borderWidth: 1, borderColor: '#718b82', paddingHorizontal: 10, paddingVertical: 9, color: '#173832', backgroundColor: '#fff', minHeight: 44 },
  multilineInput: { minHeight: 96, textAlignVertical: 'top' },
  button: { backgroundColor: '#fffefa', borderWidth: 1, borderColor: '#65877b', paddingHorizontal: 14, paddingVertical: 10, minHeight: 44, maxWidth: '100%', justifyContent: 'center' },
  buttonText: { color: '#244c40', fontWeight: '600', textAlign: 'center' },
  primaryButton: { backgroundColor: '#245e51', borderColor: '#245e51' },
  primaryButtonText: { color: '#fff' },
  dangerButton: { borderColor: '#9b5147' },
  dangerButtonText: { color: '#862e27' },
  selectedButton: { backgroundColor: '#d6e5d8', borderColor: '#245e51', borderBottomWidth: 3 },
  selectedButtonText: { color: '#183a36' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.5 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  note: { color: '#465c56', lineHeight: 21 },
  error: { color: '#a22525', fontWeight: '600' },
});
