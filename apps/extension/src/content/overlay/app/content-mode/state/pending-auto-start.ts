import { useCallback, useState } from 'react';
import type { ContentPrivilegedActionIntentSource } from '../../../../application/privileged-action-intent';
import type { ScreenshotStartContext } from '../../../screenshot/types';

export type PendingAutoStartCapture = {
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined;
  startContext?: ScreenshotStartContext | undefined;
  type: 'visible' | 'full' | 'selection';
};

export function usePendingAutoStartCaptureState() {
  const [pendingAutoStartCapture, setPendingAutoStartCapture] =
    useState<PendingAutoStartCapture | null>(null);
  const clearPendingAutoStartCapture = useCallback(() => {
    setPendingAutoStartCapture(null);
  }, []);
  const queueAutoStartCapture = useCallback(
    (
      type: 'visible' | 'full' | 'selection',
      contentIntentSource?: ContentPrivilegedActionIntentSource | undefined,
      startContext?: ScreenshotStartContext | undefined
    ) => {
      setPendingAutoStartCapture({
        ...(contentIntentSource === undefined ? {} : { contentIntentSource }),
        ...(startContext === undefined ? {} : { startContext }),
        type,
      });
    },
    []
  );

  return {
    clearPendingAutoStartCapture,
    pendingAutoStartCapture,
    queueAutoStartCapture,
  };
}
