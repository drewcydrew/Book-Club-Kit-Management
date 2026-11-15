import React, { createContext, useContext, useMemo, useRef } from 'react';

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
