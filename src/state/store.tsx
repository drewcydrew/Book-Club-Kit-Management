import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Button, Text, View } from 'react-native';
import type { Data } from '../domain/model';
import { combineData, initialLocalData, localFromData } from './local-data';
import type { LocalData } from './local-data';
import { useShared } from './shared';

const KEY = 'book-club-local-v2';
type Store = { data: Data; update: (fn: (value: Data) => Data) => Promise<void>; reset: () => Promise<void>; error: string | null };
const Context = createContext<Store | null>(null);

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
    AsyncStorage.getItem(KEY).then((raw) => {
      if (!raw) { const initial = initialLocalData(); current.current = initial; setLocal(initial); return; }
      const value: unknown = JSON.parse(raw);
      if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1) throw new Error('Unsupported or invalid saved data.');
      current.current = value as LocalData;
      setLocal(value as LocalData);
    }).catch((e: unknown) => { setError(e instanceof Error ? e.message : 'Unable to load saved data.'); setFailed(true); });
  }, []);
  const update = useCallback((fn: (value: Data) => Data) => {
    const operation = pending.current.then(async () => {
      if (!current.current) throw new Error('Data is not loaded.');
      const next = localFromData(fn(combineData(current.current, sharedCurrent.current)), current.current);
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
      current.current = next;
      setLocal(next);
      setError(null);
    }).catch((e: unknown) => {
      const message = e instanceof Error ? e.message : 'Unable to save changes.';
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
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Unable to reset data.'); }
  }, []);
  if (!local) return <View style={{ padding: 30, gap: 12 }}>{failed ? <><Text>Could not load local data: {error}</Text><Text>Resetting will permanently replace it.</Text><Button title="Reset demo data" onPress={() => { void reset(); }} /></> : <ActivityIndicator />}</View>;
  return <Context.Provider value={{ data: combineData(local, shared.data), update, reset, error }}>{children}</Context.Provider>;
}

export function useStore(): Store {
  const store = useContext(Context);
  if (!store) throw new Error('StoreProvider is missing.');
  return store;
}
