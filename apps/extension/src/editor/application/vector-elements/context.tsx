import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  createEditorVectorLibrary,
  createEditorVectorDownloads,
  createEditorVectorCache,
} from '../../../composition/persistence/vector-elements';
import { validateEditorVectorDefinition } from '../../objects/vector-elements/prepare';
import {
  createEditorVectorCatalogClient,
  requestEditorVectorCatalogPermission,
} from '../../vector-elements/catalog-client';
import { createEditorVectorLibrarySession, type EditorVectorLibrarySession } from './session';

const Context = createContext<EditorVectorLibrarySession | null>(null);

/** Each editor workspace receives its own catalog lifetime and explicit native adapters. */
export function EditorVectorLibraryProvider({
  children,
  session: provided,
}: {
  children: ReactNode;
  session?: EditorVectorLibrarySession;
}) {
  const [session] = useState(() => {
    if (provided) return provided;
    const library = createEditorVectorLibrary({
      validateDefinition: validateEditorVectorDefinition,
    });
    return createEditorVectorLibrarySession({
      library,
      downloads: createEditorVectorDownloads(library),
      cache: createEditorVectorCache(),
      catalog: createEditorVectorCatalogClient(),
      requestPermission: requestEditorVectorCatalogPermission,
    });
  });
  useEffect(
    () => () => {
      if (!provided) session.dispose();
    },
    [session, provided]
  );
  return <Context.Provider value={session}>{children}</Context.Provider>;
}
export function useOptionalEditorVectorLibrarySession() {
  return useContext(Context);
}
export function useEditorVectorLibrarySession() {
  const session = useContext(Context);
  if (!session) throw new Error('Vector library provider is missing.');
  return session;
}
export function useEditorVectorLibrarySnapshot() {
  const session = useEditorVectorLibrarySession();
  return useSyncExternalStore(session.subscribe, session.getSnapshot);
}
