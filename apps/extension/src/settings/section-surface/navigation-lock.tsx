import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type SettingsNavigationLockValue = {
  locked: boolean;
  setLocked: (locked: boolean) => void;
};

const SettingsNavigationLockContext = createContext<SettingsNavigationLockValue>({
  locked: false,
  setLocked: () => undefined,
});

export function SettingsNavigationLockProvider(props: { children: ReactNode }) {
  const [locked, setLocked] = useState(false);
  const value = useMemo(() => ({ locked, setLocked }), [locked]);
  return (
    <SettingsNavigationLockContext.Provider value={value}>
      {props.children}
    </SettingsNavigationLockContext.Provider>
  );
}

export function useSettingsNavigationLock(): SettingsNavigationLockValue {
  return useContext(SettingsNavigationLockContext);
}
