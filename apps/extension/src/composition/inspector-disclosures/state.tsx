import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createInspectorDisclosureStore } from '../persistence/inspector-disclosures/store';

type Store = ReturnType<typeof createInspectorDisclosureStore>;
const PreferenceContext = createContext<{ scope: string; store: Store } | null>(null);

/** One workspace cache survives selection changes; storage survives project/page changes. */
export function InspectorDisclosurePreferences(props: {
  scope: string;
  children: ReactNode;
  store?: Store;
}) {
  const [store] = useState(() => props.store ?? createInspectorDisclosureStore());
  return (
    <PreferenceContext.Provider value={{ scope: props.scope, store }}>
      {props.children}
    </PreferenceContext.Provider>
  );
}

/** Stable semantic IDs are required; translated labels and instance IDs are not keys. */
export function useInspectorDisclosure(id: string, initiallyOpen: boolean) {
  const context = useContext(PreferenceContext);
  const [local, setLocal] = useState(initiallyOpen);
  const key = JSON.stringify([context?.scope, id]);
  const store = context?.store;
  const stored = useSyncExternalStore(
    store?.subscribe ?? (() => () => {}),
    () => store?.read(key),
    () => undefined
  );
  useEffect(() => {
    if (store) void store.load(key);
  }, [store, key]);
  return [
    store ? (stored ?? initiallyOpen) : local,
    (open: boolean) => {
      if (store) void store.set(key, open);
      else setLocal(open);
    },
  ] as const;
}
