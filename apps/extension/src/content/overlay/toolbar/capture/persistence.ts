import { useRef } from 'react';
import type { CaptureActionType } from '../../../../contracts/settings';
import { createLogger } from '@sniptale/platform/observability/logger';
import { patchSettings } from '../../../../composition/persistence/settings';

const logger = createLogger({ namespace: 'ContentToolbarCaptureAction' });

/**
 * Persists the selected post-capture action without leaking storage code into the UI shell.
 */
export function useCaptureActionPersistence(
  captureAction: CaptureActionType,
  onCaptureActionChange: (action: CaptureActionType) => void,
  closeMenus: (except?: 'capture' | 'timer' | 'viewport' | null) => void,
  onCaptureActionCommitted?: (action: CaptureActionType) => Promise<void> | void
) {
  const persistenceRequestIdRef = useRef(0);
  return async (action: CaptureActionType) => {
    const requestId = persistenceRequestIdRef.current + 1;
    persistenceRequestIdRef.current = requestId;
    onCaptureActionChange(action);
    closeMenus(null);

    try {
      await onCaptureActionCommitted?.(action);
      if (persistenceRequestIdRef.current !== requestId) {
        return;
      }
      await patchSettings({ captureAction: action });
    } catch (error) {
      if (persistenceRequestIdRef.current === requestId) {
        onCaptureActionChange(captureAction);
      }
      logger.error('Failed to save capture action', error);
    }
  };
}
