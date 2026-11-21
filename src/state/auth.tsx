import {
  onIdTokenChanged, signInWithEmailAndPassword, signOut, type User,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { setApiAuthentication } from './api';
import { createAuth } from './firebase-client';

type AuthState = {
  user: User | null;
  loading: boolean;
  error: string | null;
  available: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Context = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [setup] = useState(() => {
    try { return { auth: createAuth(), error: null }; }
    catch (error) { return { auth: null, error: error instanceof Error ? error.message : 'Firebase sign-in is unavailable.' }; }
  });
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!setup.auth);
  const [error, setError] = useState<string | null>(setup.error);
  const [observerFailed, setObserverFailed] = useState(false);

  useEffect(() => {
    const auth = setup.auth;
    if (!auth) return;
    setApiAuthentication(
      async () => {
        const current = auth.currentUser;
        if (!current) return null;
        try { return await current.getIdToken(); }
        catch (reason) {
          if (reason instanceof FirebaseError && ['auth/user-token-expired', 'auth/user-disabled', 'auth/invalid-user-token', 'auth/user-not-found'].includes(reason.code) && auth.currentUser === current) {
            await signOut(auth);
            setError('Your session expired. Sign in again.');
          }
          throw reason;
        }
      },
      (token) => {
        const current = auth.currentUser;
        if (!current) return;
        void current.getIdToken().then((activeToken) => {
          if (auth.currentUser === current && activeToken === token) return signOut(auth).then(() => setError('Your session expired. Sign in again.'));
        }, async () => {
          if (auth.currentUser === current) {
            await signOut(auth);
            setError('Your session expired. Sign in again.');
          }
        }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to sign out.'));
      },
    );
    const unsubscribe = onIdTokenChanged(auth, (next) => {
      setUser(next);
      setLoading(false);
    }, (reason) => {
      setError(reason.message);
      setUser(null);
      setLoading(false);
      setObserverFailed(true);
      setApiAuthentication(null, null);
      void signOut(auth).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : 'Unable to sign out.'));
    });
    return () => { unsubscribe(); setApiAuthentication(null, null); };
  }, [setup.auth]);

  const value = useMemo<AuthState>(() => ({
    user, loading, error, available: !!setup.auth && !observerFailed,
    signIn: async (email, password) => {
      if (!setup.auth) throw new Error(setup.error || 'Firebase sign-in is unavailable.');
      setError(null);
      await signInWithEmailAndPassword(setup.auth, email.trim(), password);
    },
    signOut: async () => {
      if (!setup.auth) throw new Error('Firebase sign-in is unavailable.');
      await signOut(setup.auth);
      setError(null);
    },
  }), [user, loading, error, observerFailed, setup]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(Context);
  if (!value) throw new Error('AuthProvider is missing.');
  return value;
}
