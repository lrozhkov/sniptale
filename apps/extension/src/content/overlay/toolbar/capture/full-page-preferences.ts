import { useEffect, useSyncExternalStore } from 'react';
import {
  DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES,
  type FullPageCapturePreferences,
} from '../../../../contracts/full-page-capture';
import { pageCapturePreferences } from '../../../application/capture-preferences';

export function useFullPageCapturePreferences() {
  const snapshot = useSyncExternalStore(pageCapturePreferences.subscribe, () =>
    pageCapturePreferences.read('full')
  );
  useEffect(() => {
    void pageCapturePreferences.load().catch(() => undefined);
  }, []);
  return {
    preferences: snapshot.fullPageCapture ?? DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES,
    saving: false,
    updatePreferences: async (patch: Partial<FullPageCapturePreferences>) => {
      pageCapturePreferences.update('full', { fullPageCapture: patch });
    },
  };
}
