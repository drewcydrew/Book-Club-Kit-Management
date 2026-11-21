import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Person } from '../domain/model';
import { clearCoverCache } from '../components/title-cover';
import { loadSession, loadUsers } from './api';
import { useAuth } from './auth';

type Selection = {
  people: Person[];
  person: Person | undefined;
  loading: boolean;
  error: string | null;
  refreshUsers: () => Promise<void>;
  select: (id: string) => void;
  reconcilePerson: (person: Person) => void;
};

const Context = createContext<Selection | null>(null);

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshUsers = useCallback(() => (async () => {
    const admin = user ? await loadSession() : null;
    const users = await loadUsers();
    return { users, admin };
  })().then(
    ({ users, admin }) => {
      setPeople(users);
      setSelectedId((id) => admin ? admin.id : users.some((person) => person.id === id && person.role === 'member') ? id : '');
      setError(null);
    },
    (reason: unknown) => {
      const message = reason instanceof Error ? reason.message : 'Unable to load users.';
      setError(message);
      throw new Error(message);
    },
  ).finally(() => setLoading(false)), [user]);
  const reconcilePerson = useCallback((next: Person) => setPeople((current) => {
    const old = current.find((person) => person.id === next.id);
    if (!old || (old.revision === next.revision && old.name === next.name && old.role === next.role)) return current;
    return current.map((person) => person.id === next.id ? next : person);
  }), []);
  const select = useCallback((id: string) => {
    if (!user && (!id || people.some((person) => person.id === id && person.role === 'member'))) setSelectedId(id);
  }, [people, user]);
  useEffect(() => { clearCoverCache(); }, [selectedId]);
  useEffect(() => { void refreshUsers().catch(() => undefined); }, [refreshUsers]);
  return <Context.Provider value={{
    people, person: people.find((person) => person.id === selectedId), loading, error, refreshUsers,
    select, reconcilePerson,
  }}>{children}</Context.Provider>;
}

export function useSelection(): Selection {
  const value = useContext(Context);
  if (!value) throw new Error('SelectionProvider is missing.');
  return value;
}
