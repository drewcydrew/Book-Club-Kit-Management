import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Button, Text, View } from 'react-native';
import { ApiError, loadView } from './api';
import type { SharedData, ViewScope } from './api';
import { useSelection } from './selection';

type SharedState = {
  data: SharedData;
  scope: ViewScope;
  error: string | null;
  saving: boolean;
  refresh: () => Promise<SharedData>;
  mutate: <T>(operation: () => Promise<T>) => Promise<T>;
  invalidateOtherScopes: () => void;
  setBackgroundSaving: (saving: boolean) => void;
};
type GateState = {
  data: SharedData | null;
  scope: ViewScope;
  error: string | null;
  saving: boolean;
  refresh: () => Promise<SharedData>;
  mutate: <T>(operation: () => Promise<T>) => Promise<T>;
  invalidateOtherScopes: () => void;
  setBackgroundSaving: (saving: boolean) => void;
};
const Context = createContext<GateState | null>(null);

export function SharedProvider({ children, personId, scope, enabled = true }: { children: React.ReactNode; personId: string; scope: ViewScope; enabled?: boolean }) {
  const { people, person, refreshUsers, reconcilePerson } = useSelection();
  const expectedRole = person?.role;
  const [cache, setCache] = useState<Partial<Record<ViewScope, SharedData>>>({});
  const cached = useRef<Partial<Record<ViewScope, SharedData>>>({});
  const [errors, setErrors] = useState<Partial<Record<ViewScope, string>>>({});
  const [savingState, setSavingState] = useState(false);
  const [backgroundSaving, setBackgroundSaving] = useState(false);
  const saving = useRef(false);
  const stale = useRef(new Set<ViewScope>());
  const sequence = useRef(0);
  const active = useRef(true);
  const requests = useRef(new Map<ViewScope, { controller: AbortController; promise: Promise<SharedData> }>());
  const scopeRef = useRef(scope);
  useLayoutEffect(() => { scopeRef.current = scope; }, [scope]);

  const load = useCallback((target: ViewScope, force = false): Promise<SharedData> => {
    if (!force && cached.current[target]) return Promise.resolve(cached.current[target]!);
    const existing = requests.current.get(target);
    if (existing && !force) return existing.promise;
    if (existing) existing.controller.abort();
    const controller = new AbortController();
    const generation = sequence.current;
    const promise = loadView(personId, target, controller.signal).then((value) => {
      if (!active.current || generation !== sequence.current) throw new Error('The data request is no longer current.');
      if (expectedRole && value.people[0].role !== expectedRole) {
        throw new ApiError('This user’s role changed. Return Home and refresh the user list.', 409);
      }
      reconcilePerson(value.people[0]);
      cached.current = { ...cached.current, [target]: value };
      setCache(cached.current);
      setErrors((current) => { const next = { ...current }; delete next[target]; return next; });
      stale.current.delete(target);
      return value;
    }).catch((reason: unknown) => {
      const message = reason instanceof Error ? reason.message : 'Unable to load shared data.';
      if (active.current && generation === sequence.current && !controller.signal.aborted) {
        setErrors((current) => ({ ...current, [target]: message }));
        stale.current.add(target);
        if (reason instanceof ApiError && (reason.status === 404 || reason.status === 409) && scopeRef.current === 'home') {
          void refreshUsers().catch(() => undefined);
        }
      }
      throw new Error(message);
    }).finally(() => {
      if (requests.current.get(target)?.controller === controller) requests.current.delete(target);
    });
    requests.current.set(target, { controller, promise });
    return promise;
  }, [personId, expectedRole, reconcilePerson, refreshUsers]);

  useEffect(() => {
    active.current = true;
    const pending = requests.current;
    return () => {
      active.current = false;
      sequence.current += 1;
      pending.forEach((request) => request.controller.abort());
      pending.clear();
      cached.current = {};
    };
  }, []);
  useEffect(() => { if (personId && enabled) void load(scope).catch(() => undefined); }, [enabled, load, personId, scope]);

  const invalidateOtherScopes = useCallback(() => {
    sequence.current += 1;
    requests.current.forEach((request) => request.controller.abort());
    requests.current.clear();
    const currentScope = scopeRef.current;
    const previous = cached.current[currentScope];
    cached.current = previous ? { [currentScope]: previous } : {};
    stale.current = new Set(stale.current.has(currentScope) ? [currentScope] : []);
    setErrors((current) => current[currentScope] ? { [currentScope]: current[currentScope] } : {});
    if (active.current) setCache(cached.current);
  }, []);

  const refresh = useCallback(async () => {
    if (saving.current) throw new Error('Wait for the shared change to finish before refreshing.');
    invalidateOtherScopes();
    return load(scopeRef.current, true);
  }, [invalidateOtherScopes, load]);
  const mutate = useCallback(async <T,>(operation: () => Promise<T>): Promise<T> => {
    if (saving.current) throw new Error('A shared change is already in progress.');
    if (stale.current.has(scopeRef.current)) throw new Error('Shared data may be out of date. Refresh before making changes.');
    saving.current = true;
    setSavingState(true);
    try {
      let result: T;
      try { result = await operation(); }
      catch (reason: unknown) {
        const detail = reason instanceof Error ? reason.message : 'Unable to save shared data.';
        const needsRefresh = !(reason instanceof ApiError) || reason.status !== 400;
        if (needsRefresh) { stale.current.add(scopeRef.current); invalidateOtherScopes(); }
        const message = needsRefresh ? `${detail} Refresh before retrying.` : detail;
        if (active.current) setErrors((current) => ({ ...current, [scopeRef.current]: message }));
        throw new Error(message);
      }
      invalidateOtherScopes();
      try {
        if (scopeRef.current === 'admin' || scopeRef.current === 'clubs') await refreshUsers();
        if (!active.current) return result;
        await load(scopeRef.current, true);
      } catch {
        const message = 'The change was saved, but refreshing failed. Refresh before making another change.';
        if (active.current) { stale.current.add(scopeRef.current); setErrors((current) => ({ ...current, [scopeRef.current]: message })); }
        throw new Error(message);
      }
      return result;
    } finally {
      saving.current = false;
      if (active.current) setSavingState(false);
    }
  }, [invalidateOtherScopes, load, refreshUsers]);
  const value = cache[scope];
  const data = value ? { ...value, people } : null;
  return <Context.Provider value={{ data, scope, error: errors[scope] ?? null, saving: savingState || backgroundSaving, refresh, mutate, invalidateOtherScopes, setBackgroundSaving }}>{children}</Context.Provider>;
}

export function useSharedStatus() {
  const context = useContext(Context);
  if (!context) throw new Error('SharedProvider is missing.');
  return { saving: context.saving };
}

export function SharedGate({ children }: { children: React.ReactNode }) {
  const shared = useContext(Context);
  if (!shared) throw new Error('SharedProvider is missing.');
  if (!shared.data) return <View style={{ padding: 30, gap: 12 }}>
    {shared.error ? <><Text>Unable to load this page: {shared.error}</Text><Button title="Retry" onPress={() => { void shared.refresh().catch(() => undefined); }} /></> : <ActivityIndicator />}
  </View>;
  return <>{children}</>;
}

export function useShared(): SharedState {
  const context = useContext(Context);
  if (!context?.data) throw new Error('Shared data is not loaded.');
  return { ...context, data: context.data };
}
