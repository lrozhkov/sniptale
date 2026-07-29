import { useCallback, useEffect, useRef, useState } from 'react';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { loadSettings, patchSettings } from '../../../../composition/persistence/settings';
import { translate } from '../../../../platform/i18n';
import {
  DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES,
  type FullPageCapturePreferences,
} from '../../../../contracts/full-page-capture';

export function useFullPageCapturePreferences() {
  const [preferences, setPreferences] = useState<FullPageCapturePreferences>({
    ...DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES,
  });
  const [saving, setSaving] = useState(false);
  const mountedRef = useRef(true);
  const mutationVersionRef = useRef(0);
  const mutationQueueRef = useRef(Promise.resolve());
  const preferencesRef = useRef(preferences);
  const persistedPreferencesRef = useRef(preferences);

  useEffect(() => {
    mountedRef.current = true;
    const loadVersion = mutationVersionRef.current;
    void loadSettings()
      .then((settings) => {
        if (!mountedRef.current || mutationVersionRef.current !== loadVersion) return;
        const normalized = {
          ...DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES,
          ...settings.fullPageCapture,
        };
        preferencesRef.current = normalized;
        persistedPreferencesRef.current = normalized;
        setPreferences(normalized);
      })
      .catch(() => undefined);
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const updatePreferences = useCallback(async (patch: Partial<FullPageCapturePreferences>) => {
    const mutationVersion = mutationVersionRef.current + 1;
    mutationVersionRef.current = mutationVersion;
    const next = { ...preferencesRef.current, ...patch };
    preferencesRef.current = next;
    setPreferences(next);
    setSaving(true);
    const mutation = mutationQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          const persisted = await patchSettings({ fullPageCapture: patch });
          const normalized = {
            ...DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES,
            ...persisted.fullPageCapture,
          };
          persistedPreferencesRef.current = normalized;
          if (mountedRef.current && mutationVersionRef.current === mutationVersion) {
            preferencesRef.current = normalized;
            setPreferences(normalized);
          }
        } catch {
          if (mountedRef.current) {
            if (mutationVersionRef.current === mutationVersion) {
              preferencesRef.current = persistedPreferencesRef.current;
              setPreferences(persistedPreferencesRef.current);
            }
            showToast(translate('content.toolbar.fullPageSettingsSaveError'), 'error');
          }
        } finally {
          if (mountedRef.current && mutationVersionRef.current === mutationVersion) {
            setSaving(false);
          }
        }
      });
    mutationQueueRef.current = mutation;
    await mutation;
  }, []);

  return { preferences, saving, updatePreferences };
}
