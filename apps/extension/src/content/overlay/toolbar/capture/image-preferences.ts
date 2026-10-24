import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScreenshotImageFormat } from '@sniptale/runtime-contracts/capture/action';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  patchSettings,
  subscribeToImagePreferencesChanges,
} from '../../../../composition/persistence/settings';
import { translate } from '../../../../platform/i18n';

type ImagePreferences = { imageFormat: ScreenshotImageFormat; imageQuality: number };

/** Edit the canonical screenshot output preferences and observe other settings writers. */
export function useToolbarImagePreferences() {
  const [preferences, setPreferences] = useState<ImagePreferences>({
    imageFormat: DEFAULT_SETTINGS.imageFormat,
    imageQuality: DEFAULT_SETTINGS.imageQuality,
  });
  const [saving, setSaving] = useState(false);
  const mountedRef = useRef(false);
  const revisionRef = useRef(0);
  const pendingRef = useRef(0);
  const queueRef = useRef(Promise.resolve());

  useEffect(() => {
    mountedRef.current = true;
    const unsubscribe = subscribeToImagePreferencesChanges((next) => {
      revisionRef.current += 1;
      setPreferences(next);
    });
    const revision = revisionRef.current;
    void loadSettings()
      .then((settings) => {
        if (mountedRef.current && revisionRef.current === revision) {
          setPreferences({
            imageFormat: settings.imageFormat,
            imageQuality: settings.imageQuality,
          });
        }
      })
      .catch(() => undefined);
    return () => {
      mountedRef.current = false;
      revisionRef.current += 1;
      unsubscribe();
    };
  }, []);

  const updatePreferences = useCallback(async (patch: Partial<ImagePreferences>) => {
    revisionRef.current += 1;
    pendingRef.current += 1;
    setSaving(true);
    const mutation = queueRef.current.then(async () => {
      const revision = revisionRef.current;
      try {
        const settings = await patchSettings(patch);
        // A storage notification can contain a later commit than this response.
        if (mountedRef.current && revisionRef.current === revision) {
          setPreferences({
            imageFormat: settings.imageFormat,
            imageQuality: settings.imageQuality,
          });
        }
      } catch {
        if (mountedRef.current) {
          showToast(translate('content.toolbar.fullPageSettingsSaveError'), 'error');
        }
      } finally {
        pendingRef.current -= 1;
        if (mountedRef.current) setSaving(pendingRef.current > 0);
      }
    });
    queueRef.current = mutation;
    await mutation;
  }, []);

  return { ...preferences, saving, updatePreferences };
}
