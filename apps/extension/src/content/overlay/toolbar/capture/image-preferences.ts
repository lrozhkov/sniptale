import { useEffect, useSyncExternalStore } from 'react';
import type { ScreenshotImagePreferences } from '../../../../contracts/settings';
import { pageCapturePreferences } from '../../../application/capture-preferences';

/** Edits the current document workflow without changing persistent defaults. */
export function useToolbarImagePreferences(workflow: 'visible' | 'full' = 'visible') {
  const preferences = useSyncExternalStore(pageCapturePreferences.subscribe, () =>
    pageCapturePreferences.read(workflow)
  );
  useEffect(() => {
    void pageCapturePreferences.load().catch(() => undefined);
  }, []);
  return {
    imageFormat: preferences.imageFormat,
    imageQuality: preferences.imageQuality,
    saving: false,
    updatePreferences: async (patch: Partial<ScreenshotImagePreferences>) => {
      pageCapturePreferences.update(workflow, patch);
    },
  };
}
