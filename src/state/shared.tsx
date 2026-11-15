import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Button, Text, View } from 'react-native';
import { ApiError, loadShared } from './api';
import type { SharedData } from './api';

type SharedState = {
  data: SharedData;
  error: string | null;
  saving: boolean;
  refresh: () => Promise<void>;
  mutate: <T>(operation: () => Promise<T>) => Promise<T>;
};
const Context = createContext<SharedState | null>(null);

export function SharedProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<SharedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingState, setSavingState] = useState(false);
  const sequence = useRef(0);
  const stale = useRef(false);
  const saving = useRef(false);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const next = await loadShared();
      if (request === sequence.current) { stale.current = false; setData(next); setError(null); }
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : 'Unable to load shared data.';
      if (request === sequence.current) { stale.current = true; setError(message); }
      throw new Error(message);
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, []);
  const refresh = useCallback(async () => {
    if (saving.current) throw new Error('Wait for the shared change to finish before refreshing.');
    await load();
  }, [load]);
  const mutate = useCallback(async <T,>(operation: () => Promise<T>): Promise<T> => {
    if (saving.current) {
      const message = 'A shared change is already in progress.';
      setError(message);
      throw new Error(message);
    }
    if (stale.current) {
      const message = 'Shared data may be out of date. Refresh before making changes.';
      setError(message);
      throw new Error(message);
    }
    saving.current = true;
    setSavingState(true);
    try {
      ++sequence.current;
      let result: T;
      try { result = await operation(); }
      catch (reason: unknown) {
        const detail = reason instanceof Error ? reason.message : 'Unable to save shared data.';
        const needsRefresh = !(reason instanceof ApiError) || reason.status !== 400;
        if (needsRefresh) stale.current = true;
        const message = needsRefresh ? `${detail} Refresh before retrying.` : detail;
        setError(message);
        throw new Error(message);
      }
      try { await load(); }
      catch { const message = 'The change was saved, but refreshing failed. Refresh before making another change.'; setError(message); throw new Error(message); }
      return result;
    } finally {
      saving.current = false;
      setSavingState(false);
    }
  }, [load]);
  useEffect(() => { void refresh().catch(() => undefined); }, [refresh]);
  if (!data) return <View style={{ padding: 30, gap: 12 }}>
    {loading ? <ActivityIndicator /> : <><Text>Unable to load shared data: {error}</Text><Button title="Retry" onPress={() => { setLoading(true); void refresh().catch(() => undefined); }} /></>}
  </View>;
  return <Context.Provider value={{ data, error, saving: savingState, refresh, mutate }}>{children}</Context.Provider>;
}

export function useShared(): SharedState {
  const context = useContext(Context);
  if (!context) throw new Error('SharedProvider is missing.');
  return context;
}
