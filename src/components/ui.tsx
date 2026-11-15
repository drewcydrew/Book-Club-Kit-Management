import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useStore } from '../state/store';

export function Page({ title, children }: { title: string; children: React.ReactNode }) {
  const { error } = useStore();
  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <Text accessibilityRole="header" style={styles.heading}>{title}</Text>
    {error ? <Text style={styles.error}>Unable to save: {error}</Text> : null}
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
