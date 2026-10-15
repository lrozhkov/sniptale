import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_QUICK_PREVIEW_PREFERENCES,
  type QuickPreviewPreferences,
} from '../../features/video/preview/quick-preferences';
import {
  createQuickPreviewPreferencesStorage,
  type QuickPreviewPreferencesStorage,
} from '../../composition/persistence/quick-preview-preferences/storage';

type PreferenceStatus = 'loading' | 'ready' | 'saving' | 'session-only';

/** Session selection wins over delayed hydration; preferences never enter project history. */
export function useReviewPreviewPreferences(injected?: QuickPreviewPreferencesStorage) {
  const [storage] = useState(() => injected ?? createQuickPreviewPreferencesStorage());
  const [preferences, setPreferences] = useState<QuickPreviewPreferences>(() => ({
    ...DEFAULT_QUICK_PREVIEW_PREFERENCES,
  }));
  const [status, setStatus] = useState<PreferenceStatus>('loading');
  const selection = useRef(preferences);
  const revision = useRef(0);
  const lifetime = useRef(0);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const generation = ++lifetime.current;
    const requestedRevision = revision.current;
    const current = () =>
      mounted.current && lifetime.current === generation && revision.current === requestedRevision;
    void storage.load().then(
      (loaded) => {
        if (!current()) return;
        selection.current = loaded.preferences;
        setPreferences(loaded.preferences);
        setStatus('ready');
      },
      () => {
        if (current()) setStatus('session-only');
      }
    );
    return () => {
      mounted.current = false;
      lifetime.current += 1;
    };
  }, [storage]);

  const save = (next: QuickPreviewPreferences) => {
    if (!mounted.current) return;
    const requestedRevision = ++revision.current;
    const generation = lifetime.current;
    selection.current = next;
    setPreferences(next);
    setStatus('saving');
    const publish = (nextStatus: PreferenceStatus) => {
      if (
        mounted.current &&
        lifetime.current === generation &&
        revision.current === requestedRevision
      )
        setStatus(nextStatus);
    };
    try {
      void storage.save(next).then(
        () => publish('ready'),
        () => publish('session-only')
      );
    } catch {
      publish('session-only');
    }
  };

  return {
    preferences,
    status,
    change: (patch: Partial<QuickPreviewPreferences>) => save({ ...selection.current, ...patch }),
    reset: () => save({ ...DEFAULT_QUICK_PREVIEW_PREFERENCES }),
    retry: () => save({ ...selection.current }),
  };
}
