import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGlobalSearchParams, usePathname } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ApiError, createGuidedLibraryService, createLibraryService, deleteLibraryService, findLibrarySetup, loadLibraryServices, setApiLibraryService, type LibraryService, type LibrarySetup, type ServiceDeletionPreview } from './api';
import { useAuth } from './auth';

const storageKey = 'selected-library-service';
type LibraryContext = {
  services: LibraryService[];
  service: LibraryService | undefined;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  select: (id: string) => Promise<void>;
  create: (name: string, branch: string) => Promise<void>;
  setup: (value: LibrarySetup) => Promise<void>;
  pendingSetup: () => Promise<string | null>;
  recoverSetup: (requestId: string) => Promise<void>;
  discardPendingSetup: () => Promise<void>;
  remove: (preview: ServiceDeletionPreview) => Promise<void>;
  setupNotice: string | null;
};
const Context = createContext<LibraryContext | null>(null);

export function LibraryServiceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const { serviceId: linkedServiceParam } = useGlobalSearchParams<{ serviceId?: string | string[] }>();
  // Read once at startup: a shared preferences link selects its library before the app loads.
  const linkedServiceId = useRef(pathname === '/preferences' && typeof linkedServiceParam === 'string' ? linkedServiceParam : '');
  const [services, setServices] = useState<LibraryService[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const selectedRef = useRef('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupNotice, setSetupNotice] = useState<string | null>(null);
  const select = useCallback(async (id: string) => {
    if (id && !services.some((service) => service.id === id)) throw new Error('Library service is not available.');
    await AsyncStorage.setItem(storageKey, id);
    setApiLibraryService(id);
    selectedRef.current = id;
    setSelectedId(id);
    setError(null);
  }, [services]);
  const refresh = useCallback(async () => {
    try {
      const next = await loadLibraryServices();
      setServices(next);
      if (selectedRef.current && !next.some((service) => service.id === selectedRef.current)) {
        await AsyncStorage.removeItem(storageKey);
        selectedRef.current = '';
        setApiLibraryService('');
        setSelectedId('');
      }
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
      const linked = linkedServiceId.current;
      const id = linked && next.some((service) => service.id === linked) ? linked
        : stored && next.some((service) => service.id === stored) ? stored : '';
      setServices(next);
      setApiLibraryService(id);
      selectedRef.current = id;
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
    selectedRef.current = created.id;
    setSelectedId(created.id);
    setError(null);
    try { await AsyncStorage.setItem(storageKey, created.id); }
    catch { setError('The service was created, but the selection could not be saved on this device.'); }
  }, []);
  const pendingKey = user ? `pending-library-setup:${user.uid}` : null;
  const finishSetup = useCallback(async (created: LibraryService) => {
    setServices((current) => current.some((item) => item.id === created.id) ? current : [...current, created]);
    setSetupNotice(`Created ${created.name}. Add more titles and kits in Catalog, or create clubs and demo members before voting.`);
    setApiLibraryService(created.id);
    selectedRef.current = created.id;
    setSelectedId(created.id);
    setError(null);
    try {
      await AsyncStorage.setItem(storageKey, created.id);
      if (pendingKey) await AsyncStorage.removeItem(pendingKey);
    } catch {
      setError('The service was created, but its selection or setup receipt could not be saved on this device.');
    }
  }, [pendingKey]);
  const pendingSetup = useCallback(async () => pendingKey ? AsyncStorage.getItem(pendingKey) : null, [pendingKey]);
  const setup = useCallback(async (value: LibrarySetup) => {
    if (!pendingKey) throw new Error('Sign in before creating a library service.');
    const pending = await AsyncStorage.getItem(pendingKey);
    if (pending && pending !== value.requestId) throw new Error('Check the previous setup result before starting another.');
    await AsyncStorage.setItem(pendingKey, value.requestId);
    try {
      await finishSetup(await createGuidedLibraryService(value));
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 400) await AsyncStorage.removeItem(pendingKey);
      throw reason;
    }
  }, [finishSetup, pendingKey]);
  const recoverSetup = useCallback(async (requestId: string) => {
    await finishSetup(await findLibrarySetup(requestId));
  }, [finishSetup]);
  const discardPendingSetup = useCallback(async () => {
    if (pendingKey) await AsyncStorage.removeItem(pendingKey);
  }, [pendingKey]);
  const remove = useCallback(async (preview: ServiceDeletionPreview) => {
    await deleteLibraryService(preview);
    setServices((current) => current.filter((service) => service.id !== preview.service.id));
    if (selectedRef.current === preview.service.id) {
      setApiLibraryService('');
      selectedRef.current = '';
      setSelectedId('');
      try { await AsyncStorage.removeItem(storageKey); }
      catch { setError('The service was deleted, but its saved selection could not be cleared on this device.'); }
    }
    setSetupNotice(null);
  }, []);
  return <Context.Provider value={{
    services, service: services.find((service) => service.id === selectedId), loading, error, refresh, select, create,
    setup, pendingSetup, recoverSetup, discardPendingSetup, remove, setupNotice,
  }}>{children}</Context.Provider>;
}

export function useLibraryService(): LibraryContext {
  const value = useContext(Context);
  if (!value) throw new Error('LibraryServiceProvider is missing.');
  return value;
}
