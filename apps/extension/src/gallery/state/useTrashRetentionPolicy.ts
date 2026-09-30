import { useCallback, useEffect, useRef, useState } from 'react';
import type { LocalStoragePolicy } from '../../contracts/settings';
import {
  loadSettings,
  patchLocalStoragePolicy,
  StaleLocalStoragePolicyError,
  subscribeToSettingsChanges,
} from '../../composition/persistence/settings';

type RetentionState = {
  status: 'loading' | 'ready' | 'unavailable';
  policy: LocalStoragePolicy | null;
  saving: boolean;
  feedback: 'saved' | 'error' | null;
};

const initialState: RetentionState = {
  status: 'loading',
  policy: null,
  saving: false,
  feedback: null,
};

/** Disposable Gallery view of the shared settings authority. */
export function useTrashRetentionPolicy() {
  const [state, setState] = useState<RetentionState>(initialState);
  const stateRef = useRef(state);
  const revision = useRef(0);
  const request = useRef(0);
  const active = useRef(false);
  const pending = useRef<{ patch: Partial<LocalStoragePolicy>; revision: number } | null>(null);
  const saving = useRef(false);

  const publish = useCallback((next: RetentionState) => {
    stateRef.current = next;
    if (active.current) setState(next);
  }, []);

  const reload = useCallback(async () => {
    const ticket = ++request.current;
    const observed = revision.current;
    publish({ ...stateRef.current, status: 'loading', feedback: null });
    try {
      const settings = await loadSettings();
      if (!active.current || ticket !== request.current || observed !== revision.current) return;
      publish({
        status: 'ready',
        policy: settings.localStoragePolicy,
        saving: false,
        feedback: null,
      });
    } catch {
      if (!active.current || ticket !== request.current || observed !== revision.current) return;
      publish({ status: 'unavailable', policy: null, saving: false, feedback: null });
    }
  }, [publish]);

  useEffect(() => {
    active.current = true;
    const unsubscribe = subscribeToSettingsChanges((settings) => {
      const prior = stateRef.current;
      const samePolicy =
        prior.policy !== null &&
        Object.keys(settings.localStoragePolicy).every(
          (key) =>
            settings.localStoragePolicy[key as keyof LocalStoragePolicy] ===
            prior.policy?.[key as keyof LocalStoragePolicy]
        );
      revision.current += 1;
      pending.current = null;
      publish({
        status: 'ready',
        policy: settings.localStoragePolicy,
        saving: saving.current,
        feedback: samePolicy ? prior.feedback : null,
      });
    });
    void reload();
    return () => {
      active.current = false;
      request.current += 1;
      unsubscribe();
    };
  }, [publish, reload]);

  useEffect(() => {
    if (state.feedback !== 'saved') return;
    const timeout = window.setTimeout(() => {
      if (stateRef.current.feedback === 'saved') {
        publish({ ...stateRef.current, feedback: null });
      }
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [state.feedback, publish]);

  const commit = useCallback(
    async (patch: Partial<LocalStoragePolicy>, sourceRevision: number) => {
      const base = stateRef.current.policy;
      if (!active.current || !base || saving.current || sourceRevision !== revision.current) return;
      saving.current = true;
      pending.current = { patch, revision: sourceRevision };
      publish({ ...stateRef.current, saving: true, feedback: null });
      try {
        const settings = await patchLocalStoragePolicy(patch, base);
        if (!active.current) return;
        if (revision.current === sourceRevision) {
          publish({
            status: 'ready',
            policy: settings.localStoragePolicy,
            saving: false,
            feedback: 'saved',
          });
        } else if (
          stateRef.current.policy?.trashCleanupEnabled ===
            settings.localStoragePolicy.trashCleanupEnabled &&
          stateRef.current.policy?.trashRetentionDays ===
            settings.localStoragePolicy.trashRetentionDays
        ) {
          publish({ ...stateRef.current, saving: false, feedback: 'saved' });
        }
        pending.current = null;
      } catch (error) {
        if (!active.current) return;
        if (error instanceof StaleLocalStoragePolicyError) {
          pending.current = null;
          void reload();
        } else if (sourceRevision === revision.current) {
          publish({ ...stateRef.current, saving: false, feedback: 'error' });
        }
      } finally {
        saving.current = false;
        if (active.current && stateRef.current.saving) {
          publish({ ...stateRef.current, saving: false });
        }
      }
    },
    [publish, reload]
  );

  const onChange = useCallback(
    (patch: Partial<LocalStoragePolicy>) => {
      if (stateRef.current.status !== 'ready') return;
      void commit(patch, revision.current);
    },
    [commit]
  );

  const onRetry = useCallback(() => {
    if (stateRef.current.status === 'unavailable') {
      void reload();
      return;
    }
    const retry = pending.current;
    if (retry && retry.revision === revision.current) void commit(retry.patch, retry.revision);
  }, [commit, reload]);

  return { ...state, onChange, onRetry };
}
