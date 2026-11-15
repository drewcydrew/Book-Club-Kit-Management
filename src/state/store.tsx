import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Button, Text, View } from 'react-native';
import type { Data } from '../domain/model';
import { seed } from '../domain/seed';

const KEY = 'book-club-demo-v1';
type Store = { data: Data; update: (fn: (value: Data) => Data) => Promise<void>; reset: () => Promise<void>; error: string | null };
const Context = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const current = useRef<Data | null>(null);
  const pending = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => {
      if (!raw) { const initial = seed(); current.current = initial; setData(initial); return; }
      const value: unknown = JSON.parse(raw);
      if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1) throw new Error('Unsupported or invalid saved data.');
      current.current = value as Data;
      setData(value as Data);
    }).catch((e: unknown) => { setError(e instanceof Error ? e.message : 'Unable to load saved data.'); setFailed(true); });
  }, []);
  const update = useCallback((fn: (value: Data) => Data) => {
    const operation = pending.current.then(async () => {
      if (!current.current) throw new Error('Data is not loaded.');
      const next = fn(current.current);
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
      current.current = next;
      setData(next);
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
      const next = seed();
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
      current.current = next;
      setData(next);
      setFailed(false);
      setError(null);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Unable to reset data.'); }
  }, []);
  if (!data) return <View style={{ padding: 30, gap: 12 }}>{failed ? <><Text>Could not load local data: {error}</Text><Text>Resetting will permanently replace it.</Text><Button title="Reset demo data" onPress={() => { void reset(); }} /></> : <ActivityIndicator />}</View>;
  return <Context.Provider value={{ data, update, reset, error }}>{children}</Context.Provider>;
}

export function useStore(): Store {
  const store = useContext(Context);
  if (!store) throw new Error('StoreProvider is missing.');
  return store;
}
