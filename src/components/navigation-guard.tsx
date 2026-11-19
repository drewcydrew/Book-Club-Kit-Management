import { usePreventRemove } from 'expo-router';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { Action, Actions, Label, Note } from './ui';

type Guard = (continueNavigation: () => void) => void;
type NavigationGuard = {
  register: (guard: Guard) => () => void;
  intercept: (continueNavigation: () => void) => boolean;
};

const Context = createContext<NavigationGuard | null>(null);

export function NavigationGuardProvider({ children }: { children: React.ReactNode }) {
  const guard = useRef<Guard | null>(null);
  const value = useMemo<NavigationGuard>(() => ({
    register: (next) => {
      guard.current = next;
      return () => { if (guard.current === next) guard.current = null; };
    },
    intercept: (continueNavigation) => {
      if (!guard.current) return false;
      guard.current(continueNavigation);
      return true;
    },
  }), []);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useNavigationGuard() {
  const context = useContext(Context);
  if (!context) throw new Error('NavigationGuardProvider is missing.');
  return context;
}

export function useDraftNavigationGuard(dirty: boolean, busy: boolean) {
  const guard = useNavigationGuard();
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [allowLeaving, setAllowLeaving] = useState(false);
  const [message, setMessage] = useState('');
  const disable = usePreventRemove(!allowLeaving && (dirty || busy), ({ repeat }) => {
    if (busy) { setMessage('Wait for the shared change to finish before leaving.'); return; }
    setPending(() => repeat);
  });
  useEffect(() => {
    if (!dirty && !busy) return;
    return guard.register((next) => {
      if (busy) { setMessage('Wait for the shared change to finish before leaving.'); return; }
      setPending(() => () => { disable(); next(); });
    });
  }, [busy, dirty, disable, guard]);
  return <>
    {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
    <Modal transparent visible={!!pending} onRequestClose={() => setPending(null)} accessibilityLabel="Discard unsaved changes">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 }}>
        <View style={{ backgroundColor: '#fffefa', padding: 20, gap: 12, maxWidth: 600, width: '100%', alignSelf: 'center' }}>
          <Label>Discard unsaved changes?</Label><Note>Your unsaved changes will be lost.</Note>
          <Actions><Action tone="danger" title="Discard and leave" onPress={() => { const next = pending; setAllowLeaving(true); setPending(null); next?.(); }} />
            <Action title="Keep editing" onPress={() => setPending(null)} /></Actions>
        </View>
      </View>
    </Modal>
  </>;
}
