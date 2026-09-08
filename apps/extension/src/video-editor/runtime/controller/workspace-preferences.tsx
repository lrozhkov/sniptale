import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type SetStateAction,
} from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  DEFAULT_WORKSPACE_PREFERENCES,
  loadWorkspacePreferences,
  saveWorkspacePreferences,
  type WorkspacePreferences,
} from '../../persistence/workspace-preferences';

const logger = createLogger({ namespace: 'VideoEditorWorkspacePreferences' });
type Update = <K extends keyof WorkspacePreferences>(
  key: K,
  next: SetStateAction<WorkspacePreferences[K]>
) => void;
const WorkspacePreferencesContext = createContext<{
  preferences: WorkspacePreferences;
  update: Update;
} | null>(null);

/** One page owner. Writes are coalesced and ordered; edits win over late hydration. Storage failure is advisory and never blocks editing. */
export function WorkspacePreferencesProvider({ children }: PropsWithChildren) {
  const [preferences, setPreferences] = useState(DEFAULT_WORKSPACE_PREFERENCES);
  const current = useRef(preferences);
  const edited = useRef<Partial<WorkspacePreferences>>({});
  const hydrated = useRef(false);
  const saving = useRef(false);
  const pending = useRef(false);
  const flush = useCallback(async () => {
    if (!hydrated.current || saving.current) return;
    saving.current = true;
    try {
      while (pending.current) {
        pending.current = false;
        await saveWorkspacePreferences(current.current);
      }
    } catch (error: unknown) {
      logger.debug('Workspace layout could not be saved', error);
    } finally {
      saving.current = false;
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    void loadWorkspacePreferences()
      .catch((error: unknown) => {
        logger.debug('Workspace layout could not be restored', error);
        return DEFAULT_WORKSPACE_PREFERENCES;
      })
      .then((stored) => {
        if (cancelled) return;
        current.current = { ...stored, ...edited.current };
        setPreferences(current.current);
        hydrated.current = true;
        void flush();
      });
    return () => {
      cancelled = true;
    };
  }, [flush]);
  const update: Update = useCallback(
    (key, next) => {
      const value = typeof next === 'function' ? next(current.current[key]) : next;
      if (Object.is(value, current.current[key])) return;
      edited.current = { ...edited.current, [key]: value };
      current.current = { ...current.current, [key]: value };
      setPreferences(current.current);
      pending.current = true;
      void flush();
    },
    [flush]
  );
  return (
    <WorkspacePreferencesContext.Provider value={{ preferences, update }}>
      {children}
    </WorkspacePreferencesContext.Provider>
  );
}

/** Isolated surfaces use disposable defaults; the editor shell supplies the persistent owner. */
export function useWorkspacePreference<K extends keyof WorkspacePreferences>(key: K) {
  const owner = useContext(WorkspacePreferencesContext);
  const [local, setLocal] = useState(DEFAULT_WORKSPACE_PREFERENCES[key]);
  const update = owner?.update;
  const setValue = useCallback(
    (next: SetStateAction<WorkspacePreferences[K]>) => {
      if (update) update(key, next);
      else setLocal(next);
    },
    [key, update]
  );
  return [owner ? owner.preferences[key] : local, setValue] as const;
}
