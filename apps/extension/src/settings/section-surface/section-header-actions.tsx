import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type HeaderActionsContextValue = {
  setTarget(target: HTMLDivElement | null): void;
  target: HTMLDivElement | null;
};

const HeaderActionsContext = createContext<HeaderActionsContextValue>({
  setTarget: () => undefined,
  target: null,
});

export function SettingsSectionHeaderActionsProvider(props: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const value = useMemo(() => ({ setTarget, target }), [target]);
  return (
    <HeaderActionsContext.Provider value={value}>{props.children}</HeaderActionsContext.Provider>
  );
}

export function SettingsSectionHeaderActionSlot() {
  const { setTarget } = useContext(HeaderActionsContext);
  return <div ref={setTarget} className="flex min-h-8 shrink-0 items-center" />;
}

export function SettingsSectionHeaderActions(props: { children: ReactNode }) {
  const { target } = useContext(HeaderActionsContext);
  return target ? createPortal(props.children, target) : null;
}
