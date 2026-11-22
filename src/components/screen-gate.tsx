import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useSelection } from '../state/selection';
import { SharedGate } from '../state/shared';
import { StoreProvider } from '../state/store';

export function ScreenGate({ children, staffOnly = false }: { children: React.ReactNode; staffOnly?: boolean }) {
  const { person, loading } = useSelection();
  if (!person && loading) return <View style={{ padding: 30 }}><ActivityIndicator /></View>;
  if (!person) return <Redirect href="/" />;
  if (staffOnly && person.role === 'member') return <Redirect href="/preferences" />;
  return <SharedGate><StoreProvider>{children}</StoreProvider></SharedGate>;
}
