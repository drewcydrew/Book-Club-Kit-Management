import React, { createContext, useContext, useMemo } from 'react';
import type { Data } from '../domain/model';
import { combineData } from './local-data';
import { useSelection } from './selection';
import { useShared } from './shared';

type Store = { data: Data; error: string | null };
const Context = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const shared = useShared();
  const { person } = useSelection();
  const data = useMemo(() => combineData({ version: 1, selectedPersonId: person?.id ?? '' }, shared.data), [person?.id, shared.data]);
  return <Context.Provider value={{ data, error: null }}>{children}</Context.Provider>;
}

export function useStore(): Store {
  const store = useContext(Context);
  if (!store) throw new Error('StoreProvider is missing.');
  return store;
}
