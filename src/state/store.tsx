import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Button, Text, View } from 'react-native';
import type { Data } from '../domain/model';
import { combineData, initialLocalData } from './local-data';
import type { LocalData } from './local-data';
import { useShared } from './shared';

const KEY = 'book-club-local-v3';
type Store = { data: Data; update: (fn: (value: Data) => Data) => Promise<void>; reset: () => Promise<void>; error: string | null };
const Context = createContext<Store | null>(null);

function readLocal(raw: string | null): LocalData {
  if (!raw) return initialLocalData();
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || !('version' in parsed) || parsed.version !== 1) {
    throw new Error('Unsupported or invalid saved selections.');
  }
  const value = parsed as { selectedPersonId?: unknown; selectedClubId?: unknown };
  return {
    version: 1,
    selectedPersonId: typeof value.selectedPersonId === 'string' ? value.selectedPersonId : '',
    selectedClubId: typeof value.selectedClubId === 'string' ? value.selectedClubId : '',
  };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const shared = useShared();
  const [local, setLocal] = useState<LocalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const current = useRef<LocalData | null>(null);
  const sharedCurrent = useRef(shared.data);
  useEffect(() => { sharedCurrent.current = shared.data; }, [shared.data]);
  const pending = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    AsyncStorage.getItem(KEY).then(readLocal).then((value) => {
      current.current = value;
      setLocal(value);
    }).catch((e: unknown) => { setError(e instanceof Error ? e.message : 'Unable to load saved selections.'); setFailed(true); });
  }, []);
  const update = useCallback((fn: (value: Data) => Data) => {
    const operation = pending.current.then(async () => {
      if (!current.current) throw new Error('Selections are not loaded.');
      const currentData = combineData(current.current, sharedCurrent.current);
      const nextData = fn(currentData);
      const next: LocalData = {
        version: 1,
        selectedPersonId: nextData.selectedPersonId,
        selectedClubId: nextData.selectedClubId,
      };
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
      current.current = next;
      setLocal(next);
      setError(null);
    }).catch((e: unknown) => {
      const message = e instanceof Error ? e.message : 'Unable to save selections.';
      setError(message);
      throw new Error(message);
    });
    pending.current = operation.catch(() => undefined);
    return operation;
  }, []);
  const reset = useCallback(async () => {
    try {
      const next = initialLocalData();
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
      current.current = next;
      setLocal(next);
      setFailed(false);
      setError(null);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Unable to reset selections.'); }
  }, []);
  if (!local) return <View style={{ padding: 30, gap: 12 }}>{failed ? <><Text>Could not load local selections: {error}</Text><Text>Resetting replaces only the selected user and club.</Text><Button title="Reset selections" onPress={() => { void reset(); }} /></> : <ActivityIndicator />}</View>;
  return <Context.Provider value={{ data: combineData(local, shared.data), update, reset, error }}>{children}</Context.Provider>;
}

export function useStore(): Store {
  const store = useContext(Context);
  if (!store) throw new Error('StoreProvider is missing.');
  return store;
}
