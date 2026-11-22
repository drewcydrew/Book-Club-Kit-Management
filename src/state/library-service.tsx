import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createLibraryService, loadLibraryServices, setApiLibraryService, type LibraryService } from './api';

const storageKey = 'selected-library-service';
type LibraryContext = {
  services: LibraryService[];
  service: LibraryService | undefined;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  select: (id: string) => Promise<void>;
  create: (name: string, branch: string) => Promise<void>;
};
const Context = createContext<LibraryContext | null>(null);

export function LibraryServiceProvider({ children }: { children: React.ReactNode }) {
  const [services, setServices] = useState<LibraryService[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const select = useCallback(async (id: string) => {
    if (id && !services.some((service) => service.id === id)) throw new Error('Library service is not available.');
    await AsyncStorage.setItem(storageKey, id);
    setApiLibraryService(id);
    setSelectedId(id);
    setError(null);
  }, [services]);
  const refresh = useCallback(async () => {
    try {
      const next = await loadLibraryServices();
      setServices(next);
      setError(null);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Unable to load library services.';
      setError(message);
      throw new Error(message);
    }
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.all([loadLibraryServices(), AsyncStorage.getItem(storageKey)]).then(([next, stored]) => {
      if (!active) return;
      const id = stored && next.some((service) => service.id === stored) ? stored : '';
      setServices(next);
      setApiLibraryService(id);
      setSelectedId(id);
      setError(null);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Unable to load library services.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; setApiLibraryService(''); };
  }, []);
  const create = useCallback(async (name: string, branch: string) => {
    const created = await createLibraryService(name, branch);
    setServices((current) => [...current, created]);
    setApiLibraryService(created.id);
    setSelectedId(created.id);
    setError(null);
    try { await AsyncStorage.setItem(storageKey, created.id); }
    catch { setError('The service was created, but the selection could not be saved on this device.'); }
  }, []);
  return <Context.Provider value={{
    services, service: services.find((service) => service.id === selectedId), loading, error, refresh, select, create,
  }}>{children}</Context.Provider>;
}

export function useLibraryService(): LibraryContext {
  const value = useContext(Context);
  if (!value) throw new Error('LibraryServiceProvider is missing.');
  return value;
}
